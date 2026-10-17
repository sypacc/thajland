"""Hlavní běh: sken (dotazy na zdroje) + finalizace (sloučení, příznaky, prodejci, hlášení, uložení).

    python -m scanner.run                         # sken + finalizace v jednom procesu (lokálně)
    python -m scanner.run --limit 5               # rychlý test
    python -m scanner.run --origin PRG --partial-out data/partial/PRG.json   # jen sken části plánu
    python -m scanner.run --merge "data/partial/*.json"                      # jen finalizace z částí
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import logging
import random
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from . import alerts as alerts_mod
from . import storage
from . import watchlist as watch_mod
from .config import Config, load_config
from .model import Offer
from .scoring import rank, score_offer
from .sources import azair, google_flights

log = logging.getLogger("thajland")


def booking_horizon(cfg: Config, today: dt.date) -> dt.date:
    """Poslední datum, pro které aerolinky/GDS typicky už prodávají (výchozí 330 dní dopředu)."""
    days = int(cfg.scan.get("booking_horizon_days", 330))
    return today + dt.timedelta(days=days)


def _compact(o: dict[str, Any]) -> dict[str, Any]:
    return {"price": o["price"], "score": o.get("score"), "airlines": o.get("airlines", []), "stops": o.get("stops"),
            "route": o.get("route"), "duration_min": o.get("duration_min"),
            "dep_time": o["legs"][0]["departure"] if o.get("legs") else None}


# --------------------------------------------------------------------------- sken
def scan(cfg: Config, *, limit: int | None = None, only_source: str | None = None, shuffle: bool = True,
         only_route: str | None = None, only_origin: str | None = None) -> dict[str, Any]:
    """Projde (část) plánu a vrátí {"offers": [dict], "queries": [dict], "scan": {...}}."""
    started = time.monotonic()
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    sc = cfg.scan
    delay = float(sc.get("delay_seconds", 2.0))
    jitter = float(sc.get("jitter_seconds", 1.0))
    retries = int(sc.get("retries", 3))
    budget_s = float(sc.get("time_budget_minutes", 45)) * 60
    max_queries = int(sc.get("max_queries", 1000))
    keep = int(sc.get("keep_per_query", 6))
    pw_fallback = bool(sc.get("playwright_fallback", True))

    sources = [s for s in ("google", "azair") if cfg.source_enabled(s)]
    if only_source:
        sources = [only_source]

    plan = cfg.query_plan()
    if only_origin:
        plan = [p for p in plan if p[0] == only_origin.upper()]
    if only_route:
        o_, d_ = only_route.upper().split("-")
        plan = [p for p in plan if p[0] == o_ and p[1] == d_]
    if shuffle:
        random.Random(today).shuffle(plan)
    # priorita: 1) sledované lety, 2) termíny na hranici prodejního okna (otevírají se právě teď), 3) zbytek
    horizon0 = booking_horizon(cfg, dt.date.fromisoformat(today))
    watched = {watch_mod.watch_key(w["origin"], w["destination"], w["depart_date"], w["return_date"])
               for w in (watch_mod.normalize_entry(x) for x in watch_mod.load_watchlist().get("watch", [])) if w}
    def _prio(p):
        o_, d_, dep_, ret_ = p
        if watch_mod.watch_key(o_, d_, dep_.isoformat(), ret_.isoformat()) in watched:
            return 0
        if horizon0 - dt.timedelta(days=3) <= ret_ <= horizon0 + dt.timedelta(days=4):
            return 1
        return 2
    plan.sort(key=_prio)
    if limit:
        plan = plan[:limit]
    plan = plan[:max_queries]

    offers: list[dict[str, Any]] = []
    queries: list[dict[str, Any]] = []
    consecutive_blocked = 0
    google_disabled = False
    pw_not_found_confirmed = 0
    # po 3 potvrzených 'bez výsledků' na trase+měsíci už dotazy téže skupiny neopakujeme (šetří ~10 s/dotaz);
    # klíč zahrnuje měsíc odletu, aby prázdné září nebylo 'resetováno' úspěšným srpnem
    route_empty: dict[str, int] = {}
    horizon = booking_horizon(cfg, dt.date.fromisoformat(today))
    log.info("Prodejní okno: návraty do %s (%d dní); dotazy za oknem jen jedním pokusem",
             horizon, int(sc.get("booking_horizon_days", 330)))
    total = len(plan) * len(sources)
    done = 0
    log.info("Plán: %d dotazů × %d zdrojů = %d; rozpočet %.0f min", len(plan), len(sources), total, budget_s / 60)

    for (origin, dest, dep, ret) in plan:
        for src in sources:
            done += 1
            qrec: dict[str, Any] = {
                "origin": origin, "destination": dest, "depart_date": dep.isoformat(),
                "return_date": ret.isoformat(), "source": src, "status": None,
                "count": 0, "min_price": None, "best_score": None, "top": None,
                "fetched_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            if time.monotonic() - started > budget_s:
                qrec["status"] = "skipped_budget"; queries.append(qrec); continue
            if src == "google" and google_disabled:
                qrec["status"] = "skipped_blocked"; queries.append(qrec); continue

            found: list[Offer] = []
            rk = f"{origin}-{dest}-{dep.month}"
            beyond = ret > horizon
            qrec["beyond_horizon"] = beyond
            is_watched = watch_mod.watch_key(origin, dest, dep.isoformat(), ret.isoformat()) in watched
            frontier = horizon - dt.timedelta(days=3) <= ret <= horizon + dt.timedelta(days=4)
            if is_watched:
                qrec["watched"] = True
            if frontier:
                qrec["frontier"] = True
            try:
                if src == "google":
                    # za prodejním oknem stačí jeden pokus; uvnitř okna šetříme až po 3 prázdných v řadě (trasa+měsíc)
                    cheap = (beyond and not frontier and not is_watched) or (route_empty.get(rk, 0) >= 3 and not is_watched)
                    found, meta = google_flights.search(
                        origin, dest, dep, ret, currency=cfg.currency, cabin=cfg.cabin,
                        max_stops=cfg.max_stops, retries=1 if cheap else retries,
                        playwright_fallback=pw_fallback and not cheap,
                        playwright_on_not_found=pw_not_found_confirmed < 3 and not cheap,
                        retry_not_found=not cheap)
                    consecutive_blocked = 0
                    if (meta.get("not_found") and meta.get("method") == "playwright") or meta.get("zero_confirmed"):
                        pw_not_found_confirmed += 1
                    if not found:
                        route_empty[rk] = route_empty.get(rk, 0) + 1
                    else:
                        route_empty[rk] = max(0, route_empty.get(rk, 0) - 1)
                else:
                    found, meta = azair.search(origin, dest, dep, ret, currency=cfg.currency)
                qrec["status"] = "ok" if (found and not meta.get("error")) else "empty"
                qrec["url"] = meta.get("url"); qrec["error"] = meta.get("error"); qrec["method"] = meta.get("method")
            except google_flights.GoogleBlocked as e:
                consecutive_blocked += 1
                qrec["status"] = "error"; qrec["error"] = str(e)[:300]
                log.error("Google blokován/selhal (%d v řadě): %s", consecutive_blocked, e)
                if consecutive_blocked >= 6:
                    google_disabled = True
                    log.error("Google: 6 selhání v řadě – zbytek Google dotazů přeskočen.")
            except Exception as e:  # noqa: BLE001
                qrec["status"] = "error"; qrec["error"] = f"{type(e).__name__}: {e}"[:300]
                log.exception("Dotaz %s %s-%s %s selhal", src, origin, dest, dep)

            for o in found:
                score_offer(o, cfg.scoring)
            found = rank(found)[:keep]
            if found:
                dicts = [o.to_dict() for o in found]
                qrec["count"] = len(dicts)
                qrec["min_price"] = min(o["price"] for o in dicts)
                qrec["best_score"] = min(o["score"] for o in dicts if o.get("score") is not None)
                qrec["top"] = _compact(dicts[0])
                offers.extend(dicts)
            queries.append(qrec)
            log.info("[%d/%d] %s %s→%s %s..%s: %s (%d nabídek, min %s)", done, total, src, origin, dest, dep, ret,
                     qrec["status"], qrec["count"], qrec["min_price"])
            time.sleep(delay + random.random() * jitter)

    return {"offers": offers, "queries": queries,
            "scan": {"duration_s": int(time.monotonic() - started), "google_disabled": google_disabled,
                     "origin": only_origin, "day": today}}


# --------------------------------------------------------------------------- finalizace
def finalize(cfg: Config, parts: list[dict[str, Any]], *, enrich: bool = True) -> dict[str, Any]:
    """Sloučí části skenu, doplní stará data za chybějící dotazy, příznaky, prodejce a statistiky."""
    started = time.monotonic()
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    offers: list[dict[str, Any]] = []
    queries: list[dict[str, Any]] = []
    duration = 0
    google_disabled = False
    for p in parts:
        offers.extend(p.get("offers", []))
        queries.extend(p.get("queries", []))
        duration = max(duration, int(p.get("scan", {}).get("duration_s", 0)))
        google_disabled = google_disabled or bool(p.get("scan", {}).get("google_disabled"))

    previous = storage.load_latest() or {}
    prev_queries = {storage.query_key(q): q for q in previous.get("queries", [])}
    prev_offers_by_q: dict[str, list[dict[str, Any]]] = {}
    for o in previous.get("offers", []):
        prev_offers_by_q.setdefault(storage.query_key(o), []).append(o)

    history = [h for h in storage.load_history() if h.get("day") != today]
    minima = storage.all_time_minima(history)
    yesterday: dict[str, int] = {}
    if history:
        for r in history[-1].get("records", []):
            if r.get("min") is not None:
                yesterday[f"{r['o']}|{r['d']}|{r['dep']}|{r['ret']}|{r['src']}"] = r["min"]
    seen_keys = set(minima.keys())
    seen_routes = {k.split("|")[0] + "-" + k.split("|")[1] for k in seen_keys}

    # dotazy, které dnes neproběhly / selhaly: převzít poslední známý výsledek jako 'stale'
    carried = 0
    for i, q in enumerate(queries):
        # neproběhlé/selhané dotazy, nebo 'prázdný' dotaz uvnitř prodejního okna, který minule nabídky měl
        # (Google občas vrátí dočasně prázdnou stránku) -> převzít poslední známý výsledek jako 'stale'
        if q["status"] in ("skipped_budget", "skipped_blocked", "error") or \
                (q["status"] == "empty" and not q.get("beyond_horizon")):
            pq = prev_queries.get(storage.query_key(q))
            if pq and pq.get("status") == "ok" and not pq.get("stale_days", 0) >= 3:
                stale_q = dict(pq, stale=True, status="ok", stale_reason=q["status"],
                               stale_days=int(pq.get("stale_days", 0)) + 1, beyond_horizon=q.get("beyond_horizon"))
                queries[i] = stale_q
                for po in prev_offers_by_q.get(storage.query_key(q), []):
                    offers.append(dict(po, stale=True))
                carried += 1

    # příznaky na nabídkách
    for o in offers:
        qk = storage.query_key(o)
        o["yesterday_min"] = yesterday.get(qk)
        o["all_time_min"] = minima.get(qk, {}).get("min")
        o["is_all_time_low"] = (o["price"] <= o["all_time_min"]) if o["all_time_min"] is not None else None
        o["stale"] = bool(o.get("stale"))
        # nově v prodeji: termín (nebo celá trasa) se v historii (>=3 běhy) nikdy neobjevil
        o["is_new"] = bool(len(history) >= 3 and qk not in seen_keys and not o["stale"])
        o["is_new_route"] = bool(o["is_new"] and f"{o['origin']}-{o['destination']}" not in seen_routes)
    for q in queries:
        if q.get("status") == "ok" and q.get("count"):
            qk = storage.query_key(q)
            q["all_time_min"] = minima.get(qk, {}).get("min")
            q["yesterday_min"] = yesterday.get(qk)
            q["is_new"] = bool(len(history) >= 3 and qk not in seen_keys and not q.get("stale"))

    # prodejci pro nejlepší dealy
    sc = cfg.scan
    enrich_n = int(sc.get("enrich_sellers_top", 0)) if (enrich and sc.get("enrich_sellers")) else 0
    if enrich_n and not google_disabled and offers:
        _enrich_sellers(offers, enrich_n, 900)

    # zeštíhlení výstupu: konstantní poznámka a odvoditelné odkazy (Kiwi, Skyscanner, …) se v dashboardu dopočítají
    for o in offers:
        o.pop("note", None)
        if isinstance(o.get("links"), dict) and "google" in o["links"]:
            o["links"] = {"google": o["links"]["google"]}

    # sledované lety (ruční piny + automatické top dealy)
    wl = watch_mod.load_watchlist()
    wd = watch_mod.load_watch_data()
    watch_items = watch_mod.evaluate(wl, {"day": today, "offers": offers}, wd)
    watched_keys = {w["key"] for w in watch_items}
    for o in offers:
        o["watched"] = watch_mod.watch_key(o["origin"], o["destination"], o["depart_date"], o["return_date"]) in watched_keys

    ok = [q for q in queries if q["status"] == "ok" and not q.get("stale")]
    prices = [q["min_price"] for q in queries if q.get("min_price")]
    stats = {
        "queries_total": len(queries), "queries_ok": len(ok),
        "queries_error": sum(1 for q in queries if q["status"] == "error"),
        "queries_skipped": sum(1 for q in queries if str(q["status"]).startswith("skipped")),
        "queries_stale": carried, "queries_new": sum(1 for q in queries if q.get("is_new")),
        "offers": len(offers),
        "min_price": min(prices) if prices else None,
        "median_min_price": int(statistics.median(prices)) if prices else None,
        "duration_s": duration + int(time.monotonic() - started),
        "google_disabled": google_disabled, "parts": len(parts),
    }
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "day": today,
        "config": {
            "origins": cfg.origins, "destinations": cfg.destinations,
            "depart_from": cfg.depart_from.isoformat(), "depart_to": cfg.depart_to.isoformat(),
            "depart_step_days": cfg.depart_step_days, "trip_lengths": cfg.trip_lengths,
            "travelers": cfg.travelers, "currency": cfg.currency, "cabin": cfg.cabin,
            "max_stops": cfg.max_stops, "sources": [s for s in ("google", "azair") if cfg.source_enabled(s)],
            "scoring": cfg.scoring, "alerts": {"target_price": cfg.raw.get("alerts", {}).get("target_price")},
        },
        "stats": stats, "queries": queries, "offers": offers,
        "booking_horizon": booking_horizon(cfg, dt.date.fromisoformat(today)).isoformat(),
        "watch": watch_items, "_watchlist": wl, "_watch_data": wd,
    }


def _enrich_sellers(offers: list[dict[str, Any]], n: int, budget_s: float) -> None:
    fresh = [o for o in offers if o["source"] == "google" and not o.get("stale") and o.get("score") is not None]
    fresh.sort(key=lambda o: o["score"])
    seen: set[tuple] = set()
    picked = []
    for o in fresh:
        key = (o["depart_date"], o["price"], tuple(o.get("airlines") or []), o["route"])
        if key in seen:
            continue
        seen.add(key); picked.append(o)
        if len(picked) >= n:
            break
    t0 = time.monotonic()
    for o in picked:
        if time.monotonic() - t0 > budget_s:
            break
        try:
            sellers, err, insight = google_flights.fetch_sellers(o["links"]["google"], o["price"],
                                                                 (o.get("airlines") or [None])[0])
        except Exception as e:  # noqa: BLE001
            sellers, err, insight = [], f"{type(e).__name__}: {e}", None
        o["sellers"] = sellers; o["sellers_error"] = err
        if insight:
            o["price_insight"] = insight
        log.info("Prodejci %s %s %s: %s | insight %s", o["route"], o["depart_date"], o["price"],
                 ", ".join(f"{x['name']} {x['price']}" for x in sellers) or err, insight)
        time.sleep(8 + random.random() * 4)


def save_all(cfg: Config, payload: dict[str, Any], *, notify: bool = True) -> None:
    history = [h for h in storage.load_history() if h.get("day") != payload["day"]]
    existing = alerts_mod.load_alerts()
    new_alerts = alerts_mod.detect(payload, history, cfg.raw.get("alerts", {}), existing)
    payload["alerts_today"] = new_alerts
    log.info("Hlášení: %d nových", len(new_alerts))
    for a in new_alerts:
        log.info("  %s %s %s→%s %s: %s", a["kind_label"], a["price"], a["origin"], a["destination"],
                 a["depart_date"], a["reason"])
    wl = payload.pop("_watchlist", None); wd = payload.pop("_watch_data", None)
    if wl is not None:
        watch_mod.save_watchlist(wl)
    if wd is not None:
        watch_mod.save_watch_data(wd)
    storage.save_latest(payload)
    storage.save_history_snapshot(payload["day"], payload["queries"])
    storage.save_series(storage.build_series(storage.load_history()))
    alerts_mod.save_alerts(existing + new_alerts)
    if new_alerts and notify:
        alerts_mod.notify(new_alerts, payload, cfg.raw.get("alerts", {}).get("channels", {}))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Thajland – sken cen letenek")
    ap.add_argument("--config", default=None)
    ap.add_argument("--limit", type=int, default=None, help="max. počet dotazů (test)")
    ap.add_argument("--source", default=None, choices=["google", "azair"])
    ap.add_argument("--no-shuffle", action="store_true")
    ap.add_argument("--route", default=None, help="jen jedna trasa, např. PRG-HKT (diagnostika)")
    ap.add_argument("--origin", default=None, help="jen jedno odletové letiště (paralelní běhy)")
    ap.add_argument("--max-stops", default=None, help="přepsat trip.max_stops (číslo nebo 'none')")
    ap.add_argument("--partial-out", default=None, help="jen sken: uložit část výsledků do JSON a skončit")
    ap.add_argument("--merge", default=None, help="jen finalizace: glob na částečné JSONy")
    ap.add_argument("--no-enrich", action="store_true", help="nenačítat prodejce")
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--no-notify", action="store_true", help="hlášení jen uložit, neposílat")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config)
    if args.max_stops is not None:
        cfg.raw["trip"]["max_stops"] = None if str(args.max_stops).lower() == "none" else int(args.max_stops)

    if args.merge:
        parts = []
        for f in sorted(glob.glob(args.merge)):
            parts.append(json.loads(Path(f).read_text(encoding="utf-8")))
            log.info("část %s: %d dotazů, %d nabídek", f, len(parts[-1]["queries"]), len(parts[-1]["offers"]))
        if not parts:
            log.error("Žádné části k finalizaci (%s)", args.merge)
            return 2
    else:
        part = scan(cfg, limit=args.limit, only_source=args.source, shuffle=not args.no_shuffle,
                    only_route=args.route, only_origin=args.origin)
        log.info("Sken hotov: %d dotazů, %d nabídek, %d s", len(part["queries"]), len(part["offers"]),
                 part["scan"]["duration_s"])
        if args.partial_out:
            p = Path(args.partial_out); p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(part, ensure_ascii=False), encoding="utf-8")
            log.info("Část uložena: %s", p)
            return 0
        parts = [part]

    payload = finalize(cfg, parts, enrich=not args.no_enrich)
    st = payload["stats"]
    log.info("Hotovo: %s", st)
    if args.no_save:
        return 0
    save_all(cfg, payload, notify=not args.no_notify)
    return 0 if st["queries_ok"] or st["queries_stale"] else 2


if __name__ == "__main__":
    sys.exit(main())

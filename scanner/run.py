"""Hlavní běh: projde plán dotazů, ohodnotí nabídky a uloží data pro dashboard.

    python -m scanner.run                # plný běh dle config.yaml
    python -m scanner.run --limit 5      # rychlý test (prvních 5 dotazů)
    python -m scanner.run --source google
"""
from __future__ import annotations

import argparse
import datetime as dt
import logging
import random
import statistics
import sys
import time
from typing import Any

from . import alerts as alerts_mod
from . import storage
from .config import Config, load_config
from .model import Offer
from .scoring import rank, score_offer
from .sources import azair, google_flights

log = logging.getLogger("thajland")


def _compact(o: Offer) -> dict[str, Any]:
    return {
        "price": o.price, "score": o.score, "airlines": o.airlines, "stops": o.stops,
        "route": o.route, "duration_min": o.duration_min,
        "dep_time": o.legs[0].departure if o.legs else None,
    }


def run(cfg: Config, *, limit: int | None = None, only_source: str | None = None,
        shuffle: bool = True) -> dict[str, Any]:
    started = time.monotonic()
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    scan = cfg.scan
    delay = float(scan.get("delay_seconds", 2.0))
    jitter = float(scan.get("jitter_seconds", 1.0))
    retries = int(scan.get("retries", 3))
    budget_s = float(scan.get("time_budget_minutes", 45)) * 60
    max_queries = int(scan.get("max_queries", 400))
    keep = int(scan.get("keep_per_query", 6))
    pw_fallback = bool(scan.get("playwright_fallback", True))

    sources = [s for s in ("google", "azair") if cfg.source_enabled(s)]
    if only_source:
        sources = [s for s in sources if s == only_source] or [only_source]

    plan = cfg.query_plan()
    if shuffle:
        # jiné pořadí každý den => při vyčerpání rozpočtu se střídá, co se stihne
        random.Random(today).shuffle(plan)
    if limit:
        plan = plan[:limit]
    plan = plan[:max_queries]

    previous = storage.load_latest() or {}
    prev_queries = {storage.query_key(q): q for q in previous.get("queries", [])}
    prev_offers_by_q: dict[str, list[dict[str, Any]]] = {}
    for o in previous.get("offers", []):
        prev_offers_by_q.setdefault(storage.query_key(o), []).append(o)

    history = storage.load_history()
    history = [h for h in history if h.get("day") != today]  # dnešek případně přepíšeme
    minima = storage.all_time_minima(history)
    yesterday_snap = history[-1] if history else None
    yesterday: dict[str, int] = {}
    if yesterday_snap:
        for r in yesterday_snap.get("records", []):
            if r.get("min") is not None:
                yesterday[f"{r['o']}|{r['d']}|{r['dep']}|{r['ret']}|{r['src']}"] = r["min"]

    offers: list[Offer] = []
    queries: list[dict[str, Any]] = []
    consecutive_blocked = 0
    google_disabled = False
    pw_not_found_confirmed = 0   # kolikrát Chromium potvrdilo 'bez výsledků' => dál už ho na to nevoláme
    total = len(plan) * len(sources)
    done = 0

    log.info("Plán: %d dotazů × %d zdrojů = %d; rozpočet %.0f min", len(plan), len(sources),
             total, budget_s / 60)

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
                qrec["status"] = "skipped_budget"
                queries.append(qrec)
                continue
            if src == "google" and google_disabled:
                qrec["status"] = "skipped_blocked"
                queries.append(qrec)
                continue

            found: list[Offer] = []
            try:
                if src == "google":
                    found, meta = google_flights.search(
                        origin, dest, dep, ret, currency=cfg.currency, cabin=cfg.cabin,
                        max_stops=cfg.max_stops, retries=retries,
                        playwright_fallback=pw_fallback,
                        playwright_on_not_found=pw_not_found_confirmed < 3)
                    consecutive_blocked = 0
                    if meta.get("not_found") and meta.get("method") == "playwright":
                        pw_not_found_confirmed += 1
                else:
                    found, meta = azair.search(origin, dest, dep, ret, currency=cfg.currency)
                qrec["status"] = "ok" if (found and not meta.get("error")) else "empty"
                qrec["url"] = meta.get("url")
                qrec["error"] = meta.get("error")
                qrec["method"] = meta.get("method")
            except google_flights.GoogleBlocked as e:
                consecutive_blocked += 1
                qrec["status"] = "error"
                qrec["error"] = str(e)[:300]
                log.error("Google blokován/selhal (%d v řadě): %s", consecutive_blocked, e)
                if consecutive_blocked >= 6:
                    google_disabled = True
                    log.error("Google: 6 selhání v řadě – zbytek Google dotazů přeskočen.")
            except Exception as e:  # noqa: BLE001
                qrec["status"] = "error"
                qrec["error"] = f"{type(e).__name__}: {e}"[:300]
                log.exception("Dotaz %s %s-%s %s selhal", src, origin, dest, dep)

            for o in found:
                score_offer(o, cfg.scoring)
            found = rank(found)[:keep]
            qk = storage.query_key(qrec)
            if found:
                qrec["count"] = len(found)
                qrec["min_price"] = min(o.price for o in found)
                qrec["best_score"] = min(o.score for o in found if o.score is not None)
                qrec["top"] = _compact(found[0])
                prev_min = minima.get(qk, {}).get("min")
                qrec["all_time_min"] = prev_min
                qrec["yesterday_min"] = yesterday.get(qk)
                offers.extend(found)
            queries.append(qrec)
            log.info("[%d/%d] %s %s→%s %s..%s: %s (%d nabídek, min %s)", done, total, src,
                     origin, dest, dep, ret, qrec["status"], qrec["count"], qrec["min_price"])
            time.sleep(delay + random.random() * jitter)

    # Dotazy, které se dnes nestihly / selhaly: přeneseme včerejší výsledek jako "stale"
    carried = 0
    for q in queries:
        if q["status"] in ("skipped_budget", "skipped_blocked", "error"):
            pq = prev_queries.get(storage.query_key(q))
            if pq and pq.get("status") == "ok":
                stale_q = dict(pq)
                stale_q["stale"] = True
                stale_q["status"] = "ok"
                stale_q["stale_reason"] = q["status"]
                q.clear()
                q.update(stale_q)
                for po in prev_offers_by_q.get(storage.query_key(q), []):
                    po = dict(po)
                    po["stale"] = True
                    offers.append(_offer_from_dict(po))
                carried += 1

    # Flagy na nabídkách (vs. včera / historické minimum)
    offer_dicts = []
    for o in offers:
        d = o.to_dict()
        qk = storage.query_key(d)
        d["yesterday_min"] = yesterday.get(qk)
        d["all_time_min"] = minima.get(qk, {}).get("min")
        d["is_all_time_low"] = (o.price <= d["all_time_min"]) if d["all_time_min"] is not None else None
        d["stale"] = bool(getattr(o, "_stale", False))
        offer_dicts.append(d)

    # Experimentální: prodejci (aerolinka / cestovky) pro nejlepší dealy
    enrich_n = int(scan.get("enrich_sellers_top", 0)) if scan.get("enrich_sellers") else 0
    if enrich_n and not google_disabled and offer_dicts:
        _enrich_sellers(offer_dicts, enrich_n, budget_s - (time.monotonic() - started))

    ok = [q for q in queries if q["status"] == "ok" and not q.get("stale")]
    prices = [q["min_price"] for q in queries if q.get("min_price")]
    stats = {
        "queries_total": len(queries), "queries_ok": len(ok),
        "queries_error": sum(1 for q in queries if q["status"] == "error"),
        "queries_skipped": sum(1 for q in queries if str(q["status"]).startswith("skipped")),
        "queries_stale": carried,
        "offers": len(offer_dicts),
        "min_price": min(prices) if prices else None,
        "median_min_price": int(statistics.median(prices)) if prices else None,
        "duration_s": int(time.monotonic() - started),
        "google_disabled": google_disabled,
    }
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "day": today,
        "config": {
            "origins": cfg.origins, "destinations": cfg.destinations,
            "depart_from": cfg.depart_from.isoformat(), "depart_to": cfg.depart_to.isoformat(),
            "depart_step_days": cfg.depart_step_days, "trip_lengths": cfg.trip_lengths,
            "travelers": cfg.travelers, "currency": cfg.currency, "cabin": cfg.cabin,
            "max_stops": cfg.max_stops, "sources": sources, "scoring": cfg.scoring,
        },
        "stats": stats,
        "queries": queries,
        "offers": offer_dicts,
    }
    return payload


def _enrich_sellers(offer_dicts: list[dict[str, Any]], n: int, remaining_s: float) -> None:
    if remaining_s < 120:
        log.info("Prodejci: přeskočeno (vyčerpaný časový rozpočet)")
        return
    fresh = [o for o in offer_dicts if o["source"] == "google" and not o.get("stale") and o.get("score") is not None]
    fresh.sort(key=lambda o: o["score"])
    seen: set[tuple] = set()
    picked = []
    for o in fresh:
        key = (o["depart_date"], o["return_date"], o["price"], tuple(o.get("airlines") or []), o["route"])
        if key in seen:
            continue
        seen.add(key)
        picked.append(o)
        if len(picked) >= n:
            break
    t0 = time.monotonic()
    for o in picked:
        if time.monotonic() - t0 > min(remaining_s - 60, 600):
            break
        try:
            sellers, err, insight = google_flights.fetch_sellers(o["links"]["google"], o["price"],
                                                                 (o.get("airlines") or [None])[0])
        except Exception as e:  # noqa: BLE001
            sellers, err, insight = [], f"{type(e).__name__}: {e}", None
        o["sellers"] = sellers
        o["sellers_error"] = err
        if insight:
            o["price_insight"] = insight
        log.info("Prodejci %s %s %s: %s | insight %s", o["route"], o["depart_date"], o["price"],
                 ", ".join(f"{x['name']} {x['price']}" for x in sellers) or err, insight)
        time.sleep(8 + random.random() * 4)   # šetrně – Google jinak vrací 'něco se pokazilo'


def _offer_from_dict(d: dict[str, Any]) -> Offer:
    from .model import Layover, Leg
    o = Offer(
        source=d["source"], origin=d["origin"], destination=d["destination"],
        depart_date=d["depart_date"], return_date=d["return_date"], nights=d["nights"],
        price=d["price"], currency=d["currency"], airlines=d.get("airlines", []),
        stops=d.get("stops", 0),
        legs=[Leg(**l) for l in d.get("legs", [])],
        layovers=[Layover(**l) for l in d.get("layovers", [])],
        duration_min=d.get("duration_min"), layover_total_min=d.get("layover_total_min", 0),
        note=d.get("note"), links=d.get("links", {}), score=d.get("score"),
        score_breakdown=d.get("score_breakdown", {}), fetched_at=d.get("fetched_at"),
    )
    o._stale = True  # type: ignore[attr-defined]
    return o


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Thajland – sken cen letenek")
    ap.add_argument("--config", default=None)
    ap.add_argument("--limit", type=int, default=None, help="max. počet dotazů (test)")
    ap.add_argument("--source", default=None, choices=["google", "azair"])
    ap.add_argument("--no-shuffle", action="store_true")
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--no-notify", action="store_true", help="hlášení jen uložit, neposílat")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config)
    payload = run(cfg, limit=args.limit, only_source=args.source, shuffle=not args.no_shuffle)
    st = payload["stats"]
    log.info("Hotovo: %s", st)

    if args.no_save:
        return 0
    # Hlášení (dealy) – počítá se proti historii BEZ dnešního dne
    history = [h for h in storage.load_history() if h.get("day") != payload["day"]]
    existing = alerts_mod.load_alerts()
    new_alerts = alerts_mod.detect(payload, history, cfg.raw.get("alerts", {}), existing)
    payload["alerts_today"] = new_alerts
    log.info("Hlášení: %d nových", len(new_alerts))
    for a in new_alerts:
        log.info("  %s %s %s→%s %s: %s", a["kind_label"], a["price"], a["origin"], a["destination"],
                 a["depart_date"], a["reason"])

    storage.save_latest(payload)
    storage.save_history_snapshot(payload["day"], payload["queries"])
    storage.save_series(storage.build_series(storage.load_history()))
    alerts_mod.save_alerts(existing + new_alerts)
    if new_alerts and not args.no_notify:
        alerts_mod.notify(new_alerts, payload, cfg.raw.get("alerts", {}).get("channels", {}))
    # Neúspěch celého běhu = vůbec žádná data (např. blokace). Jinak 0.
    return 0 if st["queries_ok"] or st["queries_stale"] else 2


if __name__ == "__main__":
    sys.exit(main())

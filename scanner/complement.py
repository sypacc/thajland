"""Doplňkový sken: druhý průchod z jiného prostředí (Claude rutina), sjednocený s ranním během z GitHubu.

Ranní běh v GitHub Actions občas narazí: Google některé dotazy zablokuje, vrátí dočasně
prázdnou stránku, dojde časový rozpočet. Tenhle režim vezme dnešní `data/latest.json`,
vybere jen dotazy, které za to stojí (selhané, prázdné uvnitř prodejního okna, převzaté
ze staršího běhu, sledované lety a hranici prodejního okna), zopakuje je a výsledek
konzervativně sloučí: nový výsledek nahradí starý jen tehdy, když je lepší (má nabídky,
nebo původní dotaz žádné neměl). Pak se přepočítají příznaky, sledované lety, historie
dne, série i hlášení – stejně jako po ranním běhu.
"""
from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Callable

from . import storage
from .config import Config
from .watchlist import load_watchlist, normalize_entry, watch_key

log = logging.getLogger("thajland.complement")

Reason = str


def plan_key(q: dict[str, Any]) -> str:
    """Klíč dotazu bez zdroje – stejný tvar používá scan(only_keys=...)."""
    return f"{q['origin']}|{q['destination']}|{q['depart_date']}|{q['return_date']}"


def select_queries(latest: dict[str, Any], *, today: dt.date, horizon: dt.date,
                   watched: set[str] | None = None, max_queries: int = 400) -> dict[str, Reason]:
    """Vrátí {query_key: důvod} pro dotazy, které má smysl zopakovat (seřazeno podle priority)."""
    watched = watched or set()
    picked: list[tuple[int, str, Reason]] = []
    for q in latest.get("queries", []):
        key = plan_key(q)
        wk = key
        ret = dt.date.fromisoformat(q["return_date"])
        beyond = bool(q.get("beyond_horizon")) or ret > horizon
        frontier = horizon - dt.timedelta(days=3) <= ret <= horizon + dt.timedelta(days=4)
        st = q.get("status")
        reason: Reason | None = None
        prio = 9
        if wk in watched:
            reason, prio = "sledovaný let", 0
        elif st == "error" or (st or "").startswith("skipped"):
            reason, prio = f"ranní běh: {st}", 1
        elif q.get("stale"):
            reason, prio = f"převzato ze staršího běhu ({q.get('stale_days', 1)}×)", 2
        elif st == "empty" and not beyond:
            reason, prio = "prázdné uvnitř prodejního okna", 3
        elif frontier:
            reason, prio = "hranice prodejního okna", 4
        if reason:
            picked.append((prio, key, reason))
    picked.sort(key=lambda x: (x[0], x[1]))
    out: dict[str, Reason] = {}
    for _, key, reason in picked[:max_queries]:
        out[key] = reason
    return out


def merge_parts(latest: dict[str, Any], new_part: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Rozdělí dnešní data na 'základ' (vše, co zůstává) a 'nové' (co nahrazuje), vrátí i statistiku.

    Nahrazení jen když je nový výsledek lepší: má nabídky, nebo původní dotaz nabídky neměl a nový
    aspoň regulérně doběhl (status empty místo error). Přeskočené dotazy (rozpočet) se ignorují.
    """
    base_q = {storage.query_key(q): q for q in latest.get("queries", [])}
    stats = {"reran": 0, "replaced": 0, "improved": 0, "newly_ok": 0, "kept": 0}
    replace: set[str] = set()
    new_queries: list[dict[str, Any]] = []
    for q in new_part.get("queries", []):
        st = q.get("status") or ""
        if st.startswith("skipped"):
            continue
        stats["reran"] += 1
        key = storage.query_key(q)
        old = base_q.get(key)
        old_ok = bool(old and old.get("status") == "ok" and old.get("count"))
        new_ok = st == "ok" and q.get("count")
        better = new_ok or (not old_ok and st == "empty" and (old or {}).get("status") != "empty")
        if not better:
            stats["kept"] += 1
            continue
        replace.add(key)
        q = dict(q, run="complement")
        new_queries.append(q)
        stats["replaced"] += 1
        if new_ok and not old_ok:
            stats["newly_ok"] += 1
        elif new_ok and old_ok and q["min_price"] is not None and old.get("min_price") is not None and q["min_price"] < old["min_price"]:
            stats["improved"] += 1
    base = {
        "offers": [o for o in latest.get("offers", []) if storage.query_key(o) not in replace],
        "queries": [q for q in latest.get("queries", []) if storage.query_key(q) not in replace],
        "scan": {"duration_s": int(latest.get("stats", {}).get("duration_s", 0)),
                 "google_disabled": bool(latest.get("stats", {}).get("google_disabled")), "day": latest.get("day")},
    }
    new = {
        "offers": [dict(o, run="complement") for o in new_part.get("offers", []) if storage.query_key(o) in replace],
        "queries": new_queries,
        "scan": dict(new_part.get("scan", {}), google_disabled=False),
    }
    return base, new, stats


def run(cfg: Config, *, scan_fn: Callable[..., dict[str, Any]], finalize_fn: Callable[..., dict[str, Any]],
        time_budget_min: float | None = None, enrich: bool = True, dry_run: bool = False,
        max_queries: int = 400) -> dict[str, Any] | None:
    from .run import booking_horizon  # lokální import kvůli cyklu

    latest = storage.load_latest()
    if not latest or not latest.get("queries"):
        log.error("Není z čeho vycházet: data/latest.json chybí nebo je prázdný. Nejdřív musí proběhnout ranní sken.")
        return None
    today = dt.datetime.now(dt.timezone.utc).date()
    if latest.get("day") != today.isoformat():
        log.warning("Dnešní ranní sken (%s) zatím neproběhl, vycházím z %s.", today, latest.get("day"))
    horizon = booking_horizon(cfg, today)
    watched = {watch_key(w["origin"], w["destination"], w["depart_date"], w["return_date"])
               for w in (normalize_entry(x) for x in load_watchlist().get("watch", [])) if w}
    sel = select_queries(latest, today=today, horizon=horizon, watched=watched, max_queries=max_queries)
    by_reason: dict[str, int] = {}
    for r in sel.values():
        by_reason[r.split(" (")[0]] = by_reason.get(r.split(" (")[0], 0) + 1
    log.info("Doplňkový sken: %d dotazů k zopakování z %d (%s)", len(sel), len(latest["queries"]),
             ", ".join(f"{k}: {v}" for k, v in sorted(by_reason.items(), key=lambda x: -x[1])) or "nic")
    if dry_run or not sel:
        if not sel:
            log.info("Není co doplňovat – ranní běh pokryl všechno.")
        return None

    if time_budget_min is not None:
        cfg.raw.setdefault("scan", {})["time_budget_minutes"] = float(time_budget_min)
    part = scan_fn(cfg, only_keys=set(sel), shuffle=False)
    base, new, stats = merge_parts(latest, part)
    log.info("Sloučení: zopakováno %(reran)d, nahrazeno %(replaced)d (nově s nabídkou %(newly_ok)d, "
             "levněji %(improved)d), ponecháno původní %(kept)d", stats)
    payload = finalize_fn(cfg, [base, new], enrich=enrich)
    payload["complement"] = {
        "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "selected": len(sel), "reasons": by_reason, **stats,
        "duration_s": int(part.get("scan", {}).get("duration_s", 0)),
    }
    payload["stats"]["complement"] = payload["complement"]
    return payload

"""Preferovaná aerolinka (config `preferred`): souhrn minim, nová minima a výběr termínů k přednostnímu ověření."""
from __future__ import annotations

from typing import Any

from . import storage


def airlines_of(cfg_pref: dict[str, Any] | None) -> set[str]:
    return {str(a) for a in ((cfg_pref or {}).get("airlines") or [])}


def is_pref(o: dict[str, Any], airlines: set[str]) -> bool:
    """Nabídka je 'preferovaná', když ji celou (všechny úseky) létá preferovaná aerolinka."""
    al = [a for a in (o.get("airlines") or []) if a]
    return bool(al) and bool(airlines) and all(a in airlines for a in al)


def _compact(o: dict[str, Any]) -> dict[str, Any]:
    return {k: o.get(k) for k in ("id", "origin", "destination", "depart_date", "return_date", "price", "score",
                                   "airlines", "route", "stops", "duration_min", "nights")}


def peers_of(cfg_pref: dict[str, Any] | None) -> list[str]:
    return [str(a) for a in ((cfg_pref or {}).get("peers") or [])]


def _is_airline(o: dict[str, Any], airline: str) -> bool:
    al = [a for a in (o.get("airlines") or []) if a]
    return bool(al) and all(a == airline for a in al)


def peer_summary(offers: list[dict[str, Any]], cfg_pref: dict[str, Any] | None,
                 prev_minima: dict[str, Any] | None) -> dict[str, Any]:
    """Pro každou prémiovou aerolinku: dnešní minimum celkem a po trasách, dosavadní minima, zázračné slevy."""
    out: dict[str, Any] = {}
    drop_pct = float((cfg_pref or {}).get("peer_drop_pct") or 20)
    prev_by_air = (prev_minima or {}).get("airlines_min", {})
    for air in peers_of(cfg_pref):
        mine = [o for o in offers if not o.get("stale") and _is_airline(o, air)]
        by_route: dict[str, dict[str, Any]] = {}
        for o in mine:
            rk = f"{o['origin']}-{o['destination']}"
            if rk not in by_route or o["price"] < by_route[rk]["price"]:
                by_route[rk] = o
        prev = prev_by_air.get(air, {})
        miracles = {}
        for rk, o in by_route.items():
            pv = (prev.get(rk) or {}).get("price")
            if pv and o["price"] <= pv * (1 - drop_pct / 100):
                miracles[rk] = {"price": o["price"], "previous": pv, "drop_pct": round((1 - o["price"] / pv) * 100)}
        out[air] = {
            "offers": len(mine),
            "overall": _compact(min(mine, key=lambda o: o["price"])) if mine else None,
            "min_by_route": {rk: _compact(o) for rk, o in by_route.items()},
            "prev_min_by_route": prev,
            "miracles": miracles,
        }
    return out


def summary(offers: list[dict[str, Any]], cfg_pref: dict[str, Any] | None,
            prev_minima: dict[str, Any] | None) -> dict[str, Any] | None:
    """Dnešní minima preferované aerolinky po trasách a měsících + porovnání s dosavadními minimy."""
    airlines = airlines_of(cfg_pref)
    if not airlines:
        return None
    fresh = [o for o in offers if not o.get("stale") and is_pref(o, airlines)]
    by_route: dict[str, dict[str, Any]] = {}
    by_month: dict[str, dict[str, Any]] = {}
    for o in fresh:
        rk = f"{o['origin']}-{o['destination']}"
        if rk not in by_route or o["price"] < by_route[rk]["price"]:
            by_route[rk] = o
        mk = o["depart_date"][5:7]
        if mk not in by_month or o["price"] < by_month[mk]["price"]:
            by_month[mk] = o
    prev = (prev_minima or {}).get("routes", {})
    overall = min(fresh, key=lambda o: o["price"]) if fresh else None
    new_low = {rk: {"price": o["price"], "previous": prev[rk]["price"]} for rk, o in by_route.items()
               if rk in prev and prev[rk].get("price") is not None and o["price"] < prev[rk]["price"]}
    return {
        "airlines": sorted(airlines), "target_price": (cfg_pref or {}).get("target_price"),
        "offers": len(fresh),
        "min_by_route": {rk: _compact(o) for rk, o in by_route.items()},
        "min_by_month": {mk: _compact(o) for mk, o in by_month.items()},
        "overall": _compact(overall) if overall else None,
        "prev_min_by_route": {rk: v for rk, v in prev.items()},
        "new_low_routes": new_low,
        "peers": peer_summary(offers, cfg_pref, prev_minima),
        "peer_target_price": (cfg_pref or {}).get("peer_target_price"),
        "peer_drop_pct": (cfg_pref or {}).get("peer_drop_pct"),
    }


def update_minima(prev_minima: dict[str, Any] | None, pref: dict[str, Any] | None, day: str) -> dict[str, Any]:
    """Sloučí dosavadní minima s dnešními (pamatuje si nejnižší cenu preferované aerolinky na trasu)."""
    out = dict(prev_minima or {})
    routes = dict(out.get("routes", {}))
    for rk, o in ((pref or {}).get("min_by_route") or {}).items():
        cur = routes.get(rk)
        if cur is None or cur.get("price") is None or o["price"] <= cur["price"]:
            routes[rk] = {"price": o["price"], "day": day, "depart_date": o["depart_date"],
                          "return_date": o["return_date"], "route": o.get("route")}
    out["routes"] = routes
    by_air = dict(out.get("airlines_min", {}))
    for air, info in ((pref or {}).get("peers") or {}).items():
        cur_air = dict(by_air.get(air, {}))
        for rk, o in (info.get("min_by_route") or {}).items():
            cur = cur_air.get(rk)
            if cur is None or cur.get("price") is None or o["price"] <= cur["price"]:
                cur_air[rk] = {"price": o["price"], "day": day, "depart_date": o["depart_date"],
                               "return_date": o["return_date"], "route": o.get("route")}
        by_air[air] = cur_air
    out["airlines_min"] = by_air
    out["airlines"] = (pref or {}).get("airlines") or out.get("airlines")
    out["updated"] = day
    return out


def _cheapest_keys(offers: list[dict[str, Any]], pred, n: int) -> list[str]:
    best: dict[str, int] = {}
    for o in offers:
        if o.get("stale") or not pred(o):
            continue
        k = f"{o['origin']}|{o['destination']}|{o['depart_date']}|{o['return_date']}"
        if k not in best or o["price"] < best[k]:
            best[k] = o["price"]
    return [k for k, _ in sorted(best.items(), key=lambda x: x[1])[:n]]


def recheck_keys(latest: dict[str, Any], cfg_pref: dict[str, Any] | None) -> list[str]:
    """Nejlevnější termíny preferované aerolinky (klíče dotazů bez zdroje) k přednostnímu znovuověření."""
    airlines = airlines_of(cfg_pref)
    n = int((cfg_pref or {}).get("recheck_top") or 0)
    if not airlines or n <= 0:
        return []
    return _cheapest_keys(latest.get("offers", []), lambda o: is_pref(o, airlines), n)


def peer_recheck_keys(latest: dict[str, Any], cfg_pref: dict[str, Any] | None) -> list[str]:
    """Nejlevnější termíny každé prémiové aerolinky k znovuověření (peer_recheck_top na aerolinku)."""
    n = int((cfg_pref or {}).get("peer_recheck_top") or 0)
    out: list[str] = []
    for air in peers_of(cfg_pref):
        for k in _cheapest_keys(latest.get("offers", []), lambda o, a=air: _is_airline(o, a), n):
            if k not in out:
                out.append(k)
    return out


def load_minima() -> dict[str, Any]:
    p = storage.DATA_DIR / "pref.json"
    try:
        import json
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    except Exception:  # noqa: BLE001
        return {}


def save_minima(m: dict[str, Any]) -> None:
    import json
    storage.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (storage.DATA_DIR / "pref.json").write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")

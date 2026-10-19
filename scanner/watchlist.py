"""Sledované lety: ruční piny (watchlist.yaml, přes GitHub issue) + automatické top dealy.

Pro každý sledovaný let se drží denní historie (data/watch.json): nejnižší cena na termín,
cena stejného itineráře (aerolinky + trasa) a nejlepší nabídka. Z toho vznikají hlášení o změně ceny.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

import yaml

from .config import ROOT

WATCHLIST_PATH = ROOT / "watchlist.yaml"
WATCH_DATA_PATH = ROOT / "data" / "watch.json"


def watch_key(origin: str, dest: str, depart: str, ret: str) -> str:
    return f"{origin}|{dest}|{depart}|{ret}"


def load_watchlist(path: Path | None = None) -> dict[str, Any]:
    p = path or WATCHLIST_PATH
    if not p.exists():
        return {"auto": {"enabled": True, "top": 5, "keep_days": 10}, "watch": []}
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    data.setdefault("auto", {"enabled": True, "top": 5, "keep_days": 10})
    data.setdefault("watch", [])
    data["watch"] = [w for w in data["watch"] if w]
    return data


def save_watchlist(data: dict[str, Any], path: Path | None = None) -> None:
    p = path or WATCHLIST_PATH
    head = p.read_text(encoding="utf-8").split("auto:")[0] if p.exists() else ""
    body = yaml.safe_dump({"auto": data.get("auto", {}), "watch": data.get("watch", [])},
                          allow_unicode=True, sort_keys=False)
    p.write_text(head + body, encoding="utf-8")


def normalize_entry(e: dict[str, Any]) -> dict[str, Any] | None:
    try:
        o, d = str(e["origin"]).upper(), str(e["destination"]).upper()
        dep = dt.date.fromisoformat(str(e["depart_date"])).isoformat()
        ret = dt.date.fromisoformat(str(e["return_date"])).isoformat()
    except (KeyError, ValueError, TypeError):
        return None
    out = {"origin": o, "destination": d, "depart_date": dep, "return_date": ret}
    itin = e.get("itin") or {}
    if itin:
        out["itin"] = {k: itin[k] for k in ("airlines", "route", "dep_time") if itin.get(k)}
    for k in ("note", "added", "auto", "last_top", "price_at_add"):
        if e.get(k) not in (None, ""):
            out[k] = e[k]
    return out


ISSUE_RE = re.compile(r"(?P<cmd>watch|unwatch|sledovat|zrusit)\s*:\s*(?P<o>[A-Z]{3})\s*[→>-]+\s*(?P<d>[A-Z]{3})\s+"
                      r"(?P<dep>\d{4}-\d{2}-\d{2})\s*[→>-]+\s*(?P<ret>\d{4}-\d{2}-\d{2})", re.I)


def parse_issue(title: str, body: str | None) -> tuple[str, dict[str, Any]] | None:
    """Z titulku issue 'watch: PRG→BKK 2027-08-26 → 2027-09-09' (+ volitelný JSON blok v těle)."""
    m = ISSUE_RE.search(title or "")
    if not m:
        return None
    cmd = "unwatch" if m.group("cmd").lower() in ("unwatch", "zrusit") else "watch"
    entry: dict[str, Any] = {"origin": m.group("o").upper(), "destination": m.group("d").upper(),
                             "depart_date": m.group("dep"), "return_date": m.group("ret")}
    if body:
        jm = re.search(r"```json\s*(\{.*?\})\s*```", body, re.S)
        if jm:
            try:
                extra = json.loads(jm.group(1))
                for k in ("itin", "note", "price_at_add"):
                    if extra.get(k):
                        entry[k] = extra[k]
            except json.JSONDecodeError:
                pass
    return cmd, entry


def apply_issue(data: dict[str, Any], cmd: str, entry: dict[str, Any], today: str) -> str:
    e = normalize_entry(entry)
    if not e:
        return "neplatný záznam"
    k = watch_key(e["origin"], e["destination"], e["depart_date"], e["return_date"])
    existing = [w for w in data["watch"] if watch_key(w["origin"], w["destination"], w["depart_date"], w["return_date"]) == k]
    if cmd == "unwatch":
        data["watch"] = [w for w in data["watch"] if w not in existing]
        return f"odebráno ({len(existing)})" if existing else "nebylo ve sledování"
    if existing:
        existing[0].update({kk: v for kk, v in e.items() if kk in ("itin", "note", "price_at_add")})
        existing[0].pop("auto", None)   # ruční pin má přednost před automatickým
        return "už sledováno, aktualizováno"
    e["added"] = today
    data["watch"].append(e)
    return "přidáno"


# ----------------------------------------------------------------------------- pojmenování
HUB_CZ = {"DOH": "Dauhá", "DXB": "Dubaj", "AUH": "Abú Dhabí", "IST": "Istanbul", "SAW": "Istanbul", "MCT": "Maskat",
          "SIN": "Singapur", "WAW": "Varšavu", "ZRH": "Curych", "HEL": "Helsinky", "FRA": "Frankfurt", "MUC": "Mnichov",
          "VIE": "Vídeň", "CDG": "Paříž", "AMS": "Amsterdam", "LHR": "Londýn", "BKK": "Bangkok", "KUL": "Kuala Lumpur",
          "HKG": "Hongkong", "TPE": "Tchaj-pej", "PEK": "Peking", "PVG": "Šanghaj", "CAN": "Kanton", "BAH": "Bahrajn",
          "KWI": "Kuvajt", "RUH": "Rijád", "JED": "Džiddu", "CAI": "Káhiru", "ADD": "Addis Abebu", "BOM": "Bombaj",
          "DEL": "Dillí", "CMB": "Kolombo", "ALA": "Almaty", "TAS": "Taškent", "BEG": "Bělehrad", "OTP": "Bukurešť",
          "CPH": "Kodaň", "ARN": "Stockholm", "BRU": "Brusel", "MXP": "Milán", "FCO": "Řím", "SHJ": "Šardžá"}
AIRLINE_SHORT = {"Qatar Airways": "Qatar", "Turkish Airlines": "Turkish", "Emirates": "Emirates", "Etihad": "Etihad",
                 "Oman Air": "Oman Air", "SalamAir": "SalamAir", "Singapore Airlines": "Singapore", "EVA Air": "EVA",
                 "Austrian": "Austrian", "Lufthansa": "Lufthansa", "SWISS": "Swiss", "Swiss": "Swiss", "LOT": "LOT",
                 "Finnair": "Finnair", "KLM": "KLM", "Air France": "Air France", "Scoot": "Scoot", "THAI": "Thai",
                 "Thai Airways": "Thai", "Air China": "Air China", "China Eastern": "China Eastern", "flydubai": "flydubai",
                 "Air Arabia": "Air Arabia", "Gulf Air": "Gulf Air", "Saudia": "Saudia", "Cathay Pacific": "Cathay"}


def nickname(airlines: list[str] | None, route: str | None) -> str:
    """Krátké lidské jméno letu: 'Qatar přes Dauhá', 'Austrian přímo', 'Oman Air přes Maskat'."""
    al = [a for a in (airlines or []) if a]
    main = AIRLINE_SHORT.get(al[0], al[0]) if al else "?"
    if len(al) > 1 and al[1] not in (al[0],):
        main = f"{main} + {AIRLINE_SHORT.get(al[1], al[1])}"
    hops = (route or "").split("→")
    mids = hops[1:-1]
    if not mids:
        return f"{main} přímo"
    via = ", ".join(HUB_CZ.get(m, m) for m in mids)
    return f"{main} přes {via}"


# ----------------------------------------------------------------------------- vyhodnocení
def _compact(o: dict[str, Any]) -> dict[str, Any]:
    return {"id": o.get("id"), "price": o["price"], "score": o.get("score"), "airlines": o.get("airlines", []),
            "route": o.get("route"), "stops": o.get("stops"), "duration_min": o.get("duration_min"),
            "dep_time": (o["legs"][0]["departure"][11:16] if o.get("legs") else None),
            "legs": [{"from_airport": l.get("from_airport"), "to_airport": l.get("to_airport"), "departure": l.get("departure"),
                      "arrival": l.get("arrival"), "duration_min": l.get("duration_min"), "plane": l.get("plane")}
                     for l in (o.get("legs") or [])],
            "layovers": [{"airport": x.get("airport"), "minutes": x.get("minutes")} for x in (o.get("layovers") or [])],
            "links": {"google": (o.get("links") or {}).get("google")}, "stale": bool(o.get("stale"))}


def _itin_match(o: dict[str, Any], itin: dict[str, Any]) -> bool:
    """Stejný let = stejné aerolinky a trasa. Čas odletu se používá jen jako preference (letové řády se posouvají)."""
    if not itin:
        return False
    if itin.get("route") and o.get("route") != itin["route"]:
        return False
    if itin.get("airlines") and sorted(o.get("airlines") or []) != sorted(itin["airlines"]):
        return False
    return True


def _itin_pick(cands: list[dict[str, Any]], itin: dict[str, Any]) -> dict[str, Any] | None:
    """Z kandidátů se stejnými aerolinkami/trasou vybrat ten se stejným časem odletu, jinak nejlevnější."""
    if not cands:
        return None
    t = (itin or {}).get("dep_time")
    if t:
        same_t = [o for o in cands if o.get("legs") and o["legs"][0]["departure"][11:16] == t]
        if same_t:
            return min(same_t, key=lambda o: o["price"])
    return min(cands, key=lambda o: o["price"])


def load_watch_data() -> dict[str, Any]:
    if not WATCH_DATA_PATH.exists():
        return {"items": {}}
    try:
        return json.loads(WATCH_DATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"items": {}}


def save_watch_data(data: dict[str, Any]) -> None:
    WATCH_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    WATCH_DATA_PATH.write_text(text, encoding="utf-8")
    WATCH_DATA_PATH.with_suffix(".js").write_text(f"window.THAJLAND_WATCH = {text};\n", encoding="utf-8")


def auto_select(offers: list[dict[str, Any]], n: int, per_route: int = 2,
                preferred: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Top N čerstvých nabídek podle skóre, pestré: jiný itinerář (aerolinky+trasa) a max. `per_route` na trasu.

    Bez toho by se vybral pětkrát tentýž let v sousedních dnech. Preferovaná aerolinka (config `preferred`)
    má rezervovaná místa: nejlevnější její let na každou destinaci jde do výběru vždy, i kdyby skóre nestačilo.
    """
    fresh = sorted([o for o in offers if not o.get("stale") and o.get("score") is not None], key=lambda o: o["score"])
    seen_itin: set[tuple] = set()
    per: dict[tuple, int] = {}
    picked = []
    pref_air = {str(a) for a in ((preferred or {}).get("airlines") or [])}
    reserve = int((preferred or {}).get("reserve_tips") or 0)
    if pref_air and reserve > 0:
        by_dest: dict[str, dict[str, Any]] = {}
        for o in fresh:
            if o.get("airlines") and all(a in pref_air for a in o["airlines"]):
                d = o["destination"]
                if d not in by_dest or o["price"] < by_dest[d]["price"]:
                    by_dest[d] = o
        for o in sorted(by_dest.values(), key=lambda x: x["price"])[:reserve]:
            itin = (o["origin"], o["destination"], tuple(o.get("airlines") or []), o.get("route"))
            rk = (o["origin"], o["destination"])
            seen_itin.add(itin); per[rk] = per.get(rk, 0) + 1; picked.append(o)
    for o in fresh:
        if len(picked) >= n:
            break
        if o in picked:
            continue
        itin = (o["origin"], o["destination"], tuple(o.get("airlines") or []), o.get("route"))
        rk = (o["origin"], o["destination"])
        if itin in seen_itin or per.get(rk, 0) >= per_route:
            continue
        seen_itin.add(itin); per[rk] = per.get(rk, 0) + 1; picked.append(o)
        if len(picked) >= n:
            break
    return picked


def evaluate(watchlist: dict[str, Any], payload: dict[str, Any], watch_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Doplní automatické piny, zapíše dnešní stav do historie a vrátí přehled sledovaných letů."""
    today = payload["day"]
    auto_cfg = watchlist.get("auto") or {}
    entries = [normalize_entry(w) for w in watchlist.get("watch", [])]
    entries = [e for e in entries if e]
    if auto_cfg.get("enabled", True):
        keys = {watch_key(e["origin"], e["destination"], e["depart_date"], e["return_date"]) for e in entries}
        for o in auto_select(payload.get("offers", []), int(auto_cfg.get("top", 5)), preferred=payload.get("preferred")):
            k = watch_key(o["origin"], o["destination"], o["depart_date"], o["return_date"])
            if k in keys:
                for e in entries:
                    if watch_key(e["origin"], e["destination"], e["depart_date"], e["return_date"]) == k and e.get("auto"):
                        e["last_top"] = today
                continue
            entries.append({"origin": o["origin"], "destination": o["destination"], "depart_date": o["depart_date"],
                            "return_date": o["return_date"], "auto": True, "added": today, "last_top": today,
                            "price_at_add": o["price"],
                            "itin": {"airlines": o.get("airlines", []), "route": o.get("route"),
                                     "dep_time": (o["legs"][0]["departure"][11:16] if o.get("legs") else None)}})
            keys.add(k)
        # automatické piny, které vypadly z top N déle než keep_days, odstranit
        keep = int(auto_cfg.get("keep_days", 10))
        def _old(e):
            if not e.get("auto"):
                return False
            last = e.get("last_top") or e.get("added") or today
            return (dt.date.fromisoformat(today) - dt.date.fromisoformat(str(last))).days > keep
        entries = [e for e in entries if not _old(e)]
    watchlist["watch"] = entries

    by_q: dict[str, list[dict[str, Any]]] = {}
    for o in payload.get("offers", []):
        by_q.setdefault(watch_key(o["origin"], o["destination"], o["depart_date"], o["return_date"]), []).append(o)
    items = watch_data.setdefault("items", {})
    out = []
    for e in entries:
        k = watch_key(e["origin"], e["destination"], e["depart_date"], e["return_date"])
        offs = by_q.get(k, [])
        best = min(offs, key=lambda o: (o.get("score") if o.get("score") is not None else o["price"])) if offs else None
        cheapest = min(offs, key=lambda o: o["price"]) if offs else None
        same = [o for o in offs if _itin_match(o, e.get("itin") or {})]
        same_best = _itin_pick(same, e.get("itin") or {})
        rec = items.setdefault(k, {"history": []})
        rec["history"] = [h for h in rec["history"] if h["day"] != today]
        rec["history"].append({"day": today, "min": cheapest["price"] if cheapest else None,
                               "itin": same_best["price"] if same_best else None,
                               "stale": bool(cheapest and cheapest.get("stale"))})
        rec["history"] = rec["history"][-120:]
        hist = rec["history"]
        prev = next((h for h in reversed(hist[:-1]) if h.get("itin") is not None or h.get("min") is not None), None)
        cur_price = (same_best or cheapest or {}).get("price")
        prev_price = (prev or {}).get("itin") if same_best else (prev or {}).get("min")
        if prev and prev_price is None:
            prev_price = prev.get("min")
        mins = [h["itin"] if h.get("itin") is not None else h["min"] for h in hist if (h.get("itin") is not None or h.get("min") is not None)]
        out.append({
            "key": k, **{kk: e[kk] for kk in ("origin", "destination", "depart_date", "return_date")},
            "note": e.get("note"), "auto": bool(e.get("auto")), "added": e.get("added"),
            "price_at_add": e.get("price_at_add"), "itin": e.get("itin"),
            "status": "ok" if offs else "missing",
            "current": _compact(same_best or cheapest) if (same_best or cheapest) else None,
            "same_itinerary": bool(same_best), "cheapest_any": _compact(cheapest) if cheapest else None,
            "best_offer": _compact(best) if best else None,
            "prev_price": prev_price, "prev_day": (prev or {}).get("day"),
            "min_seen": min(mins) if mins else None, "max_seen": max(mins) if mins else None,
            "history": hist,
        })
    # pořadí: tipy skeneru podle skóre a ceny (Tip 1 = nejlepší poměr), pak ruční piny; jména
    def _rank(w):
        c = w["current"] or {}
        return (c.get("score") if c.get("score") is not None else 10**9, c.get("price") or 10**9)
    autos = sorted([w for w in out if w["auto"]], key=_rank)
    mans = sorted([w for w in out if not w["auto"]], key=_rank)
    for i, w in enumerate(autos, 1):
        w["name"] = f"Tip {i}"
    for i, w in enumerate(mans, 1):
        w["name"] = f"Můj pin {i}"
    for w in autos + mans:
        src = w.get("current") or w.get("itin") or {}
        w["nick"] = nickname(src.get("airlines"), src.get("route"))
    return autos + mans

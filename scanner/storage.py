"""Ukládání výsledků: latest.json (+ .js), denní snapshoty historie a série pro grafy."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

from .config import ROOT

DATA_DIR = ROOT / "data"
HISTORY_DIR = DATA_DIR / "history"


def _dump(path: Path, obj: Any, js_var: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    if js_var:
        path.with_suffix(".js").write_text(f"window.{js_var} = {text};\n", encoding="utf-8")


def load_latest() -> dict[str, Any] | None:
    p = DATA_DIR / "latest.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def save_latest(payload: dict[str, Any]) -> None:
    _dump(DATA_DIR / "latest.json", payload, js_var="THAJLAND_LATEST")


def query_key(q: dict[str, Any]) -> str:
    return f"{q['origin']}|{q['destination']}|{q['depart_date']}|{q['return_date']}|{q['source']}"


def save_history_snapshot(day: str, queries: list[dict[str, Any]]) -> Path:
    """Kompaktní denní snapshot: za každý dotaz min. cena, nejlepší skóre a top nabídka."""
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    recs = []
    for q in queries:
        if q.get("status") != "ok" or not q.get("count"):
            continue
        recs.append({
            "o": q["origin"], "d": q["destination"], "dep": q["depart_date"],
            "ret": q["return_date"], "src": q["source"],
            "min": q.get("min_price"), "best": q.get("best_score"), "n": q.get("count"),
            "top": q.get("top"),
        })
    p = HISTORY_DIR / f"{day}.json"
    _dump(p, {"day": day, "records": recs})
    return p


def load_history() -> list[dict[str, Any]]:
    out = []
    if not HISTORY_DIR.exists():
        return out
    for p in sorted(HISTORY_DIR.glob("*.json")):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return out


def build_series(history: list[dict[str, Any]]) -> dict[str, Any]:
    """Série pro grafy: po dnech minimální cena / skóre za (origin,dest) a za konkrétní termín."""
    days = []
    for snap in history:
        per_route: dict[str, dict[str, Any]] = {}
        per_query: list[list[Any]] = []
        for r in snap.get("records", []):
            if r.get("min") is None:
                continue
            k = f"{r['o']}-{r['d']}"
            cur = per_route.setdefault(k, {"min": None, "best": None})
            if cur["min"] is None or r["min"] < cur["min"]:
                cur["min"] = r["min"]
            if r.get("best") is not None and (cur["best"] is None or r["best"] < cur["best"]):
                cur["best"] = r["best"]
            per_query.append([r["o"], r["d"], r["dep"], r["ret"], r["src"], r["min"], r.get("best")])
        days.append({"day": snap["day"], "routes": per_route, "queries": per_query})
    return {"days": days}


def save_series(series: dict[str, Any]) -> None:
    _dump(DATA_DIR / "series.json", series, js_var="THAJLAND_SERIES")


def all_time_minima(history: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Nejnižší dosud viděná cena pro každý dotaz (bez dnešního dne – volá se před uložením)."""
    out: dict[str, dict[str, Any]] = {}
    for snap in history:
        for r in snap.get("records", []):
            if r.get("min") is None:
                continue
            k = f"{r['o']}|{r['d']}|{r['dep']}|{r['ret']}|{r['src']}"
            cur = out.get(k)
            if cur is None or r["min"] < cur["min"]:
                out[k] = {"min": r["min"], "day": snap["day"]}
    return out

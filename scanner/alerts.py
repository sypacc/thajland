"""Detekce zajímavých dealů / abnormálně nízkých cen a rozeslání hlášení."""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import smtplib
import statistics
from email.message import EmailMessage
from typing import Any

import requests

from .config import ROOT

log = logging.getLogger("thajland.alerts")
ALERTS_PATH = ROOT / "data" / "alerts.json"
KIND_LABEL = {
    "target": "pod cílovou cenou",
    "drop": "prudký pokles",
    "anomaly": "abnormálně nízko",
    "route_low": "nové minimum trasy",
    "new_dates": "nově v prodeji",
    "new_route": "nová trasa v prodeji",
}


def _qkey(r: dict[str, Any]) -> str:
    return f"{r['origin']}|{r['destination']}|{r['depart_date']}|{r['return_date']}|{r['source']}"


def load_alerts() -> list[dict[str, Any]]:
    if not ALERTS_PATH.exists():
        return []
    try:
        return json.loads(ALERTS_PATH.read_text(encoding="utf-8")).get("alerts", [])
    except json.JSONDecodeError:
        return []


def save_alerts(alerts: list[dict[str, Any]]) -> None:
    ALERTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    alerts = sorted(alerts, key=lambda a: (a["day"], a.get("created_at", "")), reverse=True)[:400]
    text = json.dumps({"alerts": alerts}, ensure_ascii=False, separators=(",", ":"))
    ALERTS_PATH.write_text(text, encoding="utf-8")
    ALERTS_PATH.with_suffix(".js").write_text(f"window.THAJLAND_ALERTS = {text};\n", encoding="utf-8")


def detect(payload: dict[str, Any], history: list[dict[str, Any]], cfg: dict[str, Any],
           existing: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Vrátí nová hlášení pro dnešní běh. `history` = snapshoty BEZ dnešního dne."""
    if not cfg.get("enabled", True):
        return []
    today = payload["day"]
    target = cfg.get("target_price")
    drop_pct = float(cfg.get("drop_pct", 12))
    drop_czk = float(cfg.get("drop_czk", 2500))
    anomaly_pct = float(cfg.get("anomaly_pct", 15))
    anomaly_min_days = int(cfg.get("anomaly_min_days", 5))
    route_low_min_days = int(cfg.get("route_low_min_days", 3))
    dedupe_days = int(cfg.get("dedupe_days", 7))
    improve = float(cfg.get("dedupe_improve_czk", 500))

    # historie: per dotaz seznam minim; per trasa minimum
    q_hist: dict[str, list[int]] = {}
    route_hist: dict[str, list[int]] = {}
    for snap in history:
        day_route_min: dict[str, int] = {}
        for r in snap.get("records", []):
            if r.get("min") is None:
                continue
            k = f"{r['o']}|{r['d']}|{r['dep']}|{r['ret']}|{r['src']}"
            q_hist.setdefault(k, []).append(r["min"])
            rk = f"{r['o']}-{r['d']}"
            day_route_min[rk] = min(day_route_min.get(rk, 10**9), r["min"])
        for rk, v in day_route_min.items():
            route_hist.setdefault(rk, []).append(v)

    # nejlepší nabídka na dotaz z dnešního běhu
    best_by_q: dict[str, dict[str, Any]] = {}
    for o in payload.get("offers", []):
        if o.get("stale"):
            continue
        k = _qkey(o)
        if k not in best_by_q or o["price"] < best_by_q[k]["price"]:
            best_by_q[k] = o

    cutoff = (dt.date.fromisoformat(today) - dt.timedelta(days=dedupe_days)).isoformat()
    recent: dict[str, int] = {}
    for a in existing or []:
        if a["day"] >= cutoff:
            key = a["dedupe_key"]
            if key not in recent or a["price"] < recent[key]:
                recent[key] = a["price"]

    # Důvody se sbírají per nabídka, výsledkem je jedno hlášení s více důvody.
    reasons: dict[str, list[tuple[str, str, str, dict[str, Any]]]] = {}

    def add(kind: str, o: dict[str, Any], reason: str, severity: str, **extra):
        reasons.setdefault(_qkey(o), []).append((kind, reason, severity, extra))

    for k, o in best_by_q.items():
        p = o["price"]
        if target and p <= float(target):
            add("target", o, f"cena {p} je pod cílovou hranicí {int(target)}", "high")
        y = o.get("yesterday_min")
        if y and ((y - p) >= drop_czk or (y - p) / y * 100 >= drop_pct):
            add("drop", o, f"pokles z {y} na {p} ({(y - p) / y * 100:.0f} %) od minulého běhu", "medium",
                previous_price=y)
        hist = q_hist.get(k, [])
        if len(hist) >= anomaly_min_days:
            med = statistics.median(hist)
            if p <= med * (1 - anomaly_pct / 100):
                add("anomaly", o,
                    f"cena {p} je {(1 - p / med) * 100:.0f} % pod mediánem {int(med)} z {len(hist)} běhů tohoto termínu",
                    "high", median_price=int(med), history_days=len(hist))
    route_best: dict[str, dict[str, Any]] = {}
    for o in best_by_q.values():
        rk = f"{o['origin']}-{o['destination']}"
        if rk not in route_best or o["price"] < route_best[rk]["price"]:
            route_best[rk] = o
    for rk, o in route_best.items():
        hist = route_hist.get(rk, [])
        if len(hist) >= route_low_min_days and o["price"] < min(hist):
            add("route_low", o, f"nejnižší cena na trase {rk} za {len(hist)} běhů (dosud {min(hist)})", "medium",
                previous_low=min(hist))

    # 5) nově v prodeji: termíny/trasy, které se v historii (>=3 běhy) nikdy neobjevily (příznak z finalizace)
    new_by_route: dict[str, list[dict[str, Any]]] = {}
    for o in best_by_q.values():
        if o.get("is_new"):
            new_by_route.setdefault(f"{o['origin']}-{o['destination']}", []).append(o)
    for rk, items in new_by_route.items():
        best = min(items, key=lambda x: (x.get("score") if x.get("score") is not None else x["price"]))
        dates = sorted({x["depart_date"] for x in items})
        months = sorted({d[5:7] for d in dates})
        kind = "new_route" if any(x.get("is_new_route") for x in items) else "new_dates"
        add(kind, best,
            f"{len(dates)} nových dnů odletu ({dates[0]} – {dates[-1]}), od {min(x['price'] for x in items)} Kč",
            "medium", new_dates=len(dates), new_months=months)

    sev_rank = {"high": 0, "medium": 1, "info": 2}
    out: list[dict[str, Any]] = []
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for k, items in reasons.items():
        o = best_by_q[k]
        prev = recent.get(k)
        if prev is not None and o["price"] > prev - improve:
            continue  # stejný termín hlášen nedávno a cena neklesla dost
        kinds = [i[0] for i in items]
        extra: dict[str, Any] = {}
        for i in items:
            extra.update(i[3])
        out.append({
            "id": f"{today}-{o.get('id', '')}", "day": today, "created_at": now,
            "kinds": kinds, "kind": kinds[0],
            "kind_label": " + ".join(KIND_LABEL.get(x, x) for x in kinds),
            "severity": min((i[2] for i in items), key=lambda x: sev_rank.get(x, 9)),
            "reason": "; ".join(i[1] for i in items), "dedupe_key": k,
            "price": o["price"], "currency": o.get("currency", "CZK"), "score": o.get("score"),
            "origin": o["origin"], "destination": o["destination"],
            "depart_date": o["depart_date"], "return_date": o["return_date"], "nights": o.get("nights"),
            "route": o.get("route"), "airlines": o.get("airlines", []), "stops": o.get("stops"),
            "duration_min": o.get("duration_min"), "source": o["source"],
            "links": o.get("links", {}), "offer_id": o.get("id"), **extra,
        })
    # Priorita: více důvodů a vyšší závažnost první, pak lepší skóre; omezit počet za běh.
    out.sort(key=lambda a: (sev_rank.get(a["severity"], 9), -len(a["kinds"]), a.get("score") or a["price"]))
    # stejný odlet + stejná cena (jen jiná délka pobytu) = jedno hlášení
    seen_same: set[tuple] = set()
    merged = []
    for a in out:
        k = (a["origin"], a["destination"], a["depart_date"], a["price"], tuple(a["airlines"]))
        if k in seen_same:
            continue
        seen_same.add(k)
        merged.append(a)
    out = merged
    max_per_run = int(cfg.get("max_per_run", 8))
    kept, dropped = out[:max_per_run], out[max_per_run:]
    if dropped:
        kept[-1]["more"] = len(dropped)
    for a in kept:
        recent[a["dedupe_key"]] = a["price"]
    return kept


# ---------------------------------------------------------------- notifications
def _fmt(a: dict[str, Any]) -> str:
    air = ", ".join(a.get("airlines") or []) or "–"
    stops = a.get("stops")
    st = "přímý" if stops == 0 else f"{stops} přestup" if stops == 1 else f"{stops} přestupy"
    dur = a.get("duration_min")
    d = f", tam {dur // 60} h {dur % 60:02d} min" if dur else ""
    return (f"• {a['price']} {a['currency']}/os – {a['origin']}→{a['destination']} "
            f"{a['depart_date']} → {a['return_date']} ({a.get('nights')} dní), {air}, {st}{d}\n"
            f"  {a['kind_label']}: {a['reason']}\n"
            f"  Google: {a['links'].get('google', '')}")


def build_message(alerts: list[dict[str, Any]], payload: dict[str, Any]) -> tuple[str, str]:
    day = payload["day"]
    n = len(alerts)
    title = f"✈️ Thajsko 2027: {n} {'nový deal' if n == 1 else 'nové dealy' if n < 5 else 'nových dealů'} ({day})"
    body = "\n\n".join(_fmt(a) for a in alerts[:15])
    more = sum(a.get("more", 0) for a in alerts)
    if n > 15 or more:
        body += f"\n\n… a dalších {max(0, n - 15) + more} termínů splňuje podmínky (viz dashboard)."
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if repo:
        owner, name = repo.split("/", 1)
        body += f"\n\nDashboard: https://{owner}.github.io/{name}/"
    return title, body


def notify(alerts: list[dict[str, Any]], payload: dict[str, Any], channels: dict[str, Any]) -> dict[str, str]:
    if not alerts:
        return {}
    title, body = build_message(alerts, payload)
    results: dict[str, str] = {}

    if channels.get("github_issue") and os.environ.get("GITHUB_TOKEN") and os.environ.get("GITHUB_REPOSITORY"):
        try:
            md = "\n".join(f"- **{a['price']} {a['currency']}/os** {a['origin']}→{a['destination']} "
                           f"{a['depart_date']} → {a['return_date']} · {', '.join(a['airlines']) or '–'} · "
                           f"{a['kind_label']} ({a['reason']}) · [Google Flights]({a['links'].get('google', '')})"
                           for a in alerts[:30])
            repo = os.environ["GITHUB_REPOSITORY"]
            r = requests.post(
                f"https://api.github.com/repos/{repo}/issues",
                headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                         "Accept": "application/vnd.github+json"},
                json={"title": title, "body": md + "\n\n_Automatické hlášení ze skenu letenek._",
                      "labels": ["deal"]},
                timeout=30)
            results["github_issue"] = f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            results["github_issue"] = f"error: {e}"

    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if channels.get("telegram") and tok and chat:
        try:
            r = requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                              json={"chat_id": chat, "text": f"{title}\n\n{body}",
                                    "disable_web_page_preview": True}, timeout=30)
            results["telegram"] = f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            results["telegram"] = f"error: {e}"

    topic = os.environ.get("NTFY_TOPIC")
    if channels.get("ntfy") and topic:
        try:
            r = requests.post(f"https://ntfy.sh/{topic}", data=body.encode("utf-8"),
                              headers={"Title": title.encode("utf-8").decode("latin-1", "ignore"),
                                       "Tags": "airplane", "Priority": "high"}, timeout=30)
            results["ntfy"] = f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            results["ntfy"] = f"error: {e}"

    host, to = os.environ.get("SMTP_HOST"), os.environ.get("ALERT_EMAIL_TO")
    if channels.get("email") and host and to:
        try:
            msg = EmailMessage()
            msg["Subject"] = title
            msg["From"] = os.environ.get("SMTP_USER", "thajland@localhost")
            msg["To"] = to
            msg.set_content(body)
            port = int(os.environ.get("SMTP_PORT", "587"))
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.starttls()
                if os.environ.get("SMTP_USER"):
                    s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
                s.send_message(msg)
            results["email"] = "sent"
        except Exception as e:  # noqa: BLE001
            results["email"] = f"error: {e}"

    for k, v in results.items():
        log.info("notifikace %s: %s", k, v)
    return results

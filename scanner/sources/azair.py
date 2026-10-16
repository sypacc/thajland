"""Azair.eu – experimentální zdroj (oblíbený český vyhledávač levných kombinací).

Azair vrací klasické HTML; parsujeme konzervativně: každý `div.result` ->
cena + textový souhrn. Když se struktura změní, zdroj jen nevrátí nic
a běh pokračuje (Google Flights zůstává hlavní zdroj).
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re
from pathlib import Path
from typing import Any

import requests
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from ..links import build_links
from ..model import Offer

log = logging.getLogger("thajland.azair")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

_PRICE_RE = re.compile(r"(\d[\d\s ]{2,})\s*(?:Kč|CZK)")
_STOPS_RE = re.compile(r"(\d+)\s*(?:přestup|stop|change)", re.I)
_DUR_RE = re.compile(r"(\d+)\s*h\s*(\d+)?\s*(?:m|min)?", re.I)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def search(origin: str, dest: str, depart: dt.date, ret: dt.date, *, currency: str = "CZK",
           adults: int = 1, timeout: int = 60) -> tuple[list[Offer], dict[str, Any]]:
    links = build_links(origin, dest, depart.isoformat(), ret.isoformat(), adults=adults)
    url = links["azair"]
    meta: dict[str, Any] = {"url": url, "error": None, "count": 0}
    sess = requests.Session()
    sess.headers.update({"User-Agent": UA, "Accept-Language": "cs,en;q=0.8"})
    r = sess.get(url, timeout=timeout)
    meta["status"] = r.status_code
    if r.status_code != 200:
        meta["error"] = f"HTTP {r.status_code}"
        return [], meta

    tree = HTMLParser(r.text)
    nodes = tree.css("div.result")
    if not nodes:
        title = tree.css_first("title")
        snippet = _clean(tree.body.text(separator=" "))[:200] if tree.body else ""
        meta["error"] = (f"no div.result; title={title.text().strip()[:60] if title else '?'}; "
                         f"len={len(r.text)}; text={snippet}")
        d = os.environ.get("THAJLAND_DEBUG_DIR")
        if d:
            Path(d).mkdir(parents=True, exist_ok=True)
            (Path(d) / f"azair_{origin}-{dest}_{depart}.html").write_text(r.text, encoding="utf-8")
        return [], meta

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    offers: list[Offer] = []
    for n in nodes:
        text = _clean(n.text(separator=" "))
        price_node = n.css_first(".totalPrice .tp, .totalPrice, .tp")
        m = _PRICE_RE.search(_clean(price_node.text()) if price_node else text)
        if not m:
            continue
        try:
            price = int(re.sub(r"\D", "", m.group(1)))
        except ValueError:
            continue
        if price <= 0:
            continue
        airlines = sorted({_clean(a.text()) for a in n.css(".airline")} - {""})
        stops = None
        ms = _STOPS_RE.search(text)
        if ms:
            stops = int(ms.group(1))
        # Azair: "tam" segment often contains "x přestup" – fallback: count legs
        legs_out = n.css(".detail .text .from") or n.css(".from")
        if stops is None:
            stops = max(0, (len(legs_out) // 2) - 1) if legs_out else 1
        dur = None
        md = _DUR_RE.search(text)
        if md:
            dur = int(md.group(1)) * 60 + int(md.group(2) or 0)

        offers.append(Offer(
            source="azair", origin=origin, destination=dest,
            depart_date=depart.isoformat(), return_date=ret.isoformat(),
            nights=(ret - depart).days, price=price, currency=currency,
            airlines=airlines, stops=int(stops), legs=[], layovers=[],
            duration_min=dur, layover_total_min=0,
            note=text[:400], links=links, fetched_at=now,
        ))
    meta["count"] = len(offers)
    return offers, meta

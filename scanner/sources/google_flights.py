"""Google Flights přes knihovnu fast-flights (protobuf dotaz `tfs`).

Každý dotaz je samostatný HTTP požadavek bez uložených cookies/historie,
tedy ekvivalent anonymního okna. Když primp fetch selže (consent stránka,
blokace, změna HTML), zkusí se headless Chromium v čerstvém (incognito)
kontextu přes Playwright.
"""
from __future__ import annotations

import datetime as dt
import logging
import time
from typing import Any

from fast_flights import FlightQuery, Passengers, create_query, get_flights
from fast_flights.exceptions import FlightsNotFound
from fast_flights.parser import parse as parse_html

from ..links import build_links
from ..model import Layover, Leg, Offer

log = logging.getLogger("thajland.google")


class GoogleBlocked(RuntimeError):
    """Google vrátil stránku bez dat (captcha/consent/429)."""


def _iso(sd) -> str:
    y, m, d = sd.date
    hh, mm = sd.time
    return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}"


def _minutes_between(a: str, b: str) -> int:
    da = dt.datetime.fromisoformat(a)
    db = dt.datetime.fromisoformat(b)
    return int((db - da).total_seconds() // 60)


def make_query(origin: str, dest: str, depart: dt.date, ret: dt.date, *, currency: str,
               cabin: str, max_stops: int | None, adults: int = 1):
    return create_query(
        flights=[
            FlightQuery(date=depart.isoformat(), from_airport=origin, to_airport=dest),
            FlightQuery(date=ret.isoformat(), from_airport=dest, to_airport=origin),
        ],
        trip="round-trip",
        seat=cabin,  # type: ignore[arg-type]
        passengers=Passengers(adults=adults),
        language="cs",
        currency=currency,  # type: ignore[arg-type]
        max_stops=max_stops,
    )


def _fetch_html_playwright(url: str, timeout_ms: int = 45000) -> str:
    from playwright.sync_api import sync_playwright  # lazy import

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(  # new_context == incognito profile
            locale="cs-CZ",
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
            viewport={"width": 1366, "height": 900},
        )
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        # EU consent interstitial
        for sel in ("button:has-text('Přijmout vše')", "button:has-text('Accept all')",
                    "form[action*='consent'] button"):
            try:
                if page.locator(sel).first.is_visible(timeout=1500):
                    page.locator(sel).first.click()
                    page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
                    break
            except Exception:
                pass
        try:
            page.wait_for_selector("script.ds\\:1", state="attached", timeout=20000)
        except Exception:
            pass
        html = page.content()
        ctx.close()
        browser.close()
        return html


def search(origin: str, dest: str, depart: dt.date, ret: dt.date, *, currency: str = "CZK",
           cabin: str = "economy", max_stops: int | None = None, retries: int = 3,
           playwright_fallback: bool = True, adults: int = 1) -> tuple[list[Offer], dict[str, Any]]:
    """Vrátí (nabídky, meta). Nabídky = odletové itineráře s celkovou cenou zpáteční letenky."""
    q = make_query(origin, dest, depart, ret, currency=currency, cabin=cabin,
                   max_stops=max_stops, adults=adults)
    url = q.url()
    meta: dict[str, Any] = {"url": url, "method": None, "attempts": 0, "error": None}
    last_err: Exception | None = None
    results = None

    for attempt in range(1, retries + 1):
        meta["attempts"] = attempt
        try:
            results = get_flights(q)
            meta["method"] = "primp"
            break
        except FlightsNotFound as e:  # genuinely no flights
            meta["error"] = f"no flights: {e}"
            results = []
            break
        except Exception as e:  # noqa: BLE001 – parser/HTTP failure => maybe blocked
            last_err = e
            log.warning("google %s-%s %s: pokus %d selhal: %s", origin, dest, depart, attempt, e)
            time.sleep(min(30, 3 * attempt))

    if results is None and playwright_fallback:
        try:
            html = _fetch_html_playwright(url)
            results = parse_html(html)
            meta["method"] = "playwright"
        except FlightsNotFound as e:
            meta["error"] = f"no flights: {e}"
            results = []
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("google playwright fallback %s-%s %s selhal: %s", origin, dest, depart, e)

    if results is None:
        meta["error"] = f"{type(last_err).__name__}: {last_err}"
        raise GoogleBlocked(meta["error"])

    offers: list[Offer] = []
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    links = build_links(origin, dest, depart.isoformat(), ret.isoformat(), adults=adults,
                        google_url=url)
    for f in results:
        try:
            price = int(f.price)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        legs = [
            Leg(from_airport=s.from_airport.code, to_airport=s.to_airport.code,
                departure=_iso(s.departure), arrival=_iso(s.arrival),
                duration_min=int(s.duration or 0), plane=s.plane_type)
            for s in f.flights
        ]
        layovers = []
        for a, b in zip(legs, legs[1:]):
            try:
                layovers.append(Layover(airport=a.to_airport,
                                        minutes=max(0, _minutes_between(a.arrival, b.departure))))
            except ValueError:
                pass
        duration = sum(l.duration_min for l in legs) + sum(l.minutes for l in layovers)
        offers.append(Offer(
            source="google", origin=origin, destination=dest,
            depart_date=depart.isoformat(), return_date=ret.isoformat(),
            nights=(ret - depart).days, price=price, currency=currency,
            airlines=[a for a in (f.airlines or []) if a], stops=max(0, len(legs) - 1),
            legs=legs, layovers=layovers, duration_min=duration or None,
            layover_total_min=sum(l.minutes for l in layovers),
            links=links, fetched_at=now,
            note=("Cena je celková za zpáteční letenku pro 1 dospělého; zobrazen je itinerář tam, "
                  "zpáteční let si vybereš na Google Flights."),
        ))
    meta["count"] = len(offers)
    return offers, meta

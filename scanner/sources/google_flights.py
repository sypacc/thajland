"""Google Flights přes knihovnu fast-flights (protobuf dotaz `tfs`).

Každý dotaz je samostatný HTTP požadavek bez uložených cookies/historie,
tedy ekvivalent anonymního okna. Když primp fetch selže (consent stránka,
blokace, změna HTML), zkusí se headless Chromium v čerstvém (incognito)
kontextu přes Playwright.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from fast_flights import FlightQuery, Passengers, create_query, fetch_flights_html
from fast_flights.exceptions import FlightsNotFound
from fast_flights.parser import parse as parse_html

from ..links import build_links
from ..model import Layover, Leg, Offer

log = logging.getLogger("thajland.google")


class GoogleBlocked(RuntimeError):
    """Google vrátil stránku bez dat (captcha/consent/429)."""


_DEBUG_COUNT = {"n": 0}


def _debug_dump(name: str, content: str | bytes, limit: int = 12) -> None:
    """Uloží surovou odpověď pro ladění (jen když je nastaven THAJLAND_DEBUG_DIR)."""
    d = os.environ.get("THAJLAND_DEBUG_DIR")
    if not d or _DEBUG_COUNT["n"] >= limit:
        return
    _DEBUG_COUNT["n"] += 1
    path = Path(d) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")


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
        if "errorHasStatus: true" in html:
            try:
                _debug_dump("google_pw_error.png", page.screenshot(full_page=True))
            except Exception:
                pass
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

    not_found = 0
    for attempt in range(1, retries + 1):
        meta["attempts"] = attempt
        try:
            html = fetch_flights_html(q)
            results = parse_html(html)
            meta["method"] = "primp"
            break
        except FlightsNotFound as e:
            # Google vrací 'errorHasStatus' i při dočasné chybě / soft-blocku, ne jen bez letů.
            not_found += 1
            meta["error"] = f"no flights: {e}"
            try:
                _debug_dump(f"google_error_{origin}-{dest}_{depart}_{attempt}.html", html)  # type: ignore[name-defined]
            except Exception:
                pass
            if not_found >= 2:
                results = None
                break
            time.sleep(6 + 2 * attempt)
        except Exception as e:  # noqa: BLE001 – parser/HTTP failure => maybe blocked
            last_err = e
            log.warning("google %s-%s %s: pokus %d selhal: %s", origin, dest, depart, attempt, e)
            time.sleep(min(30, 3 * attempt))

    if results is None and playwright_fallback:
        try:
            html = _fetch_html_playwright(url)
            results = parse_html(html)
            meta["method"] = "playwright"
            meta["error"] = None
        except FlightsNotFound as e:
            meta["error"] = f"no flights: {e}"
            results = []
            meta["method"] = "playwright"
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("google playwright fallback %s-%s %s selhal: %s", origin, dest, depart, e)
    elif results is None and not_found:
        results = []  # bez fallbacku: považujeme za 'bez výsledků'

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


# ------------------------------------------------------------------ prodejci
_PRICE_LINE = re.compile(r"^(\d[\d\s .]{2,})\s*(?:Kč|CZK|€|EUR|\$)$")


def _parse_booking_options(text: str) -> list[dict[str, Any]]:
    """Z textu stránky 'Možnosti rezervace' vytáhne dvojice (prodejce, cena).

    Google vykresluje každou možnost jako blok řádků: název prodejce …, cena, tlačítko.
    Bereme poslední 'jmenný' řádek před řádkem s cenou.
    """
    lines = [l.strip() for l in text.splitlines()]
    sellers: list[dict[str, Any]] = []
    skip = {"vybrat", "select", "pokračovat", "continue", "rezervovat", "book", "zobrazit", "více",
            "more", "cena", "price", "celkem", "total", "oddělené letenky", "separate tickets",
            "samostatné letenky", "self transfer", "vlastní přestup", "nejlevnější", "cheapest",
            "doporučeno", "recommended", "nejlepší", "best"}
    for i, l in enumerate(lines):
        m = _PRICE_LINE.match(l.replace(" ", " "))
        if not m:
            continue
        price = int(re.sub(r"\D", "", m.group(1)) or 0)
        if price <= 0:
            continue
        name = None
        for j in range(i - 1, max(-1, i - 6), -1):
            cand = lines[j]
            if not cand or cand.lower() in skip or _PRICE_LINE.match(cand) or len(cand) > 60:
                continue
            if any(ch.isdigit() for ch in cand) and len(cand) < 6:
                continue
            name = cand
            break
        if name and not any(s["name"] == name and s["price"] == price for s in sellers):
            sellers.append({"name": name, "price": price})
    return sellers


def fetch_sellers(url: str, price: int, airline_hint: str | None = None, timeout_ms: int = 45000
                  ) -> tuple[list[dict[str, Any]], str | None]:
    """Otevře dotaz v headless Chromiu (incognito), vybere itinerář s danou cenou (a první
    zpáteční let) a přečte 'Možnosti rezervace'. Vrací (prodejci, chyba)."""
    from playwright.sync_api import sync_playwright

    price_str = f"{price:,}".replace(",", " ")
    price_alt = f"{price:,}".replace(",", " ")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale="cs-CZ", viewport={"width": 1366, "height": 900},
                                  user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                              "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"))
        page = ctx.new_page()
        step = "goto"
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            for sel in ("button:has-text('Přijmout vše')", "button:has-text('Accept all')"):
                try:
                    if page.locator(sel).first.is_visible(timeout=1500):
                        page.locator(sel).first.click()
                        break
                except Exception:
                    pass
            step = "výsledky"
            page.wait_for_function("document.body && /Kč|CZK/.test(document.body.innerText)", timeout=timeout_ms)
            page.wait_for_timeout(2000)
            # 1) itinerář tam: položka s naší cenou (a aerolinkou, pokud známe)
            items = page.locator("li").filter(has_text=price_str)
            if items.count() == 0:
                items = page.locator("li").filter(has_text=price_alt)
            if items.count() == 0:
                items = page.locator("li").filter(has_text=re.compile(rf"{price // 1000}\D?{price % 1000:03d}"))
            if airline_hint and items.count() > 1:
                hinted = items.filter(has_text=airline_hint)
                if hinted.count():
                    items = hinted
            if items.count() == 0:
                _debug_dump(f"sellers_nomatch_{price}.png", page.screenshot(full_page=True))
                return [], "itinerář s danou cenou nenalezen"
            step = "klik tam"
            target = items.first
            btn = target.locator("button, [role='button']").first
            try:
                (btn if btn.count() else target).click(timeout=8000)
            except Exception:
                target.click(timeout=8000, force=True)
            page.wait_for_timeout(3000)
            # 2) zpáteční let: pokud se zobrazil další seznam, vezmeme první (nejlepší)
            step = "klik zpět"
            txt = page.inner_text("body")
            if "Možnosti rezervace" not in txt and "Booking options" not in txt:
                lis = page.locator("li").filter(has_text=re.compile("Kč|CZK"))
                if lis.count():
                    t2 = lis.first
                    b2 = t2.locator("button, [role='button']").first
                    try:
                        (b2 if b2.count() else t2).click(timeout=8000)
                    except Exception:
                        t2.click(timeout=8000, force=True)
                    page.wait_for_timeout(3000)
            step = "možnosti rezervace"
            try:
                page.wait_for_selector("text=/Možnosti rezervace|Booking options/", timeout=15000)
            except Exception:
                _debug_dump(f"sellers_nobooking_{price}.png", page.screenshot(full_page=True))
                return [], "sekce 'Možnosti rezervace' se nezobrazila"
            txt = page.inner_text("body")
            idx = max(txt.find("Možnosti rezervace"), txt.find("Booking options"))
            section = txt[idx: idx + 6000]
            _debug_dump(f"sellers_section_{price}.txt", section)
            sellers = _parse_booking_options(section)
            return sellers, None if sellers else "nepodařilo se rozparsovat prodejce"
        except Exception as e:  # noqa: BLE001
            try:
                _debug_dump(f"sellers_fail_{price}.png", page.screenshot(full_page=True))
            except Exception:
                pass
            return [], f"[{step}] {type(e).__name__}: {str(e)[:120]}"
        finally:
            ctx.close()
            browser.close()

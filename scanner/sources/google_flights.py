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

import json

from fast_flights import FlightQuery, Passengers, create_query, fetch_flights_html
from fast_flights.exceptions import FlightsNotFound
from fast_flights.model import Airport, CarbonEmission, Flights, SimpleDatetime, SingleFlight
from fast_flights.parser import ResultList, _parse_time

from ..links import build_links
from ..model import Layover, Leg, Offer

log = logging.getLogger("thajland.google")


class GoogleBlocked(RuntimeError):
    """Google vrátil stránku bez dat (captcha/consent/429)."""


_DEBUG_COUNT = {"n": 0}


def parse_html(html: str) -> ResultList:
    """Tolerantní verze parseru fast-flights: vadná položka se přeskočí místo pádu celého dotazu.

    Google vrací dva seznamy (payload[2] = 'nejlepší', payload[3] = 'ostatní'); bereme oba.
    """
    from selectolax.lexbor import LexborHTMLParser

    parser = LexborHTMLParser(html)
    script = parser.css_first(r"script.ds\:1")
    if script is None:
        raise ValueError("stránka neobsahuje data (script.ds:1) – consent/captcha/blokace?")
    js = script.text()
    data = js.split("data:", 1)[1].rsplit(",", 1)[0]
    if data.endswith("errorHasStatus: true"):
        raise FlightsNotFound("no flights found; received error")
    payload = json.loads(data)

    flights = ResultList()
    seen: set[tuple] = set()
    skipped = 0
    for idx in (2, 3):
        try:
            lst = payload[idx][0]
        except (IndexError, TypeError):
            lst = None
        if not lst:
            continue
        for k in lst:
            try:
                flight = k[0]
                price = k[1][0][1]
                legs = []
                for sf in flight[2]:
                    legs.append(SingleFlight(
                        from_airport=Airport(code=sf[3], name=sf[4]),
                        to_airport=Airport(code=sf[6], name=sf[5]),
                        departure=SimpleDatetime(date=tuple(sf[20]), time=_parse_time(sf[8])),
                        arrival=SimpleDatetime(date=tuple(sf[21]), time=_parse_time(sf[10])),
                        duration=sf[11] or 0, plane_type=sf[17] or "",
                    ))
                key = (price, tuple((l.from_airport.code, l.departure.date, l.departure.time) for l in legs))
                if key in seen:
                    continue
                seen.add(key)
                extras = flight[22] if len(flight) > 22 and flight[22] else []
                carbon = CarbonEmission(
                    typical_on_route=(extras[8] if len(extras) > 8 and extras[8] else 0),
                    emission=(extras[7] if len(extras) > 7 and extras[7] else 0))
                flights.append(Flights(type=str(flight[0]), price=price, airlines=list(flight[1] or []),
                                       flights=legs, carbon=carbon))
            except (TypeError, IndexError, ValueError, KeyError):
                skipped += 1
                continue
    if skipped:
        log.info("parser: %d položek přeskočeno (neúplná data)", skipped)
    return flights


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
           playwright_fallback: bool = True, playwright_on_not_found: bool = True,
           adults: int = 1) -> tuple[list[Offer], dict[str, Any]]:
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
            meta["error"] = None
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

    use_pw = playwright_fallback and (playwright_on_not_found or not not_found)
    if results is None and use_pw:
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
        meta["method"] = "primp"

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
    meta["not_found"] = bool(not_found and not offers)
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


def _select_row(page, row) -> None:
    """Vybere let v řádku výsledků: tlačítko 'Vybrat let', jinak klik na cenu, jinak na řádek.

    První <button> v řádku bývá 'Zobrazit podrobnosti letu' (jen rozbalí detail), proto se mu vyhýbáme.
    """
    sel_btn = row.locator("button[aria-label*='Vybrat'], button[aria-label*='Select'], "
                          "[role='button'][aria-label*='Vybrat'], [role='button'][aria-label*='Select']")
    if sel_btn.count():
        try:
            sel_btn.first.click(timeout=8000)
            return
        except Exception:
            pass
    price_el = row.locator("text=/\\d[\\d\\s\\u00a0]*\\s?(Kč|CZK)/").first
    if price_el.count():
        try:
            price_el.click(timeout=8000)
            return
        except Exception:
            pass
    try:
        row.click(timeout=8000, position={"x": 40, "y": 20})
    except Exception:
        row.click(timeout=8000, force=True)


def _log_page_state(page, why: str) -> None:
    """Diagnostika do logu (artefakty nemusí být dostupné): URL, nadpisy, tlačítka, úryvek textu."""
    try:
        heads = page.locator("h1, h2, h3").all_inner_texts()[:12]
        btns = [b for b in page.locator("button[aria-label]").evaluate_all(
            "els => els.map(e => e.getAttribute('aria-label'))") if b][:15]
        body = re.sub(r"\s+", " ", page.inner_text("body"))[:900]
        log.info("prodejci diag (%s): url=%s | nadpisy=%s | tlačítka=%s | text=%s",
                 why, page.url[:120], heads, btns, body)
    except Exception as e:  # noqa: BLE001
        log.info("prodejci diag selhala: %s", e)


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
                _log_page_state(page, f"cena {price_str} nenalezena")
                return [], "itinerář s danou cenou nenalezen"
            step = "klik tam"
            _select_row(page, items.first)
            page.wait_for_timeout(3000)
            # 2) seznam zpátečních letů: vybereme první (Google řadí 'nejlepší')
            step = "klik zpět"
            for _ in range(2):
                txt = page.inner_text("body")
                if "Možnosti rezervace" in txt or "Booking options" in txt:
                    break
                lis = page.locator("li").filter(has_text=re.compile("Kč|CZK"))
                if lis.count() == 0:
                    break
                _select_row(page, lis.first)
                page.wait_for_timeout(3000)
            step = "možnosti rezervace"
            try:
                page.wait_for_selector("text=/Možnosti rezervace|Booking options/", timeout=15000)
            except Exception:
                _debug_dump(f"sellers_nobooking_{price}.png", page.screenshot(full_page=True))
                _log_page_state(page, "bez sekce rezervace")
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

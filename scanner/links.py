"""Deep links to flight search sites pre-filled with the query (odkud/kam/kdy)."""
from __future__ import annotations

import datetime as dt
from urllib.parse import quote_plus, urlencode

CITY_SLUG = {
    "PRG": "prague-czechia",
    "VIE": "vienna-austria",
    "BUD": "budapest-hungary",
    "BRQ": "brno-czechia",
    "MUC": "munich-germany",
    "BER": "berlin-germany",
    "BKK": "bangkok-thailand",
    "DMK": "bangkok-thailand",
    "HKT": "phuket-thailand",
    "CNX": "chiang-mai-thailand",
    "USM": "ko-samui-thailand",
    "KBV": "krabi-thailand",
}

CITY_NAME = {
    "PRG": "Prague", "VIE": "Vienna", "BUD": "Budapest", "BRQ": "Brno",
    "MUC": "Munich", "BER": "Berlin",
    "BKK": "Bangkok", "DMK": "Bangkok", "HKT": "Phuket", "CNX": "Chiang Mai",
    "USM": "Koh Samui", "KBV": "Krabi",
}


def _d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def build_links(origin: str, dest: str, depart: str, ret: str, adults: int = 1,
                google_url: str | None = None) -> dict[str, str]:
    dep, rt = _d(depart), _d(ret)
    links: dict[str, str] = {}

    if google_url:
        links["google"] = google_url
    else:
        links["google"] = (
            "https://www.google.com/travel/flights?hl=cs&curr=CZK&q="
            + quote_plus(f"Flights from {origin} to {dest} on {depart} through {ret}")
        )

    links["kiwi"] = (
        f"https://www.kiwi.com/cz/search/results/{CITY_SLUG.get(origin, origin.lower())}/"
        f"{CITY_SLUG.get(dest, dest.lower())}/{depart}/{ret}?adults={adults}"
    )

    links["skyscanner"] = (
        f"https://www.skyscanner.cz/transport/lety/{origin.lower()}/{dest.lower()}/"
        f"{dep:%y%m%d}/{rt:%y%m%d}/?adults={adults}&cabinclass=economy&rtn=1&preferdirects=false"
    )

    links["kayak"] = f"https://www.kayak.com/flights/{origin}-{dest}/{depart}/{ret}/{adults}adults?sort=bestflight_a"

    nights = (rt - dep).days
    az = {
        "tp": 0, "searchtype": "flexi", "isOneway": "return",
        "srcAirport": f"{CITY_NAME.get(origin, origin)} [{origin}]", "srcap0": origin,
        "dstAirport": f"{CITY_NAME.get(dest, dest)} [{dest}]", "dstap0": dest,
        "adults": adults, "children": 0, "infants": 0,
        "minHourStay": "0:45", "maxHourStay": "23:20",
        "minHourOutbound": "0:00", "maxHourOutbound": "24:00",
        "minHourInbound": "0:00", "maxHourInbound": "24:00",
        "depdate": f"{dep.day}.{dep.month}.{dep.year}",
        "arrdate": f"{rt.day}.{rt.month}.{rt.year}",
        "minDaysStay": max(1, nights - 1), "maxDaysStay": nights + 1,
        "nextday": 0, "autoprice": "true", "currency": "CZK",
        "wizzxclub": "false", "flyoneclub": "false", "blueairbenefits": "false",
        "megavolotea": "false", "schengen": "false", "transfer": "false",
        "samedep": "true", "samearr": "true",
        **{f"dep{i}": "true" for i in range(7)}, **{f"arr{i}": "true" for i in range(7)},
        "maxChng": 2, "resultSubmit": "Search",
    }
    links["azair"] = "https://www.azair.eu/azfin.php?" + urlencode(az)

    # České cestovky bez sdílitelných URL vyhledávání – odkaz na vyhledávač, termín zadáš ručně.
    links["pelikan"] = "https://www.pelikan.cz/cs/letenky"
    links["letuska"] = "https://www.letuska.cz/"

    return links

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Leg:
    from_airport: str
    to_airport: str
    departure: str  # ISO "YYYY-MM-DDTHH:MM" (local time)
    arrival: str
    duration_min: int
    airline: str | None = None
    plane: str | None = None


@dataclass
class Layover:
    airport: str
    minutes: int


@dataclass
class Offer:
    source: str                 # "google" | "azair"
    origin: str
    destination: str
    depart_date: str            # YYYY-MM-DD
    return_date: str
    nights: int
    price: int                  # per adult, in `currency`
    currency: str
    airlines: list[str] = field(default_factory=list)
    stops: int = 0
    legs: list[Leg] = field(default_factory=list)
    layovers: list[Layover] = field(default_factory=list)
    duration_min: int | None = None          # outbound total elapsed
    layover_total_min: int = 0
    note: str | None = None                  # free text (e.g. Azair summary)
    links: dict[str, str] = field(default_factory=dict)
    score: int | None = None                 # effective price (lower = better)
    score_breakdown: dict[str, int] = field(default_factory=dict)
    fetched_at: str | None = None

    @property
    def route(self) -> str:
        if not self.legs:
            return f"{self.origin}→{self.destination}"
        pts = [self.legs[0].from_airport] + [l.to_airport for l in self.legs]
        return "→".join(pts)

    @property
    def key(self) -> str:
        """Stable identity of an itinerary (route + times), independent of price."""
        base = "|".join([
            self.source, self.origin, self.destination, self.depart_date, self.return_date,
            ",".join(self.airlines), self.route,
            ",".join(l.departure for l in self.legs),
        ])
        return hashlib.sha1(base.encode()).hexdigest()[:12]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["route"] = self.route
        d["id"] = self.key
        return d

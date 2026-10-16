from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config.yaml"


@dataclass
class Config:
    raw: dict[str, Any]

    # --- trip ---------------------------------------------------------
    @property
    def origins(self) -> list[str]:
        return [str(x).upper() for x in self.raw["trip"]["origins"]]

    @property
    def destinations(self) -> list[str]:
        return [str(x).upper() for x in self.raw["trip"]["destinations"]]

    @property
    def depart_from(self) -> dt.date:
        return dt.date.fromisoformat(str(self.raw["trip"]["depart_from"]))

    @property
    def depart_to(self) -> dt.date:
        return dt.date.fromisoformat(str(self.raw["trip"]["depart_to"]))

    @property
    def depart_step_days(self) -> int:
        return int(self.raw["trip"].get("depart_step_days", 3))

    @property
    def trip_lengths(self) -> list[int]:
        return [int(x) for x in self.raw["trip"].get("trip_lengths", [14])]

    @property
    def travelers(self) -> int:
        return int(self.raw["trip"].get("travelers", 1))

    @property
    def cabin(self) -> str:
        return str(self.raw["trip"].get("cabin", "economy"))

    @property
    def currency(self) -> str:
        return str(self.raw["trip"].get("currency", "CZK"))

    @property
    def max_stops(self) -> int | None:
        v = self.raw["trip"].get("max_stops")
        return None if v in (None, "", "null") else int(v)

    # --- scan ---------------------------------------------------------
    @property
    def scan(self) -> dict[str, Any]:
        return self.raw.get("scan", {})

    def source_enabled(self, name: str) -> bool:
        return bool(self.scan.get("sources", {}).get(name, False))

    # --- scoring ------------------------------------------------------
    @property
    def scoring(self) -> dict[str, Any]:
        return self.raw.get("scoring", {})

    # --- derived ------------------------------------------------------
    def departure_dates(self) -> list[dt.date]:
        out = []
        d = self.depart_from
        while d <= self.depart_to:
            out.append(d)
            d += dt.timedelta(days=self.depart_step_days)
        return out

    def query_plan(self) -> list[tuple[str, str, dt.date, dt.date]]:
        """All (origin, destination, depart, return) combinations to scan."""
        plan = []
        for o in self.origins:
            for dst in self.destinations:
                for dep in self.departure_dates():
                    for n in self.trip_lengths:
                        plan.append((o, dst, dep, dep + dt.timedelta(days=n)))
        return plan


def load_config(path: Path | str | None = None) -> Config:
    p = Path(path) if path else DEFAULT_CONFIG
    with open(p, encoding="utf-8") as fh:
        return Config(raw=yaml.safe_load(fh))

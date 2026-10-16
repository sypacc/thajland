"""Skóre 'cena/výkon' = efektivní cena v Kč (cena + virtuální náklady za nepohodlí)."""
from __future__ import annotations

from typing import Any

from .model import Offer


def score_offer(o: Offer, cfg: dict[str, Any]) -> Offer:
    b: dict[str, int] = {"price": int(o.price)}

    baseline = int(cfg.get("baseline_duration_min", 840))
    per_hour = float(cfg.get("czk_per_extra_hour", 250))
    if o.duration_min:
        extra = max(0, o.duration_min - baseline)
        b["duration"] = int(round(extra / 60.0 * per_hour))

    if o.stops == 0:
        b["stops"] = int(cfg.get("czk_direct_bonus", -1500))
    elif o.stops > 1:
        b["stops"] = int((o.stops - 1) * float(cfg.get("czk_per_extra_stop", 1500)))

    comfort_max = int(cfg.get("layover_comfort_max_min", 300))
    long_per_hour = float(cfg.get("czk_per_long_layover_hour", 300))
    risky_min = int(cfg.get("layover_risky_min", 60))
    risky_pen = int(cfg.get("czk_risky_layover", 800))
    lay = 0
    for l in o.layovers:
        if l.minutes > comfort_max:
            lay += int(round((l.minutes - comfort_max) / 60.0 * long_per_hour))
        if 0 < l.minutes < risky_min:
            lay += risky_pen
    if lay:
        b["layover"] = lay

    adjust = cfg.get("airline_adjust_czk", {}) or {}
    air = 0
    seen = set()
    for a in o.airlines:
        for name, val in adjust.items():
            if name.lower() in a.lower() and name not in seen:
                air += int(val)
                seen.add(name)
    if air:
        b["airline"] = air

    o.score = int(sum(b.values()))
    o.score_breakdown = b
    return o


def rank(offers: list[Offer]) -> list[Offer]:
    return sorted(offers, key=lambda o: (o.score if o.score is not None else o.price, o.price))

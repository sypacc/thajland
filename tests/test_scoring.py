import datetime as dt

from scanner.config import Config
from scanner.links import build_links
from scanner.model import Layover, Leg, Offer
from scanner.scoring import rank, score_offer
from scanner import storage

CFG = {
    "baseline_duration_min": 840, "czk_per_extra_hour": 250, "czk_per_extra_stop": 1500,
    "czk_direct_bonus": -1500, "layover_comfort_max_min": 300, "czk_per_long_layover_hour": 300,
    "layover_risky_min": 60, "czk_risky_layover": 800,
    "airline_adjust_czk": {"Emirates": -1200, "Air China": 800},
}


def _offer(price, stops=1, duration=900, layovers=(120,), airlines=("Emirates",)):
    legs = [Leg("PRG", "DXB", "2027-08-05T15:00", "2027-08-05T23:00", 360)]
    return Offer(source="google", origin="PRG", destination="BKK", depart_date="2027-08-05",
                 return_date="2027-08-19", nights=14, price=price, currency="CZK",
                 airlines=list(airlines), stops=stops, legs=legs,
                 layovers=[Layover("DXB", m) for m in layovers], duration_min=duration)


def test_score_components():
    o = score_offer(_offer(20000, stops=1, duration=960, layovers=(420,)), CFG)
    b = o.score_breakdown
    assert b["price"] == 20000
    assert b["duration"] == 500            # 2 h over baseline
    assert b["layover"] == 600             # 2 h over 5h comfort
    assert b["airline"] == -1200
    assert "stops" not in b                # 1 stop = norm
    assert o.score == 20000 + 500 + 600 - 1200


def test_direct_bonus_and_extra_stops():
    direct = score_offer(_offer(25000, stops=0, duration=700, layovers=()), CFG)
    assert direct.score_breakdown["stops"] == -1500
    two = score_offer(_offer(15000, stops=2, duration=1200, layovers=(50, 400),
                             airlines=("Air China",)), CFG)
    assert two.score_breakdown["stops"] == 1500
    assert two.score_breakdown["layover"] == 800 + 500
    assert two.score_breakdown["airline"] == 800


def test_rank_prefers_better_value_not_just_cheapest():
    cheap_bad = score_offer(_offer(14000, stops=2, duration=1500, layovers=(600, 50),
                                   airlines=("Air China",)), CFG)
    pricier_good = score_offer(_offer(17000, stops=1, duration=840, layovers=(90,)), CFG)
    assert rank([cheap_bad, pricier_good])[0] is pricier_good


def test_query_plan_and_links():
    cfg = Config(raw={"trip": {"origins": ["prg"], "destinations": ["BKK"],
                               "depart_from": "2027-08-01", "depart_to": "2027-08-07",
                               "depart_step_days": 3, "trip_lengths": [14]}})
    plan = cfg.query_plan()
    assert [p[2].isoformat() for p in plan] == ["2027-08-01", "2027-08-04", "2027-08-07"]
    assert plan[0][3] == dt.date(2027, 8, 15)
    links = build_links("PRG", "BKK", "2027-08-05", "2027-08-19", adults=1)
    assert "prague-czechia/bangkok-thailand/2027-08-05/2027-08-19" in links["kiwi"]
    assert "/prg/bkk/270805/270819/" in links["skyscanner"]
    assert "depdate=5.8.2027" in links["azair"]
    assert links["google"].startswith("https://www.google.com/travel/flights")


def test_series_and_minima(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "HISTORY_DIR", tmp_path / "history")
    q = {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-05",
         "return_date": "2027-08-19", "source": "google", "status": "ok", "count": 3,
         "min_price": 18000, "best_score": 17500, "top": {"price": 18000}}
    storage.save_history_snapshot("2026-10-15", [q])
    q2 = dict(q, min_price=16500, best_score=16000)
    storage.save_history_snapshot("2026-10-16", [q2])
    hist = storage.load_history()
    assert [h["day"] for h in hist] == ["2026-10-15", "2026-10-16"]
    series = storage.build_series(hist)
    assert series["days"][1]["routes"]["PRG-BKK"]["min"] == 16500
    minima = storage.all_time_minima(hist)
    assert minima["PRG|BKK|2027-08-05|2027-08-19|google"] == {"min": 16500, "day": "2026-10-16"}
    storage.save_latest({"offers": [], "queries": [q2]})
    assert (tmp_path / "latest.js").read_text().startswith("window.THAJLAND_LATEST = ")

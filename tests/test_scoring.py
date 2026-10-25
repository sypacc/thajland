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


def test_longer_stay_bonus():
    cfg = dict(CFG, stay_baseline_days=13, czk_per_extra_stay_day=300)
    short = _offer(15000); short.nights = 13
    long = _offer(15000); long.nights = 22
    score_offer(short, cfg); score_offer(long, cfg)
    assert "stay" not in short.score_breakdown
    assert long.score_breakdown["stay"] == -2700 and long.score == short.score - 2700
    # bez nastavení se délka neuplatní
    assert "stay" not in score_offer(_offer(15000), CFG).score_breakdown


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
         "min_price": 18000, "best_score": 17500, "top": {"price": 18000, "score": 17500, "airlines": ["Qatar Airways"]}}
    storage.save_history_snapshot("2026-10-15", [q])
    q2 = dict(q, min_price=16500, best_score=16000, top={"price": 16500, "score": 16000, "airlines": ["Qatar Airways"]})
    q3 = dict(q, depart_date="2027-09-03", return_date="2027-09-17", min_price=17200, best_score=17000,
              top={"price": 17200, "score": 17000, "airlines": ["Austrian", "THAI"]})
    storage.save_history_snapshot("2026-10-16", [q2, q3])
    hist = storage.load_history()
    assert [h["day"] for h in hist] == ["2026-10-15", "2026-10-16"]
    series = storage.build_series(hist)
    assert series["days"][1]["routes"]["PRG-BKK"]["min"] == 16500
    # minima po aerolinkách (jen itineráře jedné aerolinky) a po měsících odletu
    assert series["days"][1]["airlines"] == {"Qatar Airways": {"min": 16500, "best": 16000, "n": 1}}
    assert series["days"][1]["months"] == {"08": 16500, "09": 17200}
    minima = storage.all_time_minima(hist)
    assert minima["PRG|BKK|2027-08-05|2027-08-19|google"] == {"min": 16500, "day": "2026-10-16"}
    storage.save_latest({"offers": [], "queries": [q2]})
    assert (tmp_path / "latest.js").read_text().startswith("window.THAJLAND_LATEST = ")


def test_booking_options_parser():
    from scanner.sources.google_flights import _parse_booking_options
    txt = """Možnosti rezervace
Rezervovat přes EmiratesLetecká společnost
19 477 Kč
Pokračovat
Kiwi.com
Oddělené letenky
18 980 Kč
Pokračovat
Informace o ceně
19 477 Kč je typická cena
Typické rozpětí
14 500 Kč
33 500 Kč
"""
    sellers, insight = _parse_booking_options(txt)
    assert sellers == [{"name": "Emirates", "price": 19477}, {"name": "Kiwi.com", "price": 18980}]
    assert insight == {"level": "typická", "low": 14500, "high": 33500}


def test_finalize_merges_parts_and_flags(tmp_path, monkeypatch):
    from scanner import run as runmod
    from scanner.config import Config
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "HISTORY_DIR", tmp_path / "history")
    cfg = Config(raw={"trip": {"origins": ["PRG", "VIE"], "destinations": ["BKK"], "depart_from": "2027-08-01",
                               "depart_to": "2027-08-02", "depart_step_days": 1, "trip_lengths": [14]},
                      "scan": {"enrich_sellers": False}, "scoring": {}})
    def q(o, dep, status="ok", price=20000):
        return {"origin": o, "destination": "BKK", "depart_date": dep, "return_date": "2027-08-15",
                "source": "google", "status": status, "count": 1 if status == "ok" else 0,
                "min_price": price if status == "ok" else None, "best_score": price, "top": None}
    def off(o, dep, price=20000):
        return {"id": f"{o}{dep}", "source": "google", "origin": o, "destination": "BKK", "depart_date": dep,
                "return_date": "2027-08-15", "nights": 14, "price": price, "currency": "CZK", "airlines": ["X"],
                "stops": 1, "legs": [], "layovers": [], "duration_min": 900, "score": price, "links": {}}
    # 3 dny historie jen pro PRG 08-01 -> PRG 08-02 a VIE budou 'nově v prodeji'
    for day in ("2026-10-10", "2026-10-11", "2026-10-12"):
        storage.save_history_snapshot(day, [q("PRG", "2027-08-01", price=21000)])
    parts = [{"offers": [off("PRG", "2027-08-01", 19000), off("PRG", "2027-08-02")],
              "queries": [q("PRG", "2027-08-01", price=19000), q("PRG", "2027-08-02")], "scan": {"duration_s": 10}},
             {"offers": [off("VIE", "2027-08-01")], "queries": [q("VIE", "2027-08-01"), q("VIE", "2027-08-02", "error")],
              "scan": {"duration_s": 12}}]
    payload = runmod.finalize(cfg, parts, enrich=False)
    assert payload["stats"]["queries_total"] == 4 and payload["stats"]["offers"] == 3
    by = {o["id"]: o for o in payload["offers"]}
    assert by["PRG2027-08-01"]["is_all_time_low"] is True and by["PRG2027-08-01"]["is_new"] is False
    assert by["PRG2027-08-02"]["is_new"] is True and by["PRG2027-08-02"]["is_new_route"] is False
    assert by["VIE2027-08-01"]["is_new"] is True and by["VIE2027-08-01"]["is_new_route"] is True
    assert payload["stats"]["queries_new"] == 2


def test_booking_horizon_and_stale_carry_for_transient_empty(tmp_path, monkeypatch):
    import datetime as dt
    from scanner import run as runmod
    from scanner.config import Config
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "HISTORY_DIR", tmp_path / "history")
    cfg = Config(raw={"trip": {"origins": ["PRG"], "destinations": ["BKK"], "depart_from": "2027-08-01",
                               "depart_to": "2027-08-02", "depart_step_days": 1, "trip_lengths": [14]},
                      "scan": {"enrich_sellers": False, "booking_horizon_days": 330}, "scoring": {}})
    assert runmod.booking_horizon(cfg, dt.date(2026, 10, 17)) == dt.date(2027, 9, 12)
    q_ok = {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-01", "return_date": "2027-08-15",
            "source": "google", "status": "ok", "count": 1, "min_price": 20000, "best_score": 20000, "top": None}
    o_ok = {"id": "a", "source": "google", "origin": "PRG", "destination": "BKK", "depart_date": "2027-08-01",
            "return_date": "2027-08-15", "nights": 14, "price": 20000, "currency": "CZK", "airlines": ["X"],
            "stops": 1, "legs": [], "layovers": [], "duration_min": 900, "score": 20000, "links": {"google": "u"}}
    storage.save_latest({"queries": [q_ok], "offers": [o_ok]})
    # dnes: stejný dotaz 'empty' uvnitř okna -> převezme se včerejšek jako stale; dotaz za oknem zůstane empty
    today_q = dict(q_ok, status="empty", count=0, min_price=None, beyond_horizon=False)
    far_q = dict(q_ok, depart_date="2027-09-20", return_date="2027-10-04", status="empty", count=0, min_price=None, beyond_horizon=True)
    payload = runmod.finalize(cfg, [{"offers": [], "queries": [today_q, far_q], "scan": {}}], enrich=False)
    qs = {q["depart_date"]: q for q in payload["queries"]}
    assert qs["2027-08-01"]["stale"] is True and qs["2027-08-01"]["stale_reason"] == "empty"
    assert qs["2027-09-20"]["status"] == "empty" and not qs["2027-09-20"].get("stale")
    assert payload["stats"]["queries_stale"] == 1 and payload["offers"][0]["stale"] is True


def test_finalize_with_seller_enrichment_enabled(tmp_path, monkeypatch):
    """Regrese: pořadí bloků ve finalize (sledované lety musí být vyhodnoceny před prodejci)."""
    from scanner import run as runmod
    from scanner import watchlist as wm
    from scanner.sources import google_flights
    from scanner.config import Config
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "HISTORY_DIR", tmp_path / "history")
    monkeypatch.setattr(wm, "WATCHLIST_PATH", tmp_path / "wl.yaml")
    monkeypatch.setattr(wm, "WATCH_DATA_PATH", tmp_path / "watch.json")
    monkeypatch.setattr(google_flights, "fetch_sellers", lambda url, price, hint=None: ([{"name": "Qatar Airways", "price": price}], None, {"level": "typická", "low": 14000, "high": 25000}))
    monkeypatch.setattr(runmod.time, "sleep", lambda s: None)
    cfg = Config(raw={"trip": {"origins": ["PRG"], "destinations": ["BKK"], "depart_from": "2027-08-01", "depart_to": "2027-08-01",
                               "depart_step_days": 1, "trip_lengths": [14]},
                      "scan": {"enrich_sellers": True, "enrich_sellers_top": 2}, "scoring": {}})
    o = {"id": "a", "source": "google", "origin": "PRG", "destination": "BKK", "depart_date": "2027-08-01", "return_date": "2027-08-15",
         "nights": 14, "price": 15295, "currency": "CZK", "airlines": ["Qatar Airways"], "stops": 1, "route": "PRG→DOH→BKK",
         "legs": [{"from_airport": "PRG", "to_airport": "DOH", "departure": "2027-08-01T15:50", "arrival": "2027-08-01T22:00", "duration_min": 370}],
         "layovers": [], "duration_min": 965, "score": 14600, "links": {"google": "https://g"}}
    q = {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-01", "return_date": "2027-08-15", "source": "google",
         "status": "ok", "count": 1, "min_price": 15295, "best_score": 14600, "top": None}
    payload = runmod.finalize(cfg, [{"offers": [o], "queries": [q], "scan": {}}], enrich=True)
    w = payload["watch"][0]
    assert w["auto"] is True and w["current"]["sellers"][0]["name"] == "Qatar Airways" and w["current"]["price_insight"]["level"] == "typická"
    assert payload["offers"][0]["watched"] is True and payload["offers"][0]["sellers"]

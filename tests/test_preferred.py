import json

from scanner import alerts, preferred, watchlist


def _o(o, d, dep, ret, price, airlines, score=None, route=None, id_=None):
    return {"id": id_ or f"{o}{d}{dep}{price}", "source": "google", "origin": o, "destination": d, "depart_date": dep,
            "return_date": ret, "nights": 14, "price": price, "currency": "CZK", "airlines": airlines,
            "route": route or f"{o}→X→{d}", "stops": 1, "score": score if score is not None else price,
            "links": {}, "legs": []}


PREF = {"airlines": ["Qatar Airways"], "target_price": 14000, "reserve_tips": 2, "recheck_top": 3}


def test_summary_and_new_low():
    offers = [_o("PRG", "BKK", "2027-08-10", "2027-08-24", 15000, ["Qatar Airways"]),
              _o("VIE", "HKT", "2027-09-02", "2027-09-16", 15800, ["Qatar Airways"]),
              _o("PRG", "BKK", "2027-08-11", "2027-08-25", 12000, ["LOT"])]
    s = preferred.summary(offers, PREF, {"routes": {"PRG-BKK": {"price": 15295}}})
    assert s["overall"]["price"] == 15000 and set(s["min_by_route"]) == {"PRG-BKK", "VIE-HKT"}
    assert s["min_by_month"]["08"]["price"] == 15000 and s["min_by_month"]["09"]["price"] == 15800
    assert s["new_low_routes"] == {"PRG-BKK": {"price": 15000, "previous": 15295}}
    m = preferred.update_minima({"routes": {"PRG-BKK": {"price": 15295}}}, s, "2026-10-19")
    assert m["routes"]["PRG-BKK"]["price"] == 15000 and m["routes"]["VIE-HKT"]["price"] == 15800


def test_auto_select_reserves_preferred():
    offers = [_o("PRG", "BKK", "2027-08-0%d" % i, "2027-08-2%d" % i, 13000 + i, ["LOT"], score=13000 + i, route=f"PRG→WAW→BKK{i}") for i in range(1, 6)]
    offers += [_o("PRG", "BKK", "2027-08-20", "2027-09-03", 15500, ["Qatar Airways"], score=15000, route="PRG→DOH→BKK"),
               _o("VIE", "HKT", "2027-08-21", "2027-09-04", 15900, ["Qatar Airways"], score=15400, route="VIE→DOH→HKT")]
    picked = watchlist.auto_select(offers, 5, per_route=5, preferred=PREF)
    airlines = [tuple(o["airlines"]) for o in picked]
    assert airlines[:2] == [("Qatar Airways",), ("Qatar Airways",)]
    assert len(picked) == 5 and len({o["id"] for o in picked}) == 5
    # bez preference by Qatar nebyl vůbec
    assert all(o["airlines"] == ["LOT"] for o in watchlist.auto_select(offers, 5, per_route=5))


def test_recheck_keys_cheapest_pref_dates():
    latest = {"offers": [_o("PRG", "BKK", "2027-08-1%d" % i, "2027-08-2%d" % i, 16000 - i * 100, ["Qatar Airways"]) for i in range(5)]
              + [_o("PRG", "BKK", "2027-08-30", "2027-09-13", 9000, ["LOT"])]}
    keys = preferred.recheck_keys(latest, PREF)
    assert keys == ["PRG|BKK|2027-08-14|2027-08-24", "PRG|BKK|2027-08-13|2027-08-23", "PRG|BKK|2027-08-12|2027-08-22"]


def test_alerts_pref_kinds():
    offers = [_o("PRG", "BKK", "2027-08-10", "2027-08-24", 13900, ["Qatar Airways"], id_="a"),
              _o("VIE", "HKT", "2027-09-02", "2027-09-16", 15100, ["Qatar Airways"], id_="b")]
    pref = preferred.summary(offers, PREF, {"routes": {"VIE-HKT": {"price": 15300}}})
    payload = {"day": "2026-10-19", "offers": offers, "preferred": pref, "watch": []}
    out = alerts.detect(payload, [], {"target_price": 12000, "max_per_run": 8}, [])
    kinds = {a["offer_id"]: a["kinds"] for a in out}
    assert "pref_target" in kinds["a"] and "pref_low" in kinds["b"]
    assert all(a["severity"] == "high" for a in out)

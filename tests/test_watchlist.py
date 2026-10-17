import datetime as dt

from scanner import watchlist as w


def _offer(o, d, dep, ret, price, airlines=("Qatar Airways",), route="PRG→DOH→BKK", dep_time="15:50", score=None, stale=False):
    return {"id": f"{o}{dep}{price}", "source": "google", "origin": o, "destination": d, "depart_date": dep,
            "return_date": ret, "nights": 14, "price": price, "currency": "CZK", "airlines": list(airlines),
            "stops": 1, "route": route, "duration_min": 900, "score": score or price,
            "legs": [{"from_airport": o, "to_airport": "DOH", "departure": f"{dep}T{dep_time}", "arrival": f"{dep}T20:00", "duration_min": 300}],
            "layovers": [], "links": {"google": "https://g"}, "stale": stale}


def test_parse_issue_with_json_body():
    body = "text\n```json\n{\"itin\": {\"airlines\": [\"Qatar Airways\"], \"route\": \"PRG→DOH→BKK\", \"dep_time\": \"15:50\"}, \"price_at_add\": 15295}\n```"
    cmd, e = w.parse_issue("watch: PRG→BKK 2027-08-26 → 2027-09-09", body)
    assert cmd == "watch" and e["itin"]["dep_time"] == "15:50" and e["price_at_add"] == 15295
    assert w.parse_issue("unwatch: PRG-BKK 2027-08-26 - 2027-09-09", "")[0] == "unwatch"
    assert w.parse_issue("něco jiného", "") is None


def test_apply_issue_add_update_remove():
    data = {"auto": {}, "watch": []}
    assert w.apply_issue(data, "watch", {"origin": "prg", "destination": "bkk", "depart_date": "2027-08-26", "return_date": "2027-09-09"}, "2026-10-17") == "přidáno"
    assert w.apply_issue(data, "watch", {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-26", "return_date": "2027-09-09", "note": "x"}, "2026-10-18") == "už sledováno, aktualizováno"
    assert data["watch"][0]["note"] == "x" and data["watch"][0]["added"] == "2026-10-17"
    assert w.apply_issue(data, "unwatch", {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-26", "return_date": "2027-09-09"}, "2026-10-19").startswith("odebráno")
    assert data["watch"] == []


def test_evaluate_auto_pins_and_history(tmp_path, monkeypatch):
    wl = {"auto": {"enabled": True, "top": 2, "keep_days": 10},
          "watch": [{"origin": "VIE", "destination": "HKT", "depart_date": "2027-08-19", "return_date": "2027-09-01",
                     "itin": {"airlines": ["Scoot"], "route": "VIE→SIN→HKT"}, "added": "2026-10-16", "price_at_add": 14258}]}
    offers = [_offer("PRG", "BKK", "2027-08-26", "2027-09-09", 15295, score=14600),
              _offer("PRG", "BKK", "2027-08-25", "2027-09-09", 15295, score=14650),
              _offer("PRG", "BKK", "2027-08-10", "2027-08-24", 19000, score=19000, airlines=("Turkish Airlines",), route="PRG→IST→BKK"),
              _offer("VIE", "HKT", "2027-08-19", "2027-09-01", 14900, airlines=("Scoot",), route="VIE→SIN→HKT", score=20000),
              _offer("VIE", "HKT", "2027-08-19", "2027-09-01", 14100, airlines=("Emirates",), route="VIE→DXB→HKT", score=20500)]
    wd = {"items": {"VIE|HKT|2027-08-19|2027-09-01": {"history": [{"day": "2026-10-16", "min": 14258, "itin": 14258}]}}}
    items = w.evaluate(wl, {"day": "2026-10-17", "offers": offers}, wd)
    keys = [i["key"] for i in items]
    assert "VIE|HKT|2027-08-19|2027-09-01" in keys and len(items) == 3            # 1 ruční + 2 auto
    manual = next(i for i in items if i["origin"] == "VIE")
    assert manual["same_itinerary"] is True and manual["current"]["price"] == 14900   # cena stejného letu (Scoot), ne nejlevnější
    assert manual["cheapest_any"]["price"] == 14100 and manual["prev_price"] == 14258
    assert len(manual["history"]) == 2 and manual["min_seen"] == 14258
    auto = [i for i in items if i["auto"]]
    # pestrost: stejný itinerář (Qatar PRG→DOH→BKK) jen jednou, druhý auto pin je jiný let
    assert {a["depart_date"] for a in auto} == {"2027-08-26", "2027-08-10"}
    assert any(e.get("auto") and e.get("price_at_add") == 15295 for e in wl["watch"])


def test_auto_pin_expires():
    wl = {"auto": {"enabled": True, "top": 1, "keep_days": 2},
          "watch": [{"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-01", "return_date": "2027-08-15",
                     "auto": True, "added": "2026-10-01", "last_top": "2026-10-01"}]}
    items = w.evaluate(wl, {"day": "2026-10-17", "offers": [_offer("PRG", "BKK", "2027-08-26", "2027-09-09", 15295)]}, {"items": {}})
    assert [i["depart_date"] for i in items] == ["2027-08-26"]


def test_itinerary_match_ignores_shifted_departure_time():
    wl = {"auto": {"enabled": False}, "watch": [{"origin": "VIE", "destination": "HKT", "depart_date": "2027-08-19",
                                                "return_date": "2027-09-01", "itin": {"airlines": ["Scoot"], "route": "VIE→SIN→HKT", "dep_time": "12:10"}}]}
    offers = [_offer("VIE", "HKT", "2027-08-19", "2027-09-01", 14254, airlines=("Scoot",), route="VIE→SIN→HKT", dep_time="10:25"),
              _offer("VIE", "HKT", "2027-08-19", "2027-09-01", 14900, airlines=("Scoot",), route="VIE→SIN→HKT", dep_time="12:10"),
              _offer("VIE", "HKT", "2027-08-19", "2027-09-01", 13900, airlines=("Emirates",), route="VIE→DXB→HKT")]
    items = w.evaluate(wl, {"day": "2026-10-17", "offers": offers}, {"items": {}})
    assert items[0]["same_itinerary"] is True and items[0]["current"]["price"] == 14900   # preferuje stejný čas odletu
    wl["watch"][0]["itin"]["dep_time"] = "07:00"
    items = w.evaluate(wl, {"day": "2026-10-17", "offers": offers}, {"items": {}})
    assert items[0]["current"]["price"] == 14254                                          # jinak nejlevnější Scoot, ne Emirates

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
    # pokles o pár korun není nové minimum
    assert not preferred.summary(offers, PREF, {"routes": {"PRG-BKK": {"price": 15100}}})["new_low_routes"]
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
    pref = preferred.summary(offers, PREF, {"routes": {"VIE-HKT": {"price": 15400}}})
    payload = {"day": "2026-10-19", "offers": offers, "preferred": pref, "watch": []}
    out = alerts.detect(payload, [], {"target_price": 12000, "max_per_run": 8}, [])
    kinds = {a["offer_id"]: a["kinds"] for a in out}
    assert "pref_target" in kinds["a"] and "pref_low" in kinds["b"]
    assert all(a["severity"] == "high" for a in out)


PREF2 = dict(PREF, peers=["Emirates", "EVA Air"], peer_target_price=14000, peer_drop_pct=20, peer_recheck_top=2)


def test_peer_summary_miracle_and_alerts():
    offers = [_o("PRG", "BKK", "2027-08-10", "2027-08-24", 15000, ["Emirates"], id_="e1"),
              _o("VIE", "BKK", "2027-08-12", "2027-08-26", 13500, ["EVA Air"], id_="v1"),
              _o("VIE", "HKT", "2027-08-13", "2027-08-27", 17000, ["Emirates"], id_="e2")]
    prev = {"airlines_min": {"Emirates": {"PRG-BKK": {"price": 19000}, "VIE-HKT": {"price": 17500}}}}
    s = preferred.summary(offers, PREF2, prev)
    em = s["peers"]["Emirates"]
    assert em["overall"]["price"] == 15000 and em["miracles"] == {"PRG-BKK": {"price": 15000, "previous": 19000, "drop_pct": 21}}
    assert s["peers"]["EVA Air"]["overall"]["price"] == 13500 and not s["peers"]["EVA Air"]["miracles"]
    m = preferred.update_minima(prev, s, "2026-10-19")
    assert m["airlines_min"]["Emirates"]["PRG-BKK"]["price"] == 15000 and m["airlines_min"]["EVA Air"]["VIE-BKK"]["price"] == 13500
    assert m["airlines_min"]["Emirates"]["VIE-HKT"]["price"] == 17000
    out = alerts.detect({"day": "2026-10-19", "offers": offers, "preferred": s, "watch": []}, [], {"target_price": 10000, "max_per_run": 8}, [])
    kinds = {a["offer_id"]: a["kinds"] for a in out}
    assert "peer_miracle" in kinds["e1"] and "peer_target" in kinds["v1"] and "e2" not in kinds
    assert preferred.peer_recheck_keys({"offers": offers}, PREF2) == ["PRG|BKK|2027-08-10|2027-08-24", "VIE|HKT|2027-08-13|2027-08-27", "VIE|BKK|2027-08-12|2027-08-26"]


def test_pref_alert_sticks_to_preferred_offer_not_cheaper_rival():
    # stejný termín: Finnair levnější než Qatar; hlášení o Qataru musí nést Qatar
    offers = [_o("VIE", "BKK", "2027-09-01", "2027-09-14", 15626, ["Finnair"], id_="f"),
              _o("VIE", "BKK", "2027-09-01", "2027-09-14", 17000, ["Qatar Airways"], id_="q")]
    pref = preferred.summary(offers, PREF, {"routes": {"VIE-BKK": {"price": 17411}}})
    out = alerts.detect({"day": "2026-10-20", "offers": offers, "preferred": pref, "watch": []}, [], {"target_price": 10000, "max_per_run": 8}, [])
    low = [a for a in out if "pref_low" in a["kinds"]]
    assert len(low) == 1 and low[0]["airlines"] == ["Qatar Airways"] and low[0]["price"] == 17000


def test_peer_miracle_merges_into_regular_alert_of_same_offer():
    # Etihad spadl o 23 %: běžné hlášení (pod cílovou cenou) i zázračná sleva se týkají téže nabídky -> jedno hlášení s oběma důvody
    offers = [_o("PRG", "BKK", "2027-08-22", "2027-09-05", 14522, ["Etihad"], id_="et")]
    pref = preferred.summary(offers, PREF2 | {"peers": ["Etihad"]}, {"airlines_min": {"Etihad": {"PRG-BKK": {"price": 18908}}}})
    out = alerts.detect({"day": "2026-10-21", "offers": offers, "preferred": pref, "watch": []}, [], {"target_price": 15000, "max_per_run": 8}, [])
    assert len(out) == 1 and set(out[0]["kinds"]) == {"target", "peer_miracle"}


def test_auto_select_rated_only_and_peer_reserve():
    def rated(o, adj):
        o["score_breakdown"] = {"price": o["price"], "airline": adj}
        return o
    offers = [rated(_o("PRG", "BKK", "2027-08-0%d" % i, "2027-08-2%d" % i, 12000 + i, ["LOT"], score=12000 + i, route=f"PRG→WAW→BKK{i}"), 0) for i in range(1, 4)]
    offers += [rated(_o("VIE", "HKT", "2027-08-1%d" % i, "2027-09-0%d" % i, 12500 + i, ["Scoot"], score=13300 + i, route=f"VIE→SIN→HKT{i}"), 800) for i in range(1, 4)]
    offers += [rated(_o("PRG", "BKK", "2027-08-20", "2027-09-03", 15500, ["Qatar Airways"], score=13700, route="PRG→DOH→BKK"), -1800),
               rated(_o("PRG", "BKK", "2027-08-25", "2027-09-08", 14000, ["Etihad"], score=13200, route="PRG→AUH→BKK"), -800),
               rated(_o("VIE", "BKK", "2027-09-01", "2027-09-16", 16900, ["Emirates"], score=15700, route="VIE→DXB→BKK"), -1200),
               rated(_o("VIE", "BKK", "2027-08-22", "2027-09-06", 16000, ["Turkish Airlines"], score=15400, route="VIE→IST→BKK"), -600),
               rated(_o("VIE", "HKT", "2027-08-23", "2027-09-07", 16500, ["Austrian", "THAI"], score=16000, route="VIE→BKK→HKT"), -900)]
    offers += [rated(_o("VIE", "BKK", "2027-08-20", "2027-09-10", 14700, ["SalamAir", "Oman Air"], score=14600, route="VIE→MCT→BKK"), -200)]
    pref = dict(PREF, tips_rated_only=True, peer_reserve_tips=2, peers=["Emirates", "Etihad"])
    scoring = {"airline_adjust_czk": {"Qatar Airways": -1800, "Etihad": -800, "Emirates": -1200, "Turkish Airlines": -600,
                                      "Austrian": -300, "THAI": -600, "Oman Air": -200, "Scoot": 800}}
    picked = watchlist.auto_select(offers, 6, per_route=2, preferred=pref, scoring=scoring)
    airlines = [tuple(o["airlines"]) for o in picked]
    assert ("LOT",) not in airlines and ("Scoot",) not in airlines
    assert ("SalamAir", "Oman Air") not in airlines              # kombinace s nehodnocenou nízkonákladovou neprojde
    assert ("Austrian", "THAI") in airlines                       # kombinace dvou hodnocených ano
    # dva tipy na stejný termín (trasa + data) nejdou zapsat: Etihad se stejnými daty jako Qatar dostane jiný termín
    offers += [rated(_o("PRG", "BKK", "2027-08-20", "2027-09-03", 14500, ["Etihad"], score=13000, route="PRG→AUH→BKK2"), -800)]
    picked = watchlist.auto_select(offers, 6, per_route=2, preferred=pref, scoring=scoring)
    keys = [watchlist.watch_key(o["origin"], o["destination"], o["depart_date"], o["return_date"]) for o in picked]
    assert len(keys) == len(set(keys))
    etihad = [o for o in picked if o["airlines"] == ["Etihad"]]
    assert len(etihad) == 1 and etihad[0]["depart_date"] == "2027-08-25"
    assert airlines[0] == ("Qatar Airways",)                      # rezervované místo preferované
    assert airlines[1:3] == [("Etihad",), ("Emirates",)]         # prémiová skupina, nejlevnější napřed
    assert all(o["score_breakdown"]["airline"] < 0 for o in picked)
    # bez přepínače by levné nabídky vyhrály na skóre
    assert ("LOT",) in [tuple(o["airlines"]) for o in watchlist.auto_select(offers, 6, per_route=2, preferred=PREF)]


def test_evaluate_drops_unrated_auto_entries():
    scoring = {"airline_adjust_czk": {"Qatar Airways": -1800, "Scoot": 800}}
    wl = {"auto": {"enabled": True, "top": 1, "keep_days": 10}, "watch": [
        {"origin": "VIE", "destination": "HKT", "depart_date": "2027-08-24", "return_date": "2027-09-07", "auto": True, "added": "2026-10-20", "last_top": "2026-10-21", "itin": {"airlines": ["Scoot"]}},
        {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-29", "return_date": "2027-09-13", "auto": True, "added": "2026-10-20", "last_top": "2026-10-21", "itin": {"airlines": ["LOT"]}},
        {"origin": "PRG", "destination": "BKK", "depart_date": "2027-08-26", "return_date": "2027-09-09", "note": "ručně", "itin": {"airlines": ["LOT"]}},
    ]}
    payload = {"day": "2026-10-22", "offers": [], "preferred": dict(PREF, tips_rated_only=True), "scoring": scoring}
    watchlist.evaluate(wl, payload, {})
    kept = [(e.get("auto", False), e["itin"]["airlines"][0]) for e in wl["watch"]]
    assert kept == [(False, "LOT")]   # automatické tipy bez bonusu pryč, ruční zůstal

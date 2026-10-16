from scanner import alerts


CFG = {"enabled": True, "target_price": 15000, "drop_pct": 12, "drop_czk": 2500,
       "anomaly_pct": 15, "anomaly_min_days": 3, "route_low_min_days": 2,
       "dedupe_days": 7, "dedupe_improve_czk": 500}


def _offer(price, dep="2027-08-05", dest="BKK", yesterday=None, oid="x1"):
    return {"id": oid, "source": "google", "origin": "PRG", "destination": dest, "depart_date": dep,
            "return_date": "2027-08-19", "nights": 14, "price": price, "currency": "CZK",
            "airlines": ["Emirates"], "stops": 1, "route": f"PRG→DXB→{dest}", "duration_min": 900,
            "score": price, "links": {"google": "https://g"}, "yesterday_min": yesterday}


def _snap(day, recs):
    return {"day": day, "records": [{"o": "PRG", "d": d, "dep": dep, "ret": "2027-08-19",
                                     "src": "google", "min": m} for (d, dep, m) in recs]}


def test_target_drop_anomaly_route_low():
    payload = {"day": "2026-10-20", "offers": [
        _offer(14500, yesterday=17500, oid="a"),                 # target + drop + anomaly + route low
        _offer(19000, dep="2027-08-08", oid="b"),                # nic
    ]}
    history = [_snap(f"2026-10-1{i}", [("BKK", "2027-08-05", 18000 + i * 100), ("BKK", "2027-08-08", 19000)])
               for i in range(5)]
    out = alerts.detect(payload, history, CFG)
    assert len(out) == 1 and out[0]["offer_id"] == "a"
    assert sorted(out[0]["kinds"]) == ["anomaly", "drop", "route_low", "target"]
    assert out[0]["severity"] == "high"
    assert "pod cílovou cenou" in out[0]["kind_label"]


def test_dedupe_suppresses_repeat_unless_cheaper():
    payload = {"day": "2026-10-21", "offers": [_offer(14800, oid="a")]}
    existing = [{"day": "2026-10-20", "dedupe_key": "PRG|BKK|2027-08-05|2027-08-19|google", "price": 14900}]
    assert alerts.detect(payload, [], CFG, existing) == []            # jen o 100 levnější
    payload["offers"][0]["price"] = 14300
    out = alerts.detect(payload, [], CFG, existing)
    assert [a["kind"] for a in out] == ["target"]                      # o 600 levnější => znovu


def test_stale_offers_ignored_and_message_built():
    payload = {"day": "2026-10-21", "offers": [dict(_offer(12000), stale=True)]}
    assert alerts.detect(payload, [], CFG) == []
    payload = {"day": "2026-10-21", "offers": [_offer(12000)]}
    out = alerts.detect(payload, [], CFG)
    title, body = alerts.build_message(out, payload)
    assert "1 nový deal" in title and "12000 CZK/os" in body and "pod cílovou cenou" in body


def test_disabled():
    assert alerts.detect({"day": "2026-10-21", "offers": [_offer(1000)]}, [], {"enabled": False}) == []


def test_max_per_run_and_more_counter():
    offers = [_offer(14000 + i * 10, dep=f"2027-08-{10 + i:02d}", oid=f"o{i}") for i in range(12)]
    out = alerts.detect({"day": "2026-10-21", "offers": offers}, [], dict(CFG, max_per_run=5))
    assert len(out) == 5 and out[-1]["more"] == 7

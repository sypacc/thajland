import datetime as dt

from scanner import complement, storage


def _q(o, d, dep, ret, status="ok", count=2, min_price=15000, **kw):
    return {"origin": o, "destination": d, "depart_date": dep, "return_date": ret, "source": "google",
            "status": status, "count": count if status == "ok" else 0,
            "min_price": min_price if status == "ok" else None, **kw}


def _o(o, d, dep, ret, price):
    return {"origin": o, "destination": d, "depart_date": dep, "return_date": ret, "source": "google", "price": price}


def test_select_prefers_watched_then_failed_then_stale_then_empty():
    horizon = dt.date(2027, 9, 12)
    latest = {"queries": [
        _q("PRG", "BKK", "2027-08-01", "2027-08-15"),                              # ok -> ne
        _q("PRG", "BKK", "2027-08-02", "2027-08-16", status="error"),              # selhal
        _q("PRG", "BKK", "2027-08-03", "2027-08-17", stale=True, stale_days=2),     # převzatý
        _q("PRG", "BKK", "2027-08-04", "2027-08-18", status="empty"),              # prázdný v okně
        _q("PRG", "BKK", "2027-09-20", "2027-10-04", status="empty"),              # prázdný za oknem -> ne
        _q("VIE", "HKT", "2027-08-05", "2027-08-19"),                              # sledovaný
        _q("PRG", "HKT", "2027-08-28", "2027-09-11"),                              # hranice okna
    ]}
    sel = complement.select_queries(latest, today=dt.date(2026, 10, 19), horizon=horizon,
                                    watched={"VIE|HKT|2027-08-05|2027-08-19"})
    keys = list(sel)
    assert keys[0] == "VIE|HKT|2027-08-05|2027-08-19"
    assert "PRG|BKK|2027-08-02|2027-08-16" in keys and "PRG|BKK|2027-08-03|2027-08-17" in keys
    assert "PRG|BKK|2027-08-04|2027-08-18" in keys and "PRG|HKT|2027-08-28|2027-09-11" in keys
    assert "PRG|BKK|2027-08-01|2027-08-15" not in keys
    assert "PRG|BKK|2027-09-20|2027-10-04" not in keys
    assert sel["PRG|BKK|2027-08-02|2027-08-16"].startswith("ranní běh")


def test_merge_replaces_only_when_better():
    latest = {"day": "2026-10-19", "stats": {"duration_s": 100},
              "queries": [_q("PRG", "BKK", "2027-08-01", "2027-08-15", min_price=16000),
                          _q("PRG", "BKK", "2027-08-02", "2027-08-16", status="error"),
                          _q("PRG", "BKK", "2027-08-03", "2027-08-17", min_price=14000)],
              "offers": [_o("PRG", "BKK", "2027-08-01", "2027-08-15", 16000),
                         _o("PRG", "BKK", "2027-08-03", "2027-08-17", 14000)]}
    new_part = {"scan": {"duration_s": 50},
                "queries": [_q("PRG", "BKK", "2027-08-01", "2027-08-15", min_price=15000),   # levněji -> nahradit
                            _q("PRG", "BKK", "2027-08-02", "2027-08-16", status="empty"),   # error -> empty: nahradit
                            _q("PRG", "BKK", "2027-08-03", "2027-08-17", status="error"),   # horší -> ponechat
                            _q("PRG", "BKK", "2027-08-04", "2027-08-18", status="skipped_budget")],
                "offers": [_o("PRG", "BKK", "2027-08-01", "2027-08-15", 15000),
                           _o("PRG", "BKK", "2027-08-03", "2027-08-17", 99999)]}
    base, new, stats = complement.merge_parts(latest, new_part)
    assert stats == {"reran": 3, "replaced": 2, "improved": 1, "newly_ok": 0, "kept": 1}
    base_keys = {storage.query_key(q) for q in base["queries"]}
    assert base_keys == {"PRG|BKK|2027-08-03|2027-08-17|google"}
    assert [o["price"] for o in base["offers"]] == [14000]
    assert {storage.query_key(q) for q in new["queries"]} == {"PRG|BKK|2027-08-01|2027-08-15|google", "PRG|BKK|2027-08-02|2027-08-16|google"}
    assert [o["price"] for o in new["offers"]] == [15000]
    assert all(q["run"] == "complement" for q in new["queries"])

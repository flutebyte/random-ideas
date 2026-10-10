import pytest

import analyses


def spec(t, cols, agg=None, i=1):
    return {"id": f"f{i}", "type": t, "title": t, "why": "w", "columns": cols, "agg": agg}


def test_validate_rejects_bad_and_fixes_swaps(dataset):
    _, p = dataset
    items = [
        {"type": "correlation", "title": "a", "columns": ["units", "nope"]},
        {"type": "correlation", "title": "b", "columns": ["units", "region"]},
        {"type": "group_compare", "title": "c", "columns": ["revenue", "region"]},
        {"type": "trend", "title": "d", "columns": ["REVENUE", "order_date"], "agg": "sum"},
        {"type": "outliers", "title": "e", "columns": ["order_id"]},
        {"type": "sql_injection", "title": "f", "columns": ["x"]},
        {"type": "group_compare", "title": "dup", "columns": ["region", "revenue"]},
    ]
    valid, skipped = analyses.validate_plan(items, p)
    assert [v["type"] for v in valid] == ["group_compare", "trend"]
    assert valid[0]["columns"] == ["region", "revenue"]
    assert valid[1]["columns"] == ["order_date", "revenue"] and valid[1]["agg"] == "sum"
    assert len(skipped) == 5


def test_validate_caps_findings(dataset):
    _, p = dataset
    items = [{"type": "distribution", "title": str(i), "columns": [c]} for i, c in
             enumerate(["units", "discount", "revenue"])]
    items += [{"type": "outliers", "title": "o", "columns": [c]} for c in ["units", "discount", "revenue"]]
    valid, _ = analyses.validate_plan(items, p)
    assert len(valid) == 5


def test_correlation(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("correlation", ["units", "revenue"]))
    assert r["stats"]["strength"] in ("moderate", "strong", "very strong")
    assert r["stats"]["direction"] == "positive"
    assert r["chart"]["type"] == "scatter" and 0 < len(r["chart"]["data"]) <= 400 and len(r["chart"]["line"]) == 2


def test_trend_counts_and_buckets(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("trend", ["order_date"], agg="count"))
    assert r["stats"]["period"] == "week" and r["chart"]["type"] == "line"
    assert 100 <= r["stats"]["periods_shown"] <= 110
    r2 = analyses.run_analysis(con, spec("trend", ["order_date", "revenue"], agg="sum"))
    assert r2["stats"]["direction"] in ("rising", "falling", "no clear trend")


def test_outliers_finds_planted_values(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("outliers", ["revenue"]))
    assert r["stats"]["outlier_count"] >= 30  # 30000 // 997 planted spikes
    assert r["stats"]["unusually_high"] >= 30
    assert any(b["outlier"] for b in r["chart"]["data"])
    assert len(r["chart"]["data"]) == 30


def test_distribution(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("distribution", ["discount"]))
    assert 12 < r["stats"]["mean"] < 18 and len(r["chart"]["data"]) == 25


def test_imbalance(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("imbalance", ["region"]))
    assert r["stats"]["most_common"]["value"] == "North"
    assert abs(sum(d["pct"] for d in r["chart"]["data"]) - 100) < 0.5


def test_group_compare(dataset):
    con, _ = dataset
    r = analyses.run_analysis(con, spec("group_compare", ["region", "revenue"]))
    assert r["stats"]["groups"] == 4 and 0 <= r["stats"]["share_of_variation_explained_by_group"] <= 1
    avgs = [d["avg"] for d in r["chart"]["data"]]
    assert avgs == sorted(avgs, reverse=True)


def test_degenerate_analysis_is_skipped(dataset):
    con, _ = dataset
    with pytest.raises(analyses.AnalysisSkipped):
        analyses.run_analysis(con, spec("imbalance", ["currency"]))


def test_heuristic_plan_is_valid_and_diverse(dataset):
    _, p = dataset
    valid, skipped = analyses.validate_plan(analyses.heuristic_plan(p), p)
    assert len(valid) >= 4 and not skipped
    assert len({v["type"] for v in valid}) >= 4


def _open(csv_text, tmp_path):
    import profiler
    csv = tmp_path / "t.csv"
    csv.write_text(csv_text)
    con = profiler.open_dataset(csv, tmp_path / "w")
    return con, profiler.build_profile(con, False)


def test_trend_drops_partial_first_and_last_years(tmp_path):
    import duckdb
    src = tmp_path / "days.csv"
    duckdb.connect().execute(
        f"COPY (SELECT DATE '2014-07-01' + CAST(i AS INTEGER) AS d, 1 AS n FROM range(0, 4100) t(i)) TO '{src.as_posix()}' (HEADER)")
    con, p = _open(src.read_text(), tmp_path)
    r = analyses.run_analysis(con, spec("trend", ["d"], agg="count"))
    assert r["stats"]["period"] == "year"
    assert r["stats"]["dropped_partial_periods"] == ["last", "first"]
    assert all(pt["v"] in (365, 366) for pt in r["chart"]["data"])  # only complete years remain
    assert r["stats"]["direction"] == "no clear trend"
    con.close()


def test_boolean_columns_read_as_yes_no(tmp_path):
    rows = "\n".join(f"{i},{'Yes' if i % 4 == 0 else 'No'},{i}" for i in range(200))
    con, p = _open("id,left,score\n" + rows, tmp_path)
    r = analyses.run_analysis(con, spec("imbalance", ["left"]))
    assert r["stats"]["most_common"]["value"] == "No" and r["stats"]["most_common"]["share_pct"] == 75.0
    assert {d["label"] for d in r["chart"]["data"]} == {"Yes", "No"}
    r2 = analyses.run_analysis(con, spec("group_compare", ["left", "score"]))
    assert {d["label"] for d in r2["chart"]["data"]} == {"Yes", "No"}
    assert {v["value"] for c in p["columns"] if c["name"] == "left" for v in c["top_values"]} == {"Yes", "No"}
    con.close()

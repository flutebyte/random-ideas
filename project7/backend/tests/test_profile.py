import pytest

import profiler


def kinds(profile):
    return {c["name"]: c["kind"] for c in profile["columns"]}


def test_profile_shape_and_kinds(dataset):
    _, p = dataset
    assert p["row_count"] == 30000 and p["column_count"] == 9
    k = kinds(p)
    assert k["order_id"] == "id"
    assert k["order_date"] == "datetime"
    assert k["region"] == "categorical" and k["product"] == "categorical"
    assert k["revenue"] == "numeric" and k["discount"] == "numeric"
    assert k["customer_email"] == "id"
    assert k["currency"] == "constant"


def test_profile_top_correlation_is_units_revenue(dataset):
    _, p = dataset
    top = p["top_correlations"][0]
    assert {top["a"], top["b"]} == {"units", "revenue"} and top["r"] > 0.3


def test_samples_exclude_id_and_text_columns(dataset):
    _, p = dataset
    assert len(p["sample_rows"]) == 5
    assert "customer_email" not in p["sample_rows"][0]
    assert "order_id" not in p["sample_rows"][0]


def test_no_samples_when_not_consented(sample_csv, tmp_path):
    con = profiler.open_dataset(sample_csv, tmp_path)
    assert profiler.build_profile(con, include_samples=False)["sample_rows"] == []
    con.close()


def test_bad_file_gives_friendly_error(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("")
    with pytest.raises(profiler.DatasetError):
        profiler.open_dataset(bad, tmp_path / "w")

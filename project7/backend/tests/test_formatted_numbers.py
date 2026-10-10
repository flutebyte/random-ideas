import duckdb

import profiler


def _profile(tmp_path, rows):
    csv = tmp_path / "f.csv"
    csv.write_text("id,bonus,zip,share,note\n" + "\n".join(rows), encoding="utf-8")
    con = profiler.open_dataset(csv, tmp_path / "w")
    return con, {c["name"]: c for c in profiler.build_profile(con, False)["columns"]}, profiler.build_profile(con, False)


def test_currency_percent_and_negative_text_become_numbers(tmp_path):
    rows = [f'{i},"${1000 + i * 10:,}",0{1000 + i},{i}%,x{i % 2}' for i in range(30)]
    rows[3] = '3,"(50)",01003,3%,x1'
    rows[4] = '4,n/a,01004,4%,x0'
    con, cols, prof = _profile(tmp_path, rows)
    assert cols["bonus"]["kind"] == "numeric" and cols["share"]["kind"] == "numeric"
    assert cols["zip"]["kind"] != "numeric"  # leading zeros, no formatting: left alone
    assert con.execute("SELECT min(bonus) FROM data").fetchone()[0] == -50
    assert con.execute("SELECT max(bonus) FROM data").fetchone()[0] == 1290
    assert any("'bonus'" in w and "1 placeholders" in w for w in prof["warnings"])


def test_plain_text_columns_are_untouched(tmp_path):
    rows = [f"{i},{i},0{i},{i},word{i}" for i in range(30)]
    con, cols, prof = _profile(tmp_path, rows)
    assert cols["note"]["dtype"] == "VARCHAR"
    assert not any("stored as text" in w for w in prof["warnings"])


def test_duplicate_rows_and_mostly_empty_columns_are_flagged(tmp_path):
    base = [f"{i},{i},0{i},{i}," + ("" if i % 2 else f"w{i}") for i in range(20)]  # note empty on half the rows
    rows = base + [base[0]] * 3  # three extra copies of one row
    _, _, prof = _profile(tmp_path, rows)
    assert any(w.startswith("3 rows") and "exact copies" in w for w in prof["warnings"])
    assert any("Mostly empty" in w and "'note'" in w for w in prof["warnings"])


def test_clean_file_has_no_quality_warnings(tmp_path):
    rows = [f"{i},{i},0{i},{i},w{i}" for i in range(30)]
    _, _, prof = _profile(tmp_path, rows)
    assert prof["warnings"] == []


def test_decimal_comma_and_na_placeholders_become_numbers(tmp_path):
    csv = tmp_path / "e.csv"
    rows = [f"R{i % 3};{i + 1},{i % 90:02d};{'N/A' if i % 7 == 0 else i * 2}" for i in range(40)]
    csv.write_text("region;price;score\n" + "\n".join(rows), encoding="utf-8")
    con = profiler.open_dataset(csv, tmp_path / "w")
    prof = profiler.build_profile(con, False)
    kinds = {c["name"]: c["kind"] for c in prof["columns"]}
    assert kinds["price"] == "numeric" and kinds["score"] == "numeric"
    assert con.execute("SELECT min(price), max(price) FROM data").fetchone() == (1.0, 40.39)
    assert con.execute("SELECT count(score) FROM data").fetchone()[0] == 34  # 6 placeholders blank
    assert any("'score'" in w and "6 placeholders" in w for w in prof["warnings"])


def test_na_as_a_category_value_is_not_touched(tmp_path):
    csv = tmp_path / "c.csv"
    csv.write_text("cont,x\n" + "\n".join(f"{['NA', 'EU', 'AS'][i % 3]},{i}" for i in range(30)), encoding="utf-8")
    con = profiler.open_dataset(csv, tmp_path / "w")
    assert con.execute("SELECT count(*) FROM data WHERE cont = 'NA'").fetchone()[0] == 10

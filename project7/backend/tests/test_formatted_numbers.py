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
    assert any("'bonus'" in w and "1 values" in w for w in prof["warnings"])


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

"""Step 1: load the CSV into DuckDB and profile it. No AI involved.

DuckDB reads the file from disk into a columnar on-disk table, so a
multi-GB CSV never has to fit in RAM (unlike pandas.read_csv).
"""

from __future__ import annotations

import datetime
import decimal
import math
import re
from pathlib import Path

import duckdb

import config

INT_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
}
FLOAT_TYPES = {"FLOAT", "DOUBLE", "REAL", "DECIMAL"}
DATE_TYPES = {"DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "TIMESTAMP_S", "TIMESTAMP_MS", "TIMESTAMP_NS"}
ID_TOKENS = {"id", "uuid", "guid", "index", "idx"}


class DatasetError(Exception):
    """Raised with a message that is safe to show to end users."""


def q(name: str) -> str:
    """Quote an identifier for DuckDB."""
    return '"' + name.replace('"', '""') + '"'


def clean(v):
    """Make a DuckDB value JSON-safe."""
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    if v is None or isinstance(v, (int, str, bool)):
        return v
    return str(v)


def sig(v, digits: int = 5):
    """Round to significant digits (keeps small numbers readable)."""
    v = clean(v)
    if isinstance(v, float):
        return float(f"{v:.{digits}g}")
    return v


def label_expr(cur, name: str) -> str:
    """SQL that turns a column into a display label; booleans read as Yes/No, not true/false."""
    qc = q(name)
    if cur.execute(f"SELECT typeof({qc}) FROM data LIMIT 1").fetchone()[0] == "BOOLEAN":
        return f"CASE WHEN {qc} THEN 'Yes' WHEN NOT {qc} THEN 'No' END"
    return f"CAST({qc} AS VARCHAR)"


def base_type(dtype: str) -> str:
    return dtype.split("(")[0].strip().upper()


_CRYPTIC = re.compile(r"^(col|column|field|var|variable|x|v|c|f|unnamed)[\W_]*\d*$", re.I)


def cryptic_name(name: str) -> bool:
    """Headers like a, b, g1, col_3, Unnamed: 4 tell a human nothing."""
    n = name.strip()
    if n.lower() in {"id", "no", "hr"}:
        return False
    return len(n) <= 2 or n.isdigit() or bool(_CRYPTIC.match(n))


def preview_dataset(csv_path: Path, limit: int = 2000) -> dict:
    """Cheap look at the first rows so the user can check and explain their columns."""
    con = duckdb.connect()
    try:
        res = con.execute(
            "SELECT * FROM read_csv(?, sample_size=20000, ignore_errors=true, null_padding=true) LIMIT ?",
            [str(csv_path), limit],
        )
        names = [d[0] for d in res.description]
        rows = res.fetchall()
    except duckdb.Error as e:
        raise DatasetError(
            "We couldn't read this file as a CSV. Please check that it is a "
            "plain-text, comma- or semicolon-separated file with a header row."
        ) from e
    finally:
        con.close()
    if not names or not rows:
        raise DatasetError("This file has no data rows we could read.")
    cols = []
    for i, name in enumerate(names):
        seen: list[str] = []
        for r in rows:
            v = r[i]
            if v is None:
                continue
            text = ("Yes" if v else "No") if isinstance(v, bool) else str(clean(v))[:30]
            if text not in seen:
                seen.append(text)
            if len(seen) == 4:
                break
        cols.append({"name": name, "examples": seen, "cryptic": cryptic_name(name)})
    if not any(c["examples"] for c in cols):
        raise DatasetError("This file has no data rows we could read.")
    return {"columns": cols, "rows_previewed": len(rows)}


def open_dataset(csv_path: Path, work_dir: Path) -> duckdb.DuckDBPyConnection:
    tmp = work_dir / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(
        str(work_dir / "data.duckdb"),
        config={
            "memory_limit": config.DUCKDB_MEMORY_LIMIT,
            "threads": config.DUCKDB_THREADS,
            "temp_directory": str(tmp),
        },
    )
    load = (
        "CREATE TABLE data AS SELECT * FROM read_csv(?, sample_size=200000, "
        "ignore_errors=true, null_padding=true{extra})"
    )
    try:
        try:
            con.execute(load.format(extra=", store_rejects=true"), [str(csv_path)])
        except duckdb.Error:
            con.execute("DROP TABLE IF EXISTS data")
            con.execute(load.format(extra=""), [str(csv_path)])
    except duckdb.Error as e:
        con.close()
        raise DatasetError(
            "We couldn't read this file as a CSV. Please check that it is a "
            "plain-text, comma- or semicolon-separated file with a header row."
        ) from e

    rows = con.execute("SELECT count(*) FROM data").fetchone()[0]
    cols = con.execute("SELECT count(*) FROM pragma_table_info('data')").fetchone()[0]
    if rows == 0 or cols == 0:
        con.close()
        raise DatasetError("This file has no data rows we could read.")
    return con


def _rejected_rows(cur) -> int:
    try:
        return int(cur.execute("SELECT count(DISTINCT line) FROM reject_errors").fetchone()[0])
    except duckdb.Error:
        return 0


def _looks_like_id(name: str, distinct: int, nn: int, base: str) -> bool:
    """distinct is approximate (HyperLogLog: off by up to ~15% at high cardinality),
    so these thresholds are deliberately loose. Both id and text columns are excluded
    from analyses, so a wrong label here is cosmetic."""
    if nn < 20:
        return False
    ratio = distinct / nn
    tokens = set(re.split(r"[^a-z0-9]+", name.lower()))
    if tokens & ID_TOKENS and ratio > 0.5:
        return True
    return base == "VARCHAR" and ratio > 0.75


def _is_sequential_int(cur, name: str, nn: int) -> bool:
    """Exact check for unnamed integer IDs: fully unique and densely packed."""
    qc = q(name)
    d, lo, hi = cur.execute(f"SELECT count(DISTINCT {qc}), min({qc}), max({qc}) FROM data").fetchone()
    return d == nn and (hi - lo + 1) <= 1.5 * nn


def build_profile(con: duckdb.DuckDBPyConnection, include_samples: bool, labels: dict | None = None) -> dict:
    cur = con.cursor()
    try:
        return _build_profile(cur, include_samples, labels or {})
    finally:
        cur.close()


def _build_profile(cur, include_samples: bool, labels: dict) -> dict:
    desc = cur.execute("DESCRIBE data").fetchall()
    names = [r[0] for r in desc]
    dtypes = [r[1] for r in desc]
    n_rows = cur.execute("SELECT count(*) FROM data").fetchone()[0]

    # One pass for non-null counts and (approximate) distinct counts.
    parts = []
    for n in names:
        parts += [f"count({q(n)})", f"approx_count_distinct({q(n)})"]
    row = cur.execute("SELECT " + ", ".join(parts) + " FROM data").fetchone()

    cols: list[dict] = []
    for i, (name, dtype) in enumerate(zip(names, dtypes)):
        nn, distinct = row[2 * i], row[2 * i + 1]
        cols.append({
            "name": name,
            "dtype": dtype,
            "_base": base_type(dtype),
            "non_null": nn,
            "null_pct": round(100 * (n_rows - nn) / n_rows, 2) if n_rows else 0.0,
            "distinct": min(distinct, nn),
        })

    # Text columns that are really dates ("12 Mar 2024", "2024-03-12 10:00").
    for c in cols:
        if c["_base"] != "VARCHAR" or c["non_null"] == 0:
            continue
        qc = q(c["name"])
        ok, total = cur.execute(
            f"SELECT count(*) FILTER (WHERE try_cast(v AS TIMESTAMP) IS NOT NULL), count(*) "
            f"FROM (SELECT {qc} AS v FROM data WHERE {qc} IS NOT NULL LIMIT 2000)"
        ).fetchone()
        if total and ok / total >= 0.95:
            try:
                cur.execute(
                    f"ALTER TABLE data ALTER COLUMN {qc} SET DATA TYPE TIMESTAMP "
                    f"USING try_cast({qc} AS TIMESTAMP)"
                )
                c["dtype"], c["_base"], c["parsed_from_text"] = "TIMESTAMP", "TIMESTAMP", True
            except duckdb.Error:
                pass

    for c in cols:
        base, nn, distinct = c["_base"], c["non_null"], c["distinct"]
        if nn == 0:
            c["kind"] = "empty"
        elif distinct <= 1:
            c["kind"] = "constant"
        elif base == "BOOLEAN":
            c["kind"] = "categorical"
        elif base in DATE_TYPES:
            c["kind"] = "datetime"
        elif base in INT_TYPES | FLOAT_TYPES:
            if base in INT_TYPES and (
                _looks_like_id(c["name"], distinct, nn, base)
                or (nn >= 20 and distinct / nn > 0.7 and _is_sequential_int(cur, c["name"], nn))
            ):
                c["kind"] = "id"
            elif base in INT_TYPES and distinct <= 8:
                c["kind"] = "categorical"
            else:
                c["kind"] = "numeric"
        elif base == "VARCHAR":
            if _looks_like_id(c["name"], distinct, nn, base):
                c["kind"] = "id"
            elif distinct <= 50 or (distinct / nn <= 0.02 and distinct <= 1000):
                c["kind"] = "categorical"
            else:
                c["kind"] = "text"
        else:
            c["kind"] = "other"

    # Numeric detail.
    for c in cols:
        if c["kind"] != "numeric":
            continue
        qc = f"CAST({q(c['name'])} AS DOUBLE)"
        mn, mx, avg, sd, sk, p01, q1, med, q3, p99 = cur.execute(
            f"SELECT min({qc}), max({qc}), avg({qc}), stddev_samp({qc}), skewness({qc}), "
            f"approx_quantile({qc}, 0.01), approx_quantile({qc}, 0.25), approx_quantile({qc}, 0.5), "
            f"approx_quantile({qc}, 0.75), approx_quantile({qc}, 0.99) FROM data"
        ).fetchone()
        c.update({k: sig(v) for k, v in dict(
            min=mn, max=mx, mean=avg, std=sd, skew=sk, p01=p01, q25=q1, median=med, q75=q3, p99=p99
        ).items()})

    # Datetime detail.
    for c in cols:
        if c["kind"] != "datetime":
            continue
        qc = q(c["name"])
        mn, mx = cur.execute(f"SELECT min({qc}), max({qc}) FROM data").fetchone()
        c["min"], c["max"] = clean(mn), clean(mx)
        c["span_days"] = round((mx - mn).total_seconds() / 86400, 1)

    # Categorical detail: most common values.
    for c in cols:
        if c["kind"] != "categorical":
            continue
        qc = q(c["name"])
        top = cur.execute(
            f"SELECT {label_expr(cur, c['name'])}, count(*) FROM data WHERE {qc} IS NOT NULL "
            f"GROUP BY 1 ORDER BY 2 DESC LIMIT 8"
        ).fetchall()
        c["top_values"] = [
            {"value": (v or "")[:60], "count": n, "pct": round(100 * n / c["non_null"], 1)}
            for v, n in top
        ]

    # Cheap pairwise correlations, computed in a single scan.
    numeric = sorted((c for c in cols if c["kind"] == "numeric"), key=lambda c: -c["non_null"])[:12]
    top_corr: list[dict] = []
    if len(numeric) >= 2:
        pairs = [(a, b) for i, a in enumerate(numeric) for b in numeric[i + 1:]]
        exprs = ", ".join(
            f"corr(CAST({q(a['name'])} AS DOUBLE), CAST({q(b['name'])} AS DOUBLE))" for a, b in pairs
        )
        vals = cur.execute(f"SELECT {exprs} FROM data").fetchone()
        for (a, b), r in zip(pairs, vals):
            r = clean(r)
            if r is not None:
                top_corr.append({"a": a["name"], "b": b["name"], "r": round(r, 3)})
        top_corr.sort(key=lambda d: -abs(d["r"]))
        top_corr = top_corr[:8]

    sample_rows: list[dict] = []
    if include_samples:
        keep = [c["name"] for c in cols if c["kind"] in ("numeric", "datetime", "categorical")][:30]
        if keep:
            sel = ", ".join(q(n) for n in keep)
            cur_rows = cur.execute(
                f"SELECT {sel} FROM data USING SAMPLE reservoir(5 ROWS) REPEATABLE (42)"
            )
            for r in cur_rows.fetchall():
                sample_rows.append({
                    n: (v[:40] if isinstance(v, str) else clean(v)) for n, v in zip(keep, r)
                })

    rejected = _rejected_rows(cur)
    warnings = []
    if rejected:
        warnings.append(f"{rejected:,} rows were skipped because they could not be read cleanly.")

    for c in cols:
        c.pop("_base", None)
        c.pop("non_null", None)
        if labels.get(c["name"]):
            c["description"] = labels[c["name"]]

    return {
        "row_count": n_rows,
        "column_count": len(cols),
        "columns": cols,
        "top_correlations": top_corr,
        "sample_rows": sample_rows,
        "warnings": warnings,
    }

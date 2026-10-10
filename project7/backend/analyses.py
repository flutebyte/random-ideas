"""Steps 2-3: validate the LLM's plan, then run each analysis deterministically.

The LLM only *chooses* from this fixed menu. Every number is computed here,
in SQL, so the model can never make up a statistic.
"""

from __future__ import annotations

import datetime
import math
import statistics
from typing import Callable

import duckdb

import config
from profiler import clean, label_expr, q, sig

ANALYSIS_TYPES = ("correlation", "trend", "outliers", "imbalance", "distribution", "group_compare")


class AnalysisSkipped(Exception):
    """The analysis is not meaningful for this data (message is user-safe)."""


# --------------------------------------------------------------------------
# Plan validation
# --------------------------------------------------------------------------

def validate_plan(items: list[dict], profile: dict) -> tuple[list[dict], list[dict]]:
    """Return (valid specs, skipped-with-reason). Never trusts the model."""
    by_name = {c["name"]: c for c in profile["columns"]}
    lower: dict[str, str | None] = {}
    for n in by_name:
        lower[n.lower()] = None if n.lower() in lower else n

    def resolve(name):
        if name in by_name:
            return by_name[name]
        real = lower.get(str(name).lower())
        return by_name.get(real) if real else None

    valid: list[dict] = []
    skipped: list[dict] = []
    seen: set[tuple] = set()

    for item in items:
        title = str(item.get("title") or item.get("type") or "Analysis")[:120]
        atype = item.get("type")
        raw_cols = [c for c in (item.get("columns") or []) if c is not None]

        def skip(reason):
            skipped.append({"title": title, "reason": reason})

        if atype not in ANALYSIS_TYPES:
            skip(f"unknown analysis type '{atype}'")
            continue
        cols = [resolve(c) for c in raw_cols]
        if not cols or any(c is None for c in cols):
            skip("refers to a column that does not exist")
            continue
        kinds = [c["kind"] for c in cols]
        names = [c["name"] for c in cols]
        agg = None

        if atype == "correlation":
            if len(cols) != 2 or names[0] == names[1] or kinds != ["numeric", "numeric"]:
                skip("correlation needs two different numeric columns")
                continue
        elif atype == "trend":
            if kinds[0] != "datetime" and len(cols) == 2 and kinds[1] == "datetime":
                cols, names, kinds = cols[::-1], names[::-1], kinds[::-1]
            if kinds[0] != "datetime" or len(cols) > 2 or (len(cols) == 2 and kinds[1] != "numeric"):
                skip("trend needs a date column and (optionally) a numeric column")
                continue
            requested = str(item.get("agg") or "").lower()
            agg = "count" if len(cols) == 1 else (requested if requested in ("sum", "avg") else "avg")
        elif atype in ("outliers", "distribution"):
            if len(cols) != 1 or kinds[0] != "numeric":
                skip(f"{atype} needs one numeric column")
                continue
        elif atype == "imbalance":
            if len(cols) != 1 or kinds[0] != "categorical":
                skip("imbalance needs one category column")
                continue
        elif atype == "group_compare":
            if len(cols) == 2 and kinds == ["numeric", "categorical"]:
                cols, names, kinds = cols[::-1], names[::-1], kinds[::-1]
            if len(cols) != 2 or kinds != ["categorical", "numeric"]:
                skip("group comparison needs a category column and a numeric column")
                continue

        key = (atype, tuple(names), agg)
        if key in seen:
            skip("duplicate of another analysis")
            continue
        seen.add(key)
        if len(valid) >= config.MAX_FINDINGS:
            skip("more than the maximum number of analyses")
            continue
        hints = {}
        for c in cols:
            h = {k: c[k] for k in ("kind", "min", "max", "median") if k in c}
            if c.get("top_values"):
                h["common_values"] = [v["value"] for v in c["top_values"][:4]]
            hints[c["name"]] = h
        valid.append({
            "labels": {c["name"]: c["description"] for c in cols if c.get("description")},
            "hints": hints,
            "id": f"f{len(valid) + 1}",
            "type": atype,
            "title": title,
            "why": str(item.get("why") or "")[:400],
            "columns": names,
            "agg": agg,
        })
    return valid, skipped


# --------------------------------------------------------------------------
# Heuristic planner: used as the offline "demo" planner and to backfill when
# the model returns too few usable analyses.
# --------------------------------------------------------------------------

_SUM_HINT = ("revenue", "sales", "amount", "price", "cost", "total", "qty", "quantity", "profit", "spend")


def heuristic_plan(profile: dict) -> list[dict]:
    cols = profile["columns"]
    numeric = [c for c in cols if c["kind"] == "numeric"]
    categorical = [c for c in cols if c["kind"] == "categorical" and 2 <= c["distinct"] <= 30]
    dates = sorted((c for c in cols if c["kind"] == "datetime"), key=lambda c: c["null_pct"])
    cands: list[tuple[float, dict]] = []
    by = {c["name"]: c for c in cols}
    dn = lambda name: by[name].get("description") or name  # noqa: E731  (display name)

    for c in profile.get("top_correlations", [])[:3]:
        if abs(c["r"]) >= 0.3:
            cands.append((abs(c["r"]), {
                "type": "correlation", "columns": [c["a"], c["b"]],
                "title": f"Does {dn(c['a'])} move with {dn(c['b'])}?",
                "why": f"These two columns show a {'positive' if c['r'] > 0 else 'negative'} link (r = {c['r']}), "
                       "which may point to a real relationship worth understanding.",
            }))

    if dates:
        d = dates[0]
        if numeric:
            v = max(numeric, key=lambda c: (c.get("std") or 0) / (abs(c.get("mean") or 0) + 1e-9))
            agg = "sum" if any(h in v["name"].lower() for h in _SUM_HINT) else "avg"
            cands.append((0.9, {
                "type": "trend", "columns": [d["name"], v["name"]], "agg": agg,
                "title": f"How has {dn(v['name'])} changed over time?",
                "why": "A time trend shows whether things are growing, shrinking or seasonal.",
            }))
        else:
            cands.append((0.7, {
                "type": "trend", "columns": [d["name"]],
                "title": "How does activity change over time?",
                "why": "Shows when most records occur and whether volume is growing.",
            }))

    conc = [c for c in categorical if c.get("top_values")]
    if conc:
        c = max(conc, key=lambda c: c["top_values"][0]["pct"])
        cands.append((c["top_values"][0]["pct"] / 100 + 0.1, {
            "type": "imbalance", "columns": [c["name"]],
            "title": f"How evenly are records spread across {dn(c['name'])}?",
            "why": "A few categories may dominate the data, which affects any averages or conclusions.",
        }))

    def tail_score(c):
        iqr = (c.get("q75") or 0) - (c.get("q25") or 0)
        if not iqr:
            return 0.0
        return max(((c.get("max") or 0) - c["q75"]) / iqr, (c["q25"] - (c.get("min") or 0)) / iqr)

    if numeric:
        c = max(numeric, key=tail_score)
        cands.append((min(tail_score(c) / 20, 0.95) + 0.05, {
            "type": "outliers", "columns": [c["name"]],
            "title": f"Are there unusual values in {dn(c['name'])}?",
            "why": "Extreme values can be errors or the most interesting cases in the data.",
        }))
        c = max(numeric, key=lambda c: abs(c.get("skew") or 0))
        cands.append((min(abs(c.get("skew") or 0) / 5, 0.85), {
            "type": "distribution", "columns": [c["name"]],
            "title": f"What does the typical {dn(c['name'])} look like?",
            "why": "The shape of the values shows what is typical and how much they vary.",
        }))

    if categorical and numeric:
        g = categorical[0]
        v = max(numeric, key=lambda c: (c.get("std") or 0) / (abs(c.get("mean") or 0) + 1e-9))
        cands.append((0.6, {
            "type": "group_compare", "columns": [g["name"], v["name"]],
            "title": f"Does {dn(v['name'])} differ by {dn(g['name'])}?",
            "why": "Comparing groups shows which segments perform higher or lower.",
        }))

    cands.sort(key=lambda t: -t[0])
    picked, per_type = [], {}
    for _, spec in cands:
        if per_type.get(spec["type"], 0) >= 2:
            continue
        per_type[spec["type"]] = per_type.get(spec["type"], 0) + 1
        picked.append(spec)
    return picked[: config.MAX_FINDINGS]


# --------------------------------------------------------------------------
# Runners. Each returns (stats, chart).
# --------------------------------------------------------------------------

def _strength(r: float) -> str:
    a = abs(r)
    for limit, label in ((0.1, "negligible"), (0.3, "weak"), (0.5, "moderate"), (0.7, "strong")):
        if a < limit:
            return label
    return "very strong"


def _dbl(name: str) -> str:
    return f"CAST({q(name)} AS DOUBLE)"


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def _correlation(cur, spec):
    x, y = spec["columns"]
    dx, dy = _dbl(x), _dbl(y)
    both = f"{q(x)} IS NOT NULL AND {q(y)} IS NOT NULL"
    n, r, slope, icpt, xmin, xmax = cur.execute(
        f"SELECT count(*), corr({dx}, {dy}), regr_slope({dy}, {dx}), regr_intercept({dy}, {dx}), "
        f"min({dx}), max({dx}) FROM data WHERE {both}"
    ).fetchone()
    r = clean(r)
    if n < 10 or r is None:
        raise AnalysisSkipped("Not enough overlapping values to compare these two columns.")
    pts = cur.execute(
        f"SELECT x, y FROM (SELECT {dx} AS x, {dy} AS y FROM data WHERE {both}) "
        f"USING SAMPLE reservoir(400 ROWS) REPEATABLE (7)"
    ).fetchall()
    stats = {
        "rows_compared": n,
        "correlation_r": sig(r, 3),
        "r_squared": sig(r * r, 3),
        "strength": _strength(r),
        "direction": "positive" if r > 0 else "negative",
        "slope": sig(slope),
        "x_column": x, "y_column": y,
    }
    chart = {
        "type": "scatter", "x_label": x, "y_label": y, "x_key": "x", "y_key": "y",
        "data": [{"x": sig(a), "y": sig(b)} for a, b in pts],
        "line": [{"x": sig(xmin), "y": sig(icpt + slope * xmin)}, {"x": sig(xmax), "y": sig(icpt + slope * xmax)}],
        "note": f"Showing a random sample of {len(pts)} of {n:,} rows.",
    }
    return stats, chart


def _bucket_for(days: float) -> str:
    if days <= 3:
        return "hour"
    if days <= 120:
        return "day"
    if days <= 900:
        return "week"
    if days <= 3650:
        return "month"
    return "year"


def _trend(cur, spec):
    dcol = spec["columns"][0]
    vcol = spec["columns"][1] if len(spec["columns"]) > 1 else None
    agg = spec["agg"]
    qd = q(dcol)
    mn, mx = cur.execute(f"SELECT min({qd}), max({qd}) FROM data").fetchone()
    if mn is None or mx is None:
        raise AnalysisSkipped("This date column has no usable dates.")
    days = (mx - mn).total_seconds() / 86400
    if days < 1:
        raise AnalysisSkipped("All dates fall within a single day, so there is no trend to show.")
    bucket = _bucket_for(days)
    if vcol:
        val = _dbl(vcol)
        expr = f"sum({val})" if agg == "sum" else f"avg({val})"
        where = f"{qd} IS NOT NULL AND {q(vcol)} IS NOT NULL"
    else:
        expr, where = "count(*)", f"{qd} IS NOT NULL"
    rows = cur.execute(
        f"SELECT date_trunc('{bucket}', {qd}) AS t, {expr} AS v, count(*) AS n FROM data "
        f"WHERE {where} GROUP BY 1 ORDER BY 1"
    ).fetchall()
    if len(rows) < 3:
        raise AnalysisSkipped("Too few time periods to describe a trend.")

    # Drop incomplete first/last periods: a half-finished year looks like a crash but is just partial data.
    dropped = []
    if agg in ("sum", "count") and bucket in ("week", "month", "year") and len(rows) >= 5:
        first_start, last_next = cur.execute(
            f"SELECT date_trunc('{bucket}', TIMESTAMP '{clean(mn)}'), "
            f"date_trunc('{bucket}', TIMESTAMP '{clean(mx)}') + INTERVAL 1 {bucket}"
        ).fetchone()
        as_dt = lambda v: v if isinstance(v, datetime.datetime) else datetime.datetime.combine(v, datetime.time.min)
        if as_dt(mx) < last_next - datetime.timedelta(days=1):
            dropped.append("last")
            rows = rows[:-1]
        if as_dt(mn) > first_start + datetime.timedelta(days=1):
            dropped.append("first")
            rows = rows[1:]

    series = [(t, float(v)) for t, v, _ in rows if v is not None]
    vals = [v for _, v in series]
    idx = list(range(len(vals)))
    r_idx = _pearson([float(i) for i in idx], vals)
    k = max(1, len(vals) // 3)
    early, late = statistics.fmean(vals[:k]), statistics.fmean(vals[-k:])
    pct = None if early == 0 else 100 * (late - early) / abs(early)
    peak = max(series, key=lambda s: s[1])
    low = min(series, key=lambda s: s[1])

    # With few periods a big-looking r is often noise: require roughly 95% significance.
    if r_idx is None or abs(r_idx) < max(0.3, 2 / math.sqrt(len(vals))):
        direction = "no clear trend"
    else:
        direction = "rising" if r_idx > 0 else "falling"

    label = (f"{agg} of {vcol}" if vcol else "number of records")
    stats = {
        "measure": label,
        "period": bucket,
        "periods_shown": len(series),
        "direction": direction,
        "trend_strength_r": None if r_idx is None else sig(r_idx, 3),
        "first_period_avg": sig(early), "last_period_avg": sig(late),
        "change_early_to_late_pct": None if pct is None else round(pct, 1),
        "peak": {"period": clean(peak[0])[:10], "value": sig(peak[1])},
        "lowest": {"period": clean(low[0])[:10], "value": sig(low[1])},
        "date_range": [clean(mn)[:10], clean(mx)[:10]],
        "dropped_partial_periods": dropped,
    }
    chart = {
        "type": "line", "x_label": dcol, "y_label": label, "x_key": "t", "y_key": "v",
        "data": [{"t": clean(t)[:16 if bucket == "hour" else 10], "v": sig(v)} for t, v in series],
        "note": f"Grouped by {bucket}." + (" Incomplete first/last periods were left out." if dropped else ""),
    }
    return stats, chart


def _histogram(cur, col: str, lo: float, hi: float, bins: int, outlier_lo=None, outlier_hi=None):
    width = (hi - lo) / bins
    dc = _dbl(col)
    rows = cur.execute(
        f"SELECT LEAST(CAST(floor(({dc} - {lo!r}) / {width!r}) AS INTEGER), {bins - 1}) AS b, count(*) "
        f"FROM data WHERE {q(col)} IS NOT NULL AND {dc} >= {lo!r} AND {dc} <= {hi!r} GROUP BY 1"
    ).fetchall()
    counts = {int(b): int(n) for b, n in rows}
    out = []
    for i in range(bins):
        a, b = lo + i * width, lo + (i + 1) * width
        is_out = (outlier_hi is not None and a >= outlier_hi) or (outlier_lo is not None and b <= outlier_lo)
        out.append({"range": f"{sig(a, 3)} to {sig(b, 3)}", "x0": sig(a), "x1": sig(b),
                    "count": counts.get(i, 0), "outlier": bool(is_out)})
    return out


def _outliers(cur, spec):
    col = spec["columns"][0]
    dc = _dbl(col)
    n, mn, mx, avg, sd, q1, med, q3 = cur.execute(
        f"SELECT count({dc}), min({dc}), max({dc}), avg({dc}), stddev_pop({dc}), "
        f"approx_quantile({dc}, 0.25), approx_quantile({dc}, 0.5), approx_quantile({dc}, 0.75) FROM data"
    ).fetchone()
    if n < 20 or mn == mx:
        raise AnalysisSkipped("This column has too few or too uniform values to look for outliers.")
    iqr = q3 - q1
    if iqr > 0:
        lo_f, hi_f, method = q1 - 1.5 * iqr, q3 + 1.5 * iqr, "1.5 x IQR rule"
    else:
        lo_f, hi_f, method = avg - 3 * sd, avg + 3 * sd, "3 standard deviations from the mean"
    n_lo, n_hi = cur.execute(
        f"SELECT count(*) FILTER (WHERE {dc} < {lo_f!r}), count(*) FILTER (WHERE {dc} > {hi_f!r}) "
        f"FROM data WHERE {q(col)} IS NOT NULL"
    ).fetchone()
    top = [sig(v[0]) for v in cur.execute(
        f"SELECT {dc} FROM data WHERE {dc} > {hi_f!r} ORDER BY 1 DESC LIMIT 5").fetchall()]
    bottom = [sig(v[0]) for v in cur.execute(
        f"SELECT {dc} FROM data WHERE {dc} < {lo_f!r} ORDER BY 1 ASC LIMIT 5").fetchall()]
    total_out = n_lo + n_hi
    stats = {
        "column": col,
        "values_checked": n,
        "outlier_count": total_out,
        "outlier_pct": round(100 * total_out / n, 3),
        "unusually_high": n_hi, "unusually_low": n_lo,
        "normal_range": [sig(max(lo_f, mn)), sig(min(hi_f, mx))],
        "method": method,
        "typical_median": sig(med), "mean": sig(avg),
        "largest_values": top, "smallest_values": bottom,
        "max": sig(mx), "min": sig(mn),
    }
    chart = {
        "type": "histogram", "x_label": col, "y_label": "Number of rows", "x_key": "range", "y_key": "count",
        "data": _histogram(cur, col, mn, mx, 30, lo_f, hi_f),
        "yscale": "log",
        "note": ("Orange bars fall outside the normal range. Bar heights use a log scale so rare values stay visible."
                 if total_out else "No values fall outside the normal range."),
    }
    return stats, chart


def _distribution(cur, spec):
    col = spec["columns"][0]
    dc = _dbl(col)
    n, mn, mx, avg, sd, sk, p01, med, p99 = cur.execute(
        f"SELECT count({dc}), min({dc}), max({dc}), avg({dc}), stddev_samp({dc}), skewness({dc}), "
        f"approx_quantile({dc}, 0.01), approx_quantile({dc}, 0.5), approx_quantile({dc}, 0.99) FROM data"
    ).fetchone()
    if n < 20 or mn == mx:
        raise AnalysisSkipped("This column has too few or too uniform values to describe its shape.")
    lo, hi = (p01, p99) if p01 < p99 else (mn, mx)
    bins = _histogram(cur, col, lo, hi, 25)
    shown = sum(b["count"] for b in bins)
    sk = clean(sk) or 0.0
    shape = "roughly symmetric" if abs(sk) < 0.5 else ("skewed to the right (a long tail of high values)" if sk > 0
                                                       else "skewed to the left (a long tail of low values)")
    stats = {
        "column": col, "values": n,
        "mean": sig(avg), "median": sig(med), "std_dev": sig(sd),
        "min": sig(mn), "max": sig(mx),
        "skewness": sig(sk, 3), "shape": shape,
        "typical_range_1st_to_99th_percentile": [sig(lo), sig(hi)],
        "values_outside_chart": n - shown,
    }
    chart = {
        "type": "histogram", "x_label": col, "y_label": "Number of rows", "x_key": "range", "y_key": "count",
        "data": bins,
        "note": "Chart covers the 1st to 99th percentile so a few extreme values don't squash the picture.",
    }
    return stats, chart


def _imbalance(cur, spec):
    col = spec["columns"][0]
    qc = q(col)
    rows = cur.execute(
        f"SELECT {label_expr(cur, col)}, count(*) FROM data WHERE {qc} IS NOT NULL "
        f"GROUP BY 1 ORDER BY 2 DESC LIMIT 1000"
    ).fetchall()
    total = sum(n for _, n in rows)
    if len(rows) < 2 or not total:
        raise AnalysisSkipped("This column has only one distinct value.")
    shares = [n / total for _, n in rows]
    entropy = -sum(p * math.log(p) for p in shares if p > 0) / math.log(len(rows))
    label = "well balanced" if entropy >= 0.9 else ("moderately uneven" if entropy >= 0.6 else "heavily dominated by a few values")
    top = rows[:10]
    other = total - sum(n for _, n in top)
    data = [{"label": (v or "(blank)")[:40], "count": n, "pct": round(100 * n / total, 1)} for v, n in top]
    if other > 0:
        data.append({"label": f"Other ({len(rows) - len(top)})", "count": other, "pct": round(100 * other / total, 1)})
    stats = {
        "column": col, "rows_counted": total,
        "categories": len(rows) if len(rows) < 1000 else "1000+",
        "most_common": {"value": rows[0][0], "share_pct": round(100 * shares[0], 1)},
        "top_3_share_pct": round(100 * sum(shares[:3]), 1),
        "rare_categories_under_1pct": sum(1 for p in shares if p < 0.01),
        "balance": label, "balance_score_0_to_1": round(entropy, 2),
    }
    chart = {"type": "bar", "x_label": col, "y_label": "Number of rows", "x_key": "label", "y_key": "count",
             "data": data, "note": None}
    return stats, chart


def _group_compare(cur, spec):
    g, v = spec["columns"]
    qg, dv = q(g), _dbl(v)
    rows = cur.execute(
        f"SELECT {label_expr(cur, g)}, count({dv}), avg({dv}), stddev_pop({dv}), approx_quantile({dv}, 0.5) "
        f"FROM data WHERE {qg} IS NOT NULL AND {q(v)} IS NOT NULL GROUP BY 1"
    ).fetchall()
    rows = [(str(a), int(n), float(m), float(sd or 0), float(md)) for a, n, m, sd, md in rows if n and m is not None]
    if len(rows) < 2:
        raise AnalysisSkipped("Fewer than two groups have values to compare.")
    N = sum(n for _, n, *_ in rows)
    M = sum(n * m for _, n, m, *_ in rows) / N
    ssb = sum(n * (m - M) ** 2 for _, n, m, *_ in rows)
    ssw = sum(n * sd ** 2 for _, n, _, sd, _ in rows)
    eta = ssb / (ssb + ssw) if (ssb + ssw) else 0.0
    shown = sorted(sorted(rows, key=lambda r: -r[1])[:12], key=lambda r: -r[2])
    hi, lo = shown[0], shown[-1]
    effect = "negligible" if eta < 0.01 else "small" if eta < 0.06 else "medium" if eta < 0.14 else "large"
    stats = {
        "group_column": g, "value_column": v, "groups": len(rows), "rows_compared": N,
        "overall_average": sig(M),
        "highest_group": {"name": hi[0], "average": sig(hi[2]), "rows": hi[1]},
        "lowest_group": {"name": lo[0], "average": sig(lo[2]), "rows": lo[1]},
        "highest_vs_lowest_ratio": sig(hi[2] / lo[2], 3) if lo[2] > 0 and hi[2] > 0 else None,
        "share_of_variation_explained_by_group": round(eta, 3),
        "group_effect_size": effect,
    }
    chart = {
        "type": "bar", "x_label": g, "y_label": f"Average {v}", "x_key": "label", "y_key": "avg",
        "data": [{"label": a[:40], "avg": sig(m), "rows": n} for a, n, m, *_ in shown],
        "note": f"Showing the {len(shown)} largest groups." if len(rows) > len(shown) else None,
    }
    return stats, chart


RUNNERS: dict[str, Callable] = {
    "correlation": _correlation,
    "trend": _trend,
    "outliers": _outliers,
    "distribution": _distribution,
    "imbalance": _imbalance,
    "group_compare": _group_compare,
}


def run_analysis(con: duckdb.DuckDBPyConnection, spec: dict) -> dict:
    cur = con.cursor()
    try:
        stats, chart = RUNNERS[spec["type"]](cur, spec)
    finally:
        cur.close()
    return {
        "id": spec["id"], "type": spec["type"], "title": spec["title"], "why": spec["why"],
        "columns": spec["columns"], "labels": spec.get("labels", {}), "hints": spec.get("hints", {}),
        "stats": stats, "chart": chart,
    }

"""Which findings matter most? Used for the "short version" at the top of the results.

Every score is a 0..1 strength computed from the SQL-produced stats, never from the model, so the
ranking is reproducible and cannot be talked into favouring a finding.
"""

from __future__ import annotations

SUMMARY_SIZE = 3


def _num(v, default=0.0) -> float:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def importance(result: dict) -> float:
    s, t = result["stats"], result["type"]
    if t == "correlation":
        return min(abs(_num(s.get("correlation_r"))), 1.0)
    if t == "group_compare":
        return min(_num(s.get("share_of_variation_explained_by_group")), 1.0)
    if t == "outliers":
        return min(_num(s.get("outlier_pct")) / 5.0, 1.0)  # 5% unusual values or more is as notable as it gets
    if t == "imbalance":
        return min(max(1.0 - _num(s.get("balance_score_0_to_1"), 1.0), 0.0), 1.0)
    if t == "trend":
        chg = s.get("change_early_to_late_pct")
        return 0.1 if chg is None else min(abs(_num(chg)) / 100.0, 1.0)
    if t == "distribution":
        return min(abs(_num(s.get("skewness"))) / 3.0, 1.0) * 0.5  # describes the data, rarely a decision on its own
    return 0.0


def short_version(results: dict[str, dict], explanations: dict[str, dict]) -> list[dict]:
    """Top findings by strength, using their already number-checked headlines. Weak ones are left out."""
    ranked = sorted(
        ((importance(r), fid) for fid, r in results.items() if fid in explanations),
        key=lambda x: (-x[0], x[1]),
    )
    return [
        {"id": fid, "type": results[fid]["type"], "headline": explanations[fid]["headline"], "strength": round(score, 2)}
        for score, fid in ranked[:SUMMARY_SIZE]
        if score >= 0.1
    ]

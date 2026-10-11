import analyses
from llm import template_explanation
from ranking import importance, short_version


def _result(kind, **stats):
    return {"type": kind, "stats": stats}


def test_importance_scales_with_real_strength():
    assert importance(_result("correlation", correlation_r=-0.8)) > importance(_result("correlation", correlation_r=0.2))
    assert importance(_result("group_compare", share_of_variation_explained_by_group=0.4)) == 0.4
    assert importance(_result("outliers", outlier_pct=10)) == 1.0
    assert importance(_result("imbalance", balance_score_0_to_1=0.2)) == 0.8
    assert importance(_result("trend", change_early_to_late_pct=-50)) == 0.5
    assert importance(_result("trend", change_early_to_late_pct=None)) == 0.1
    assert importance(_result("distribution", skewness=0.0)) == 0.0


def test_summary_is_ranked_capped_and_skips_weak_findings():
    results = {
        "a": _result("correlation", correlation_r=0.9),
        "b": _result("group_compare", share_of_variation_explained_by_group=0.02),  # negligible: left out
        "c": _result("outliers", outlier_pct=2.5),
        "d": _result("imbalance", balance_score_0_to_1=0.1),
        "e": _result("trend", change_early_to_late_pct=30),
    }
    exps = {k: {"headline": f"h-{k}"} for k in results}
    out = short_version(results, exps)
    assert [o["id"] for o in out] == ["a", "d", "c"]  # 0.9, 0.9 (tie by id), 0.5; the 0.3 trend is cut by the cap
    assert "b" not in [o["id"] for o in out]
    assert short_version(results, {}) == []  # nothing is summarised before it has been explained


def test_real_dataset_summary_uses_computed_stats(dataset):
    con, profile = dataset
    specs, _ = analyses.validate_plan(analyses.heuristic_plan(profile), profile)
    results = {}
    for spec in specs:
        try:
            results[spec["id"]] = analyses.run_analysis(con, spec)
        except analyses.AnalysisSkipped:
            continue
    exps = {fid: template_explanation(r) for fid, r in results.items()}
    out = short_version(results, exps)
    assert out and len(out) <= 3
    assert all(o["strength"] >= 0.1 for o in out)
    assert [o["strength"] for o in out] == sorted((o["strength"] for o in out), reverse=True)

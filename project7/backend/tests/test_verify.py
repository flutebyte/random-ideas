import analyses
from llm import template_explanation
from verify import check_numbers


def test_template_explanations_pass_for_every_analysis(dataset):
    con, profile = dataset
    specs, _ = analyses.validate_plan(analyses.heuristic_plan(profile), profile)
    assert specs
    for spec in specs:
        try:
            result = analyses.run_analysis(con, spec)
        except analyses.AnalysisSkipped:
            continue
        check = check_numbers(template_explanation(result), result)
        assert check["unverified"] == [], (spec["type"], check)


def test_invented_number_is_caught():
    result = {"stats": {"mean": 12.5, "outlier_pct": 3.2, "rows": 30000}, "columns": ["revenue"]}
    ok = {"headline": "Average is 12.5 with 3.2% unusual across 30,000 rows.", "explanation": "", "so_what": "", "caveat": None}
    bad = {**ok, "explanation": "Revenue grew 47% last year."}
    assert check_numbers(ok, result)["unverified"] == []
    assert check_numbers(bad, result)["unverified"] == [47.0]


def test_rounding_and_fractions_are_accepted():
    result = {"stats": {"r_squared": 0.634, "mean": 1234.567}, "columns": []}
    exp = {"headline": "About 63% explained; mean is 1,235.", "explanation": "", "so_what": "", "caveat": None}
    assert check_numbers(exp, result)["unverified"] == []

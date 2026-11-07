from kmd.tailoring.factcheck import check

FACTS = [
    {"id": "f1", "text": "Built a Python ETL pipeline at Acme that cut nightly runtime from 6 hours to 45 minutes."},
    {"id": "f2", "text": "Led a team of 4 engineers shipping a React dashboard."},
]


def item(text, ids=("f1",), kind="claim"):
    return {"text": text, "fact_ids": list(ids), "kind": kind}


def test_supported_claim_passes():
    assert check([item("Cut nightly runtime from 6 hours to 45 minutes with a Python ETL pipeline at Acme.")], FACTS) == []


def test_invented_number_is_caught():
    p = check([item("Cut nightly runtime from 6 hours to 10 minutes.")], FACTS)
    assert any("'10'" in x for x in p)


def test_invented_employer_is_caught():
    p = check([item("Built a pipeline at Google for nightly runs.")], FACTS)
    assert any("Google" in x for x in p)


def test_claim_without_fact_ids_rejected():
    assert check([item("Great engineer.", ids=())], FACTS)


def test_unknown_fact_id_rejected():
    assert check([item("Built things.", ids=("f99",))], FACTS)


def test_boilerplate_ok_but_not_substantial():
    assert check([item("Dear Hiring Manager,", ids=(), kind="boilerplate")], FACTS) == []
    assert check([item("I have 10 years of experience", ids=(), kind="boilerplate")], FACTS)
    assert check([item("word " * 20, ids=(), kind="boilerplate")], FACTS)


def test_job_terms_allowed():
    p = check([item("Excited to bring my Python skills to Stripe.")], FACTS, allowed_terms={"stripe"})
    assert p == []


def test_cited_fact_must_be_the_source_of_numbers():
    # 4 is in f2, not f1
    assert check([item("Led 4 engineers", ids=("f1",))], FACTS)
    assert check([item("Led 4 engineers", ids=("f2",))], FACTS) == []

import json

from kmd.events import bus
from kmd.tailoring.handler import handle_tailor, run_tailor
from kmd.workers import drain_events
from tests.fakes import PROFILE, FakeClient, seed_job

GOOD = {
    "bullets": [{"text": "Cut nightly runtime from 6 hours to 45 minutes with a Python ETL pipeline.", "fact_ids": ["f1"], "kind": "claim"}],
    "cover_letter": [
        {"text": "Dear Hiring Manager,", "fact_ids": [], "kind": "boilerplate"},
        {"text": "I led 4 engineers shipping a React dashboard.", "fact_ids": ["f2"], "kind": "claim"},
    ],
}
BAD = {
    "bullets": [{"text": "Cut runtime to 10 minutes at Google.", "fact_ids": ["f1"], "kind": "claim"}],
    "cover_letter": GOOD["cover_letter"],
}
JOB = {"title": "Backend Engineer", "company": "acme", "description": "x"}


def test_clean_first_try_one_call():
    c = FakeClient(GOOD)
    b, l, problems = run_tailor(c, JOB, PROFILE, "m")
    assert problems == [] and len(c.calls) == 1


def test_bad_then_good_retries_with_problems_in_prompt():
    c = FakeClient(BAD, GOOD)
    _, _, problems = run_tailor(c, JOB, PROFILE, "m")
    assert problems == [] and len(c.calls) == 2
    assert "rejected by the fact-checker" in c.calls[1]["messages"][0]["content"]


def test_still_bad_after_retry_is_reported():
    _, _, problems = run_tailor(FakeClient(BAD, BAD), JOB, PROFILE, "m")
    assert problems


def test_handler_stores_and_chains_to_fill(conn):
    seed_job(conn)
    bus.publish(conn, "tailor:acme:1", "job.tailor", None)
    c = FakeClient(GOOD)
    drain_events(conn, 100, "job.tailor", lambda cn, e: handle_tailor(cn, e, c, PROFILE, "m", 100, fill_enabled=True))
    row = conn.execute("SELECT status, factcheck FROM applications").fetchone()
    assert row["status"] == "tailored" and json.loads(row["factcheck"]) == []
    assert conn.execute("SELECT event_type FROM events WHERE event_key='fill:acme:1'").fetchone()[0] == "app.fill"


def test_failed_factcheck_does_not_chain(conn):
    seed_job(conn)
    bus.publish(conn, "tailor:acme:1", "job.tailor", None)
    c = FakeClient(BAD, BAD)
    drain_events(conn, 100, "job.tailor", lambda cn, e: handle_tailor(cn, e, c, PROFILE, "m", 100, fill_enabled=True))
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "factcheck_failed"
    assert conn.execute("SELECT COUNT(*) FROM events WHERE event_type='app.fill'").fetchone()[0] == 0

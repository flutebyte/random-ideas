from kmd.app import worker_cycle
from kmd.scoring.handler import drain
from tests.fakes import PROFILE, FakeClient, FakeNotifier

GOOD = {
    "bullets": [{"text": "Cut nightly runtime from 6 hours to 45 minutes with a Python ETL pipeline.", "fact_ids": ["f1"], "kind": "claim"}],
    "cover_letter": [{"text": "Dear Hiring Manager,", "fact_ids": [], "kind": "boilerplate"}],
}
CFG = {"auto_submit": False, "screenshot_dir": "x", "headless": True, "fill_forms": False,
       "tailor_model": "m", "email_model": "m", "scoring_model": "m"}


def test_score_then_tailor_then_notify_without_browser(conn):
    from kmd.events import bus
    conn.execute("INSERT INTO jobs (source, job_id, title, url) VALUES ('acme','1','Backend Engineer','http://x')")
    bus.publish(conn, "gh:acme:1", "job.new", None)
    drain(conn, 10, FakeClient({"score": 88, "reason": "great"}), PROFILE, "m", tailor_threshold=70)
    n = FakeNotifier()
    worker_cycle(conn, n, CFG, PROFILE, FakeClient(GOOD), 11)
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "tailored"
    assert "Backend Engineer" in n.sent[0][0] and "Approve" == n.sent[0][1][0][0]


def test_low_score_is_not_tailored(conn):
    from kmd.events import bus
    conn.execute("INSERT INTO jobs (source, job_id, title, url) VALUES ('acme','1','Backend Engineer','http://x')")
    bus.publish(conn, "gh:acme:1", "job.new", None)
    drain(conn, 10, FakeClient({"score": 50, "reason": "meh"}), PROFILE, "m", tailor_threshold=70)
    assert conn.execute("SELECT COUNT(*) FROM events WHERE event_type='job.tailor'").fetchone()[0] == 0

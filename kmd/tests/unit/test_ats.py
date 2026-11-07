import json
from pathlib import Path

import pytest

from kmd.app import worker_cycle
from kmd.ats import handler as ats
from kmd.ats.greenhouse import fill_form, plan_fields, submit_form
from kmd.events import bus
from tests.fakes import PROFILE, FakeClient, FakeNotifier, seed_job

CFG = {"auto_submit": False, "auto_submit_min_score": 85, "daily_submit_cap": 5,
       "screenshot_dir": "x", "headless": True, "fill_forms": True, "tailor_model": "m",
       "email_model": "m", "scoring_model": "m"}
LETTER = [{"text": "Dear Hiring Manager,"}, {"text": "I like Python."}]


def F(label, typ="text", required=True, options=(), sel=None):
    return {"selector": sel or "#" + label.replace(" ", "_"), "label": label, "type": typ,
            "required": required, "options": list(options)}


def test_plan_maps_standard_fields_and_flags_unknown_required():
    fields = [F("First Name"), F("Last Name"), F("Email"), F("Phone"), F("Resume/CV", "file"),
              F("Cover Letter", "textarea", False), F("Are you authorized to work here?"),
              F("Favourite colour"), F("Pronouns", required=False)]
    fills, un = plan_fields(fields, PROFILE, "LETTER")
    by = {f["label"]: f["value"] for f in fills}
    assert by["First Name"] == "Asha" and by["Email"] == "asha@example.com"
    assert by["Cover Letter"] == "LETTER" and by["Are you authorized to work here?"] == "Yes"
    assert un == ["Favourite colour"]  # optional unknowns are skipped, required unknowns need a human


def test_plan_never_guesses_a_dropdown():
    fields = [F("Are you authorized to work", "select", options=["Maybe", "Nope"])]
    fills, un = plan_fields(fields, PROFILE, "")
    assert fills == [] and un == ["Are you authorized to work"]
    fills, un = plan_fields([F("Are you authorized to work", "select", options=["yes", "no"])], PROFILE, "")
    assert fills[0]["value"] == "Yes" and un == []


FORM = """<html><body><form id="application_form" onsubmit="document.title='SUBMITTED'; return false;">
<label for="first_name">First Name *</label><input id="first_name" required>
<label for="last_name">Last Name *</label><input id="last_name" required>
<label for="email">Email *</label><input id="email" required>
<label for="resume">Resume *</label><input id="resume" type="file" required>
<label for="cover_letter_text">Cover Letter</label><textarea id="cover_letter_text"></textarea>
<label for="q1">Favourite colour *</label><input id="q1" required>
<button type="submit" id="submit_app">Submit</button></form></body></html>"""


@pytest.fixture
def form_url(tmp_path):
    p = tmp_path / "form.html"
    p.write_text(FORM)
    return p.as_uri()


def _browser_ok():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            pw.chromium.launch().close()
        return True
    except Exception:
        return False


needs_browser = pytest.mark.skipif(not _browser_ok(), reason="playwright chromium not installed")


@needs_browser
def test_real_browser_fills_but_does_not_submit(form_url, tmp_path):
    res = fill_form(form_url, PROFILE, LETTER, tmp_path / "shots")
    assert res["unanswered"] == ["Favourite colour"]
    assert Path(res["screenshot"]).exists()
    labels = {p["label"] for p in res["payload"]}
    assert {"First Name", "Last Name", "Email", "Resume", "Cover Letter"} <= labels


@needs_browser
def test_submit_refuses_with_unanswered_required(form_url, tmp_path):
    with pytest.raises(RuntimeError, match="unanswered"):
        submit_form(form_url, PROFILE, LETTER, tmp_path / "shots")


@needs_browser
def test_submit_clicks_when_complete(form_url, tmp_path):
    prof = {**PROFILE, "answers": {"colour": "Blue"}}
    res = submit_form(form_url, prof, LETTER, tmp_path / "shots")
    assert Path(res["screenshot"]).exists()


def _tailored(conn):
    seed_job(conn)
    conn.execute("INSERT INTO applications (source, job_id, bullets, cover_letter, factcheck, status, created_at) "
                 "VALUES ('acme','1',?,?,'[]','tailored',1)",
                 (json.dumps([{"text": "b1"}]), json.dumps(LETTER)))
    bus.publish(conn, "fill:acme:1", "app.fill", None)


def ok_filler(*a, **k):
    return {"payload": [{"label": "x"}], "unanswered": [], "screenshot": "s.png"}


def test_fill_then_approve_then_submit_flow(conn):
    _tailored(conn)
    n, submitted = FakeNotifier(), []

    def submitter(url, *a, **k):
        submitted.append(url)
        return {"payload": "[]", "screenshot": "s2.png"}

    worker_cycle(conn, n, CFG, PROFILE, FakeClient(), 100, filler=ok_filler, submitter=submitter)
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "filled"
    assert submitted == []  # fill-and-ask: nothing submitted yet
    text, buttons = n.sent[0]
    assert "auto_submit is off" in text and buttons[0][0] == "Approve"
    n.replies = [buttons[0][1], buttons[0][1]]  # double press
    worker_cycle(conn, n, CFG, PROFILE, FakeClient(), 101, filler=ok_filler, submitter=submitter)
    worker_cycle(conn, n, CFG, PROFILE, FakeClient(), 102, filler=ok_filler, submitter=submitter)
    assert submitted == ["https://example.com/acme/1"]  # exactly once
    row = conn.execute("SELECT status, mode FROM applications").fetchone()
    assert (row["status"], row["mode"]) == ("submitted", "manual")


def test_reject_marks_rejected_and_never_submits(conn):
    _tailored(conn)
    n, submitted = FakeNotifier(), []
    worker_cycle(conn, n, CFG, PROFILE, FakeClient(), 100, filler=ok_filler, submitter=lambda *a, **k: submitted.append(1))
    n.replies = [n.sent[0][1][1][1]]
    worker_cycle(conn, n, CFG, PROFILE, FakeClient(), 101, filler=ok_filler, submitter=lambda *a, **k: submitted.append(1))
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "rejected" and not submitted


def test_unanswered_question_asks_human_even_with_auto_on(conn):
    _tailored(conn)
    n = FakeNotifier()
    filler = lambda *a, **k: {"payload": [], "unanswered": ["Salary"], "screenshot": "s.png"}
    cfg = {**CFG, "auto_submit": True}

    def boom(*a, **k):
        raise AssertionError("must not submit")

    worker_cycle(conn, n, cfg, PROFILE, FakeClient(), 100, filler=filler, submitter=boom)
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "needs_input"
    assert "Salary" in n.sent[0][0]


def test_auto_submit_when_gate_open(conn):
    _tailored(conn)
    n, submitted = FakeNotifier(), []

    def submitter(url, *a, **k):
        submitted.append(url)
        return {"payload": "[]", "screenshot": "s2.png"}

    worker_cycle(conn, n, {**CFG, "auto_submit": True}, PROFILE, FakeClient(), 100, filler=ok_filler, submitter=submitter)
    assert len(submitted) == 1
    assert conn.execute("SELECT mode FROM applications").fetchone()[0] == "auto"


@needs_browser
def test_no_form_is_flagged_not_silently_filled(tmp_path):
    p = tmp_path / "desc.html"
    p.write_text("<html><body><h1>Job</h1><input id='nl' placeholder='newsletter email'></body></html>")
    res = fill_form(p.as_uri(), PROFILE, LETTER, tmp_path / "s")
    assert res["unanswered"] == ["application form not found on page"] and res["payload"] == []
    with pytest.raises(RuntimeError, match="not found"):
        submit_form(p.as_uri(), PROFILE, LETTER, tmp_path / "s")


@needs_browser
def test_form_inside_iframe_and_behind_apply_link(tmp_path):
    (tmp_path / "form.html").write_text(FORM)
    (tmp_path / "embed.html").write_text("<html><body><iframe src='form.html'></iframe></body></html>")
    res = fill_form((tmp_path / "embed.html").as_uri(), PROFILE, LETTER, tmp_path / "s")
    assert "Email" in {p["label"] for p in res["payload"]}
    (tmp_path / "desc.html").write_text("<html><body><p>Job</p><a href='form.html'>Apply now</a></body></html>")
    res = fill_form((tmp_path / "desc.html").as_uri(), PROFILE, LETTER, tmp_path / "s")
    assert "Email" in {p["label"] for p in res["payload"]}


def test_cli_approval_queue_applies_once(conn):
    from kmd.notify.base import drain_cli_decisions, queue_cli_decision, request_approval
    from tests.fakes import FakeNotifier
    aid = request_approval(conn, FakeNotifier(), "application", "acme:1", "x", 1)
    assert queue_cli_decision(conn, aid, True) and not queue_cli_decision(conn, 999, True)
    assert drain_cli_decisions(conn) == [f"a:{aid}:y"] and drain_cli_decisions(conn) == []


def test_unconfirmed_submit_is_error_and_not_retried(conn):
    seed_job(conn)
    conn.execute("INSERT INTO applications (source, job_id, bullets, cover_letter, factcheck, status, created_at) "
                 "VALUES ('acme','1','[]',?,'[]','approved',1)", (json.dumps(LETTER),))
    bus.publish(conn, "submit:acme:1:manual", "app.submit", json.dumps({"mode": "manual"}))
    sub = lambda *a, **k: {"payload": "[]", "screenshot": "s.png", "confirmed": False}  # noqa: E731
    from kmd.workers import drain_events
    r = drain_events(conn, 5, "app.submit", lambda c, e: ats.handle_submit(c, e, PROFILE, CFG, 5, submitter=sub))
    assert r["failed"] == 0
    assert conn.execute("SELECT status FROM applications").fetchone()[0] == "error"

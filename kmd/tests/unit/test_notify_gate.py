import json

import httpx

from kmd.gate.gate import evaluate
from kmd.notify.base import decide, request_approval
from kmd.notify.telegram import TelegramNotifier
from tests.fakes import PROFILE, FakeNotifier, seed_job

CFG = {"auto_submit": True, "auto_submit_min_score": 85, "daily_submit_cap": 5}


def add_app(conn, status="filled", factcheck="[]", source="acme", job_id="1"):
    conn.execute("INSERT INTO applications (source, job_id, factcheck, status, created_at) VALUES (?,?,?,?,1)",
                 (source, job_id, factcheck, status))


def test_approval_created_once_and_decided_once(conn):
    n = FakeNotifier()
    aid = request_approval(conn, n, "application", "acme:1", "hi", 1)
    assert aid and request_approval(conn, n, "application", "acme:1", "hi", 2) is None
    assert len(n.sent) == 1
    first = decide(conn, f"a:{aid}:y", 5)
    assert first[1] == "approved"
    assert decide(conn, f"a:{aid}:n", 6) is None  # double press / replay ignored
    assert decide(conn, "garbage", 6) is None


def test_gate_open_when_everything_holds(conn):
    seed_job(conn)
    add_app(conn)
    assert evaluate(conn, "acme", "1", CFG, PROFILE, 1000) == []


def test_gate_blocks_each_condition(conn):
    seed_job(conn)
    add_app(conn)
    assert any("auto_submit" in f for f in evaluate(conn, "acme", "1", {**CFG, "auto_submit": False}, PROFILE, 1000))
    assert any("score" in f for f in evaluate(conn, "acme", "1", {**CFG, "auto_submit_min_score": 95}, PROFILE, 1000))
    assert any("ATS" in f for f in evaluate(conn, "acme", "1", CFG, PROFILE, 1000, ats="workday"))
    assert any("questions" in f for f in evaluate(conn, "acme", "1", CFG, PROFILE, 1000, unanswered=["Salary"]))
    assert any("blocklist" in f for f in evaluate(conn, "acme", "1", CFG, {**PROFILE, "blocklist": ["ACME"]}, 1000))


def test_gate_blocks_on_cap_factcheck_and_status(conn):
    seed_job(conn)
    add_app(conn)
    for i in range(5):
        add_app(conn, status="submitted", source="x", job_id=str(i))
        conn.execute("UPDATE applications SET submitted_at=999 WHERE source='x' AND job_id=?", (str(i),))
    assert any("cap" in f for f in evaluate(conn, "acme", "1", CFG, PROFILE, 1000))
    conn.execute("UPDATE applications SET factcheck='[\"bad\"]', status='tailored' WHERE source='acme'")
    fails = evaluate(conn, "acme", "1", {**CFG, "daily_submit_cap": 99}, PROFILE, 1000)
    assert any("fact-check" in f for f in fails) and any("status" in f for f in fails)


def test_telegram_send_poll_offset_and_chat_filter(conn):
    calls = []

    def handler(request):
        body = json.loads(request.content)
        method = request.url.path.rsplit("/", 1)[1]
        calls.append((method, body))
        if method == "sendMessage":
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 7}})
        if method == "getUpdates":
            return httpx.Response(200, json={"ok": True, "result": [
                {"update_id": 10, "callback_query": {"id": "c1", "data": "a:1:y", "message": {"chat": {"id": 42}}}},
                {"update_id": 11, "callback_query": {"id": "c2", "data": "a:2:y", "message": {"chat": {"id": 999}}}},
            ]})
        return httpx.Response(200, json={"ok": True, "result": True})

    t = TelegramNotifier(conn, "TOKEN", 42, http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert t.send("hello", [("Approve", "a:1:y")]) == "7"
    assert calls[0][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "a:1:y"
    assert t.poll_replies() == ["a:1:y"]  # stranger's press dropped
    t.poll_replies()
    assert [b for m, b in calls if m == "getUpdates"][1]["offset"] == 12  # offset persisted, no replays

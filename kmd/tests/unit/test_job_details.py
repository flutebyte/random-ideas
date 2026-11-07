import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace

import pytest

from kmd.events import bus
from kmd.scoring.handler import process_one
from kmd.watchers.greenhouse import DetailError, fetch_detail
from kmd.watchers.htmltext import html_to_text

PROFILE = {
    "title_keywords": ["engineer"],
    "skills": ["python"],
    "locations": ["Remote"],
    "deal_breakers": ["director"],
}


# --- html_to_text ----------------------------------------------------------
def test_escaped_html_becomes_readable_text():
    raw = "&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;"
    assert html_to_text(raw) == "Build & ship\n\n- Python\n- SQL"


def test_scripts_are_dropped_and_length_is_capped():
    assert "evil" not in html_to_text("<p>hi</p><script>evil()</script>")
    assert len(html_to_text("<p>" + "x" * 10_000 + "</p>", limit=500)) == 500
    assert html_to_text(None) == ""


# --- fetch_detail against a local server -----------------------------------
@pytest.fixture
def server():
    mode = {"v": "ok"}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.endswith("/404"):
                self.send_response(404)
                self.end_headers()
            elif self.path.endswith("/429"):
                self.send_response(429)
                self.end_headers()
            else:
                body = json.dumps({"content": "&lt;p&gt;Hello&lt;/p&gt;", "location": {"name": "Remote"}}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_fetch_detail_parses_location_and_description(server):
    assert fetch_detail("acme", "1", base=server) == {"location": "Remote", "description": "Hello"}


def test_fetch_detail_404_is_none_but_429_raises(server):
    assert fetch_detail("acme", "404", base=server) is None
    with pytest.raises(DetailError):
        fetch_detail("acme", "429", base=server)


# --- handler uses details --------------------------------------------------
class FakeClient:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        text = self.replies.pop(0)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


OK = json.dumps({"score": 77, "reason": "fine"})


def add_job(conn, job_id, title):
    conn.execute("INSERT INTO jobs (source, job_id, title, url) VALUES ('acme',?,?,'u')", (job_id, title))
    bus.publish(conn, f"gh:acme:{job_id}", "job.new", job_id)


def test_description_and_location_reach_the_prompt(conn):
    add_job(conn, "1", "Backend Engineer")
    c = FakeClient(OK)
    fetch = lambda b, j: {"location": "Bangalore", "description": "Needs Python and SQL"}
    assert process_one(conn, 1000, c, PROFILE, "m", detail_fetch=fetch) == "done"
    prompt = c.calls[0]["messages"][0]["content"]
    assert "Needs Python and SQL" in prompt and "Bangalore" in prompt


def test_filtered_jobs_never_trigger_a_detail_fetch(conn):
    add_job(conn, "1", "Director of Engineering")
    calls = []
    process_one(conn, 1000, FakeClient(), PROFILE, "m", detail_fetch=lambda b, j: calls.append(j))
    assert calls == []


def test_gone_job_is_recorded_without_calling_the_llm(conn):
    add_job(conn, "1", "Backend Engineer")
    c = FakeClient()
    assert process_one(conn, 1000, c, PROFILE, "m", detail_fetch=lambda b, j: None) == "done"
    assert c.calls == []
    assert conn.execute("SELECT reason FROM scores").fetchone()[0] == "job no longer available"


def test_temporary_fetch_error_retries_later(conn):
    add_job(conn, "1", "Backend Engineer")

    def boom(b, j):
        raise DetailError("HTTP 503")

    assert process_one(conn, 1000, FakeClient(), PROFILE, "m", detail_fetch=boom) == "failed"
    assert conn.execute("SELECT COUNT(*) FROM scores").fetchone()[0] == 0
    assert conn.execute("SELECT attempts FROM events").fetchone()[0] == 1


def test_detail_is_cached_so_an_llm_retry_does_not_refetch(conn):
    add_job(conn, "1", "Backend Engineer")
    fetches = []

    def fetch(b, j):
        fetches.append(j)
        return {"location": "Remote", "description": "d"}

    assert process_one(conn, 1000, FakeClient("junk"), PROFILE, "m", detail_fetch=fetch) == "failed"
    assert process_one(conn, 2000, FakeClient(OK), PROFILE, "m", detail_fetch=fetch) == "done"
    assert fetches == ["1"]

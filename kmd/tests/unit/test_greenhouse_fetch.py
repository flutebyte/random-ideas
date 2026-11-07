"""fetch() against a tiny local web server, so no internet is needed."""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from kmd.watchers.greenhouse import fetch


@pytest.fixture
def server():
    state = {"mode": "ok"}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if state["mode"] == "429":
                self.send_response(429)
                self.end_headers()
            elif self.headers.get("If-None-Match") == '"v1"':
                self.send_response(304)
                self.end_headers()
            else:
                body = json.dumps({"jobs": [{"id": 7, "title": "Dev", "absolute_url": "http://x/7"}]}).encode()
                self.send_response(200)
                self.send_header("ETag", '"v1"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield state, f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_200_parses_jobs_and_etag(server):
    _, base = server
    assert fetch("acme", None, base=base) == (200, '"v1"', [{"id": 7, "title": "Dev", "url": "http://x/7"}])


def test_sends_etag_and_gets_304(server):
    _, base = server
    status, _, jobs = fetch("acme", '"v1"', base=base)
    assert status == 304 and jobs == []


def test_429_is_returned_not_raised(server):
    state, base = server
    state["mode"] = "429"
    assert fetch("acme", None, base=base)[0] == 429


def test_unreachable_server_returns_status_0():
    assert fetch("acme", None, base="http://127.0.0.1:1")[0] == 0

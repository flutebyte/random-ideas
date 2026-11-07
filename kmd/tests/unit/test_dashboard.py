import urllib.error
import urllib.request

import pytest

from kmd.dashboard import make_server, render
from kmd.db.engine import connect
from tests.fakes import seed_job


def test_render_groups_cards_and_escapes_html(conn):
    seed_job(conn, title="<script>alert(1)</script> Engineer")
    conn.execute("INSERT INTO applications (source, job_id, factcheck, status, created_at) VALUES ('acme','1','[]','filled',1)")
    out = render(conn)
    assert "filled (1)" in out and "tailored (0)" in out
    assert "<script>alert(1)</script>" not in out and "&lt;script&gt;" in out


def test_server_serves_page_localhost_only(tmp_path):
    db = tmp_path / "d.db"
    c = connect(db)
    seed_job(c)
    c.close()
    import threading
    srv = make_server(db, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        host, port = srv.server_address
        assert host == "127.0.0.1"
        body = urllib.request.urlopen(f"http://127.0.0.1:{port}/").read().decode()
        assert "kmd job agent" in body and "Backend Engineer" in body
        with pytest.raises(urllib.error.HTTPError):
            urllib.request.urlopen(f"http://127.0.0.1:{port}/etc/passwd")
    finally:
        srv.shutdown()

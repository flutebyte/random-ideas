"""Read-only kanban dashboard on 127.0.0.1. `python -m kmd dashboard [port]`.
It only SELECTs; approving still happens in Telegram. Everything from the DB is HTML-escaped."""
import html
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from kmd.app import status, top_jobs
from kmd.db.engine import connect

COLUMNS = ["tailored", "needs_input", "filled", "approved", "submitted", "rejected", "factcheck_failed", "error"]
E = html.escape

CSS = """body{font:14px system-ui;margin:20px;background:#f6f7f9;color:#222}h1{margin:0 0 4px}
.board{display:flex;gap:10px;align-items:flex-start;overflow-x:auto}.col{background:#fff;border-radius:8px;
padding:8px;min-width:190px;box-shadow:0 1px 2px #0002}.col h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;color:#555}
.card{border:1px solid #e3e5e8;border-radius:6px;padding:6px;margin:6px 0;font-size:13px}.muted{color:#777}
a{color:#2457d6}table{border-collapse:collapse;background:#fff}td,th{padding:4px 10px;border-bottom:1px solid #eee;text-align:left}"""


def render(conn):
    apps = conn.execute(
        "SELECT a.source, a.job_id, a.status, a.mode, j.title, j.url, s.score FROM applications a "
        "LEFT JOIN jobs j ON j.source=a.source AND j.job_id=a.job_id "
        "LEFT JOIN scores s ON s.source=a.source AND s.job_id=a.job_id ORDER BY s.score DESC"
    ).fetchall()
    cols = []
    for c in COLUMNS:
        cards = "".join(
            f"<div class=card><a href='{E(a['url'] or '#', quote=True)}'>{E(a['title'] or a['job_id'])}</a>"
            f"<br><span class=muted>{E(a['source'])} &middot; score {E(str(a['score']))} &middot; {E(a['mode'])}</span></div>"
            for a in apps if a["status"] == c
        )
        n = sum(1 for a in apps if a["status"] == c)
        cols.append(f"<div class=col><h3>{E(c.replace('_', ' '))} ({n})</h3>{cards}</div>")
    top = "".join(
        f"<tr><td>{r['score']}</td><td><a href='{E(r['url'] or '#', quote=True)}'>{E(r['title'])}</a></td><td>{E(r['reason'])}</td></tr>"
        for r in top_jobs(conn, 70, 15)
    )
    st = status(conn)
    return (
        f"<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=30><title>kmd</title><style>{CSS}</style>"
        f"<h1>kmd job agent</h1><p class=muted>pending approvals: {st['pending_approvals']} &middot; "
        f"emails: {E(str(st['emails']))} &middot; queue: {E(str(st['events']))}</p>"
        f"<div class=board>{''.join(cols)}</div><h2>Top scored jobs</h2><table><tr><th>score</th><th>job</th><th>why</th></tr>{top}</table>"
    )


def make_server(db_path, port=8765):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ("/", "/index.html"):
                self.send_error(404)
                return
            conn = connect(db_path)  # per request: handler threads can't share a sqlite connection
            try:
                body = render(conn).encode()
            finally:
                conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), H)  # localhost only


def serve(db_path, port=8765):
    srv = make_server(db_path, port)
    print(f"dashboard on http://127.0.0.1:{port}  (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def start_background(db_path, port=8765):
    srv = make_server(db_path, port)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

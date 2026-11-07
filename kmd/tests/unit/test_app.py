"""End to end with fakes: poll finds a new job -> event -> scorer scores it -> top lists it."""
import asyncio
import json
from types import SimpleNamespace

from kmd.app import run_all, top_jobs
from kmd.config import DEFAULTS
from kmd.db.engine import connect

PROFILE = {"title_keywords": ["engineer"], "skills": ["python"], "locations": ["Remote"], "deal_breakers": []}


class FakeClient:
    def __init__(self):
        self.calls = 0
        self.messages = self

    def create(self, **kw):
        self.calls += 1
        text = json.dumps({"score": 88, "reason": "python match"})
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


def test_new_job_flows_from_poll_to_score(tmp_path):
    db = tmp_path / "app.db"
    cfg = {**DEFAULTS, "db_path": str(db), "boards": ["acme"], "score_interval_secs": 0.05}
    polls = []

    def fetch(board, etag):
        polls.append(1)
        jobs = [{"id": 1, "title": "Old Engineer", "url": "u1"}]
        if len(polls) > 1:  # second poll onwards, a new posting appears
            jobs.append({"id": 2, "title": "New Engineer", "url": "u2"})
        return 200, "e", jobs

    detail = lambda b, j: {"location": "Remote", "description": "python"}
    client = FakeClient()

    async def go():
        stop = asyncio.Event()
        task = asyncio.create_task(
            run_all(cfg, PROFILE, client, fetch=fetch, detail_fetch=detail, stop=stop, poll_interval_secs=0.1)
        )
        await asyncio.sleep(1.0)
        stop.set()
        await asyncio.wait_for(task, timeout=3)

    asyncio.run(go())

    conn = connect(db)
    rows = top_jobs(conn, min_score=70)
    assert [(r["title"], r["score"]) for r in rows] == [("New Engineer", 88)]  # baseline job was not scored
    assert client.calls == 1  # scored once, not once per poll
    conn.close()

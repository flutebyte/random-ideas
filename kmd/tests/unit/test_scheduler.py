import asyncio

from kmd.config import load_config
from kmd.db.engine import connect
from kmd.watchers.scheduler import poll_all, run


def test_one_broken_board_does_not_stop_the_others(conn):
    def fetch(board, etag):
        if board == "bad":
            raise RuntimeError("boom")
        return 200, "e", [{"id": 1, "title": "t", "url": "u"}]

    results = poll_all(conn, ["bad", "good"], fetch, now=1000)
    assert results == {"bad": None, "good": 0}
    assert conn.execute("SELECT COUNT(*) FROM jobs WHERE source='good'").fetchone()[0] == 1


def test_run_polls_repeatedly_and_stops_on_request(tmp_path):
    db = tmp_path / "s.db"
    calls = []

    def fetch(board, etag):
        calls.append(board)
        return 200, "e", []

    async def go():
        stop = asyncio.Event()
        task = asyncio.create_task(run(db, ["acme"], 0.05, fetch=fetch, stop=stop))
        await asyncio.sleep(0.4)
        stop.set()
        await asyncio.wait_for(task, timeout=2)

    asyncio.run(go())
    assert len(calls) >= 3


def test_config_defaults_when_file_missing(tmp_path):
    cfg = load_config(tmp_path / "nope.json")
    assert cfg["boards"] == [] and cfg["interval_minutes"] == 20


def test_config_file_overrides(tmp_path):
    p = tmp_path / "c.json"
    p.write_text('{"boards": ["stripe"], "interval_minutes": 30}')
    cfg = load_config(p)
    assert cfg["boards"] == ["stripe"] and cfg["interval_minutes"] == 30

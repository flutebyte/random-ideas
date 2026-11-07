import asyncio
import logging
import time

from kmd.db.engine import connect
from kmd.watchers.greenhouse import fetch as greenhouse_fetch
from kmd.watchers.jobs import poll_board

log = logging.getLogger("kmd.scheduler")


def poll_all(conn, boards, fetch, now):
    """Poll every board once. One broken board must not stop the others."""
    results = {}
    for board in boards:
        try:
            results[board] = poll_board(conn, board, fetch, now)
        except Exception:
            log.exception("polling %s failed", board)
            results[board] = None
    return results


def _one_cycle(db_path, boards, fetch):
    # sqlite connections can't hop threads, so each cycle opens its own
    conn = connect(db_path)
    try:
        return poll_all(conn, boards, fetch, int(time.time()))
    finally:
        conn.close()


async def run(db_path, boards, interval_secs, fetch=greenhouse_fetch, stop=None):
    """Poll all boards, sleep, repeat, until `stop` (an asyncio.Event) is set."""
    stop = stop or asyncio.Event()
    while not stop.is_set():
        results = await asyncio.to_thread(_one_cycle, db_path, boards, fetch)
        log.info("poll cycle: %s", results)
        try:  # sleep, but wake up immediately if asked to stop
            await asyncio.wait_for(stop.wait(), timeout=interval_secs)
        except asyncio.TimeoutError:
            pass


def main():
    from kmd.config import load_config

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    cfg = load_config()
    if not cfg["boards"]:
        raise SystemExit("No boards configured. Add them to config.json, e.g. {\"boards\": [\"stripe\"]}")
    try:
        asyncio.run(run(cfg["db_path"], cfg["boards"], cfg["interval_minutes"] * 60))
    except KeyboardInterrupt:
        log.info("stopped")


if __name__ == "__main__":
    main()

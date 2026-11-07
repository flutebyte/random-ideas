"""Spec for kmd.watchers.jobs. Write jobs.py until these pass.

Required API:
  poll_board(conn, board, fetch, now) -> int    number of job.new events published

`fetch(board, etag)` is passed in (tests give a fake, real code will do HTTP).
It returns (status, etag, jobs):
  status 200: jobs is a list of {"id": ..., "title": ..., "url": ...}
  status 304: nothing changed since `etag`; jobs is []
  status 429: we are going too fast; jobs is []

Tables: `jobs` (what we have already seen) and `poller_state` (per board:
etag, baselined, failures, backoff_until). See schema.sql.

Rules:
  - The FIRST successful poll of a board is a baseline: remember every job,
    publish 0 events (otherwise you get spammed with 300 old jobs).
  - Later polls: jobs not seen before => one event each,
    key "gh:<board>:<job_id>", type "job.new".
  - 304 => do nothing.
  - 429 => no crash, no events, back off: next allowed poll is
    now + 60 * 2**failures seconds; during backoff fetch is NOT called.
  - A good (200) poll resets failures to 0.
"""
from kmd.watchers.jobs import poll_board


def make_fetch(responses):
    calls = []

    def fetch(board, etag):
        calls.append((board, etag))
        return responses.pop(0)

    fetch.calls = calls
    return fetch


def job(i):
    return {"id": i, "title": f"Engineer {i}", "url": f"http://x/{i}"}


def count_events(conn):
    return conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]


def test_first_poll_is_baseline_no_events(conn):
    fetch = make_fetch([(200, "e1", [job(1), job(2)])])
    assert poll_board(conn, "acme", fetch, now=1000) == 0
    assert count_events(conn) == 0
    assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 2


def test_new_job_after_baseline_makes_one_event(conn):
    fetch = make_fetch([(200, "e1", [job(1)]), (200, "e2", [job(1), job(2)])])
    poll_board(conn, "acme", fetch, now=1000)
    assert poll_board(conn, "acme", fetch, now=2000) == 1
    key = conn.execute("SELECT event_key, event_type FROM events").fetchone()
    assert tuple(key) == ("gh:acme:2", "job.new")


def test_same_jobs_twice_no_duplicate_events(conn):
    same = [job(1), job(2)]
    fetch = make_fetch([(200, "e1", same), (200, "e1", same), (200, "e1", same)])
    for t in (1000, 2000, 3000):
        poll_board(conn, "acme", fetch, now=t)
    assert count_events(conn) == 0


def test_sends_saved_etag_and_304_does_nothing(conn):
    fetch = make_fetch([(200, "e1", [job(1)]), (304, "e1", [])])
    poll_board(conn, "acme", fetch, now=1000)
    assert poll_board(conn, "acme", fetch, now=2000) == 0
    assert fetch.calls[1] == ("acme", "e1")


def test_429_backs_off_and_does_not_call_fetch_during_backoff(conn):
    fetch = make_fetch([(429, None, []), (200, "e1", [job(1)])])
    assert poll_board(conn, "acme", fetch, now=1000) == 0      # failures -> 1
    assert poll_board(conn, "acme", fetch, now=1050) == 0      # still backing off
    assert len(fetch.calls) == 1
    poll_board(conn, "acme", fetch, now=1000 + 120)            # 60 * 2**1 passed
    assert len(fetch.calls) == 2


def test_boards_are_independent(conn):
    fetch = make_fetch([(200, "a", [job(1)]), (200, "b", [job(1)])])
    poll_board(conn, "acme", fetch, now=1000)
    poll_board(conn, "other", fetch, now=1000)
    assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 2

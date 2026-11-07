"""Spec for kmd.events.bus. Write bus.py until these pass.

Required API (all take the sqlite connection first; `now` is unix seconds,
passed in so tests control time):
  publish(conn, key, type, payload) -> bool   True if new, False if duplicate key
  claim(conn, now, lease_secs=60)  -> dict|None   one event, or None if nothing ready
  ack(conn, event_id)                          mark done
  fail(conn, event_id, max_attempts=3)         retry later, or status='failed' at the limit
"""
from kmd.events import bus


def test_publish_is_idempotent(conn):
    assert bus.publish(conn, "gh:acme:1", "job.new", "x") is True
    assert bus.publish(conn, "gh:acme:1", "job.new", "x") is False
    assert conn.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 1


def test_claim_returns_event_and_sets_lease(conn):
    bus.publish(conn, "k1", "job.new", "p")
    ev = bus.claim(conn, now=1000, lease_secs=60)
    assert ev["event_key"] == "k1"
    assert conn.execute("SELECT lease_until FROM events").fetchone()[0] == 1060


def test_claimed_event_is_not_handed_out_twice(conn):
    bus.publish(conn, "k1", "job.new", "p")
    assert bus.claim(conn, now=1000) is not None
    assert bus.claim(conn, now=1001) is None


def test_expired_lease_is_reclaimed(conn):
    bus.publish(conn, "k1", "job.new", "p")
    bus.claim(conn, now=1000, lease_secs=60)   # worker "crashes"
    ev = bus.claim(conn, now=1061)
    assert ev is not None and ev["event_key"] == "k1"


def test_ack_removes_from_queue(conn):
    bus.publish(conn, "k1", "job.new", "p")
    ev = bus.claim(conn, now=1000)
    bus.ack(conn, ev["id"])
    assert bus.claim(conn, now=9999) is None


def test_fail_retries_then_dead_letters(conn):
    bus.publish(conn, "k1", "job.new", "p")
    for i in range(3):
        ev = bus.claim(conn, now=1000 + i * 1000)
        assert ev is not None
        bus.fail(conn, ev["id"], max_attempts=3)
    assert bus.claim(conn, now=99999) is None
    assert conn.execute("SELECT status FROM events").fetchone()[0] == "failed"

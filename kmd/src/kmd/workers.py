"""Generic 'claim one event of this type, run a handler, ack/fail' step, shared by all workers."""
import logging

from kmd.events import bus

log = logging.getLogger("kmd.workers")


def process_event(conn, now, event_type, handler, lease_secs=300):
    """Returns 'idle', 'done' or 'failed'. Handler exceptions count as failed attempts (bus.fail)."""
    event = bus.claim(conn, now, lease_secs=lease_secs, event_type=event_type)
    if event is None:
        return "idle"
    try:
        handler(conn, event)
    except Exception:
        log.exception("handler for %s failed", event["event_key"])
        bus.fail(conn, event["id"])
        return "failed"
    bus.ack(conn, event["id"])
    return "done"


def drain_events(conn, now, event_type, handler):
    counts = {"done": 0, "failed": 0}
    while True:
        r = process_event(conn, now, event_type, handler)
        if r == "idle":
            return counts
        counts[r] += 1

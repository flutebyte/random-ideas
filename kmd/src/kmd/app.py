"""Glue: runs the job poller, scorer, tailoring/fill/approval worker and mail watcher in one process."""
import asyncio
import logging
import os
import threading
import time

from kmd.ats import handler as ats
from kmd.db.engine import connect
from kmd.mail import handler as mailh
from kmd.notify import base as notify_base
from kmd.notify.telegram import make_notifier
from kmd.scoring.handler import drain
from kmd.tailoring import handler as tailorh
from kmd.watchers import scheduler
from kmd.watchers.greenhouse import fetch as greenhouse_fetch
from kmd.watchers.greenhouse import fetch_detail
from kmd.workers import drain_events

log = logging.getLogger("kmd.app")


def tailoring_enabled(profile):
    return bool(profile.get("facts"))


def fill_enabled(cfg, profile):
    if not (cfg["fill_forms"] and profile.get("contact") and profile.get("resume_path")):
        return False
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


def _score_cycle(db_path, profile, client, model, daily_cap, detail_fetch, tailor_threshold):
    conn = connect(db_path)  # own connection: sqlite connections can't hop threads
    try:
        return drain(conn, int(time.time()), client, profile, model, daily_cap, detail_fetch, tailor_threshold)
    finally:
        conn.close()


async def score_loop(cfg, profile, client, detail_fetch, stop):
    threshold = cfg["tailor_threshold"] if tailoring_enabled(profile) else None
    while not stop.is_set():
        result = await asyncio.to_thread(
            _score_cycle, cfg["db_path"], profile, client,
            cfg["scoring_model"], cfg["daily_cap"], detail_fetch, threshold,
        )
        if result["done"] or result["failed"] or result["stopped"] == "budget":
            log.info("score cycle: %s", result)
        try:
            await asyncio.wait_for(stop.wait(), timeout=cfg["score_interval_secs"])
        except asyncio.TimeoutError:
            pass


def worker_cycle(conn, notifier, cfg, profile, client, now, filler=None, submitter=None):
    """One pass over every post-scoring event type, then apply any button presses."""
    fill_on = fill_enabled(cfg, profile) if filler is None else True
    out = {}
    if tailoring_enabled(profile):
        out["tailor"] = drain_events(conn, now, "job.tailor", lambda c, e: tailorh.handle_tailor(
            c, e, client, profile, cfg["tailor_model"], now, fill_enabled=fill_on))
    out["notify"] = drain_events(conn, now, "app.notify", lambda c, e: ats.handle_notify(c, e, notifier, now))
    fkw = {"filler": filler} if filler else {}
    skw = {"submitter": submitter} if submitter else {}
    out["fill"] = drain_events(conn, now, "app.fill", lambda c, e: ats.handle_fill(c, e, notifier, profile, cfg, now, **fkw))
    out["submit"] = drain_events(conn, now, "app.submit", lambda c, e: ats.handle_submit(c, e, profile, cfg, now, **skw))
    for data in [*notifier.poll_replies(), *notify_base.drain_cli_decisions(conn)]:
        decided = notify_base.decide(conn, data, now)
        if decided:
            approval, decision = decided
            ats.on_decision(conn, approval, decision, notifier)
    out["email"] = drain_events(conn, now, "email.received", lambda c, e: mailh.handle_email(
        c, e, client, notifier, profile, cfg, now))
    return out


def _worker_thread_cycle(cfg, profile, client):
    conn = connect(cfg["db_path"])
    try:
        notifier = make_notifier(cfg, conn)
        return worker_cycle(conn, notifier, cfg, profile, client, int(time.time()))
    finally:
        conn.close()


async def worker_loop(cfg, profile, client, stop):
    while not stop.is_set():
        try:
            result = await asyncio.to_thread(_worker_thread_cycle, cfg, profile, client)
            if any(v["done"] or v["failed"] for v in result.values()):
                log.info("worker cycle: %s", result)
        except Exception:
            log.exception("worker cycle crashed; will retry")
        try:
            await asyncio.wait_for(stop.wait(), timeout=cfg["worker_interval_secs"])
        except asyncio.TimeoutError:
            pass


async def mail_loop(cfg, stop):
    """Runs the blocking IMAP watcher in a thread. Credentials come from env, never the DB or config."""
    user, password = os.environ.get("KMD_IMAP_USER"), os.environ.get("KMD_IMAP_PASSWORD")
    if not (user and password):
        log.info("mail watcher off: set KMD_IMAP_USER and KMD_IMAP_PASSWORD to enable")
        return
    from kmd.mail.imap import ImapClient
    from kmd.mail.sync import watch

    tstop = threading.Event()
    make = lambda: ImapClient(cfg["imap_host"], user, password, cfg["imap_mailbox"])  # noqa: E731
    thread = asyncio.create_task(asyncio.to_thread(
        watch, cfg["db_path"], make, cfg["imap_mailbox"], tstop, cfg["imap_poll_secs"]))
    await stop.wait()
    tstop.set()
    await thread


async def run_all(cfg, profile, client, fetch=greenhouse_fetch, detail_fetch=fetch_detail,
                  stop=None, poll_interval_secs=None, with_mail=True):
    stop = stop or asyncio.Event()
    connect(cfg["db_path"]).close()  # create the file + tables once, before threads race to do it
    interval = poll_interval_secs if poll_interval_secs is not None else cfg["interval_minutes"] * 60
    tasks = [
        scheduler.run(cfg["db_path"], cfg["boards"], interval, fetch=fetch, stop=stop),
        score_loop(cfg, profile, client, detail_fetch, stop),
        worker_loop(cfg, profile, client, stop),
    ]
    if with_mail:
        tasks.append(mail_loop(cfg, stop))
    await asyncio.gather(*tasks)


def top_jobs(conn, min_score=70, limit=20):
    return conn.execute(
        "SELECT s.score, j.title, j.url, s.reason FROM scores s "
        "JOIN jobs j ON j.source = s.source AND j.job_id = s.job_id "
        "WHERE s.stage = 'llm' AND s.score >= ? ORDER BY s.score DESC, s.created_at DESC LIMIT ?",
        (min_score, limit),
    ).fetchall()


def status(conn):
    """Kanban-style summary: counts per application status, event queue, today's activity."""
    apps = {r["status"]: r["n"] for r in conn.execute("SELECT status, COUNT(*) n FROM applications GROUP BY status")}
    events = {f"{r['event_type']}/{r['status']}": r["n"] for r in conn.execute(
        "SELECT event_type, status, COUNT(*) n FROM events GROUP BY event_type, status")}
    pending = conn.execute("SELECT COUNT(*) FROM approvals WHERE status='pending'").fetchone()[0]
    emails = {r["class"] or "unclassified": r["n"] for r in conn.execute("SELECT class, COUNT(*) n FROM emails GROUP BY class")}
    return {"applications": apps, "events": events, "pending_approvals": pending, "emails": emails}

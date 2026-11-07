"""app.fill -> fill the form and ask the human. approval -> submit. Also the no-browser notify path."""
import json
import logging

from kmd.ats import greenhouse
from kmd.events import bus
from kmd.gate import gate
from kmd.notify.base import request_approval

log = logging.getLogger("kmd.ats")


def _app_job(conn, source, job_id):
    app = conn.execute("SELECT * FROM applications WHERE source=? AND job_id=?", (source, job_id)).fetchone()
    job = conn.execute("SELECT title, url FROM jobs WHERE source=? AND job_id=?", (source, job_id)).fetchone()
    score = conn.execute("SELECT score, reason FROM scores WHERE source=? AND job_id=?", (source, job_id)).fetchone()
    return dict(app), dict(job), dict(score) if score else {"score": None, "reason": ""}


def preview(app, job, score, extra=""):
    bullets = "\n".join(f"- {b['text']}" for b in json.loads(app["bullets"]))
    letter = "\n\n".join(p["text"] for p in json.loads(app["cover_letter"]))
    return (f"{job['title']}  (score {score['score']})\n{job['url']}\n{score['reason']}\n\n"
            f"Resume bullets:\n{bullets}\n\nCover letter:\n{letter}\n{extra}")


def handle_notify(conn, event, notifier, now):
    """No browser available: send the tailored materials for the human to use manually."""
    _, source, job_id = event["event_key"].split(":", 2)
    app, job, score = _app_job(conn, source, job_id)
    request_approval(conn, notifier, "application", f"{source}:{job_id}",
                     preview(app, job, score, "\n(not auto-filled; approve to mark it as applied by you)"), now)


def handle_fill(conn, event, notifier, profile, cfg, now, filler=greenhouse.fill_form):
    _, source, job_id = event["event_key"].split(":", 2)
    app, job, score = _app_job(conn, source, job_id)
    res = filler(job["url"], profile, json.loads(app["cover_letter"]), cfg["screenshot_dir"],
                 headless=cfg["headless"], name=f"{source}-{job_id}")
    status = "needs_input" if res["unanswered"] else "filled"
    conn.execute(
        "UPDATE applications SET status=?, payload=?, screenshot=? WHERE source=? AND job_id=?",
        (status, json.dumps(res["payload"]), res["screenshot"], source, job_id),
    )
    fails = gate.evaluate(conn, source, job_id, cfg, profile, now, unanswered=res["unanswered"])
    if not fails:
        bus.publish(conn, f"submit:{source}:{job_id}:auto", "app.submit", json.dumps({"mode": "auto"}))
        return
    extra = f"\nForm filled, NOT submitted. Screenshot: {res['screenshot']}"
    if res["unanswered"]:
        extra += f"\nNeeds you: {', '.join(res['unanswered'])}"
    extra += "\nHuman needed because: " + "; ".join(fails)
    request_approval(conn, notifier, "application", f"{source}:{job_id}", preview(app, job, score, extra), now)


def handle_submit(conn, event, profile, cfg, now, submitter=greenhouse.submit_form):
    _, source, job_id, _ = event["event_key"].split(":", 3)
    mode = json.loads(event["payload"] or "{}").get("mode", "manual")
    app, job, _ = _app_job(conn, source, job_id)
    if app["status"] == "submitted":
        return  # idempotent: a retried event must not submit twice
    if mode == "auto":
        fails = gate.evaluate(conn, source, job_id, cfg, profile, now)
        if fails:
            raise RuntimeError("gate closed at submit time: " + "; ".join(fails))
    res = submitter(job["url"], profile, json.loads(app["cover_letter"]), cfg["screenshot_dir"],
                    headless=cfg["headless"], name=f"{source}-{job_id}")
    # No confirmation page => we don't know. Mark 'error' and never retry (a retry could apply twice).
    confirmed = res.get("confirmed", True)
    if not confirmed:
        log.warning("submit of %s:%s not confirmed; check the screenshot %s before retrying by hand",
                    source, job_id, res["screenshot"])
    conn.execute(
        "UPDATE applications SET status=?, mode=?, payload=?, screenshot=?, submitted_at=? "
        "WHERE source=? AND job_id=?",
        ("submitted" if confirmed else "error", mode, res["payload"], res["screenshot"], now, source, job_id),
    )


def on_decision(conn, approval, decision, notifier):
    """Called when the user presses a button. Approve of a filled form queues a submit;
    approve of a notify-only application just records that the user applied themselves."""
    if approval["kind"] == "application":
        source, job_id = approval["ref"].split(":", 1)
        if decision == "rejected":
            conn.execute("UPDATE applications SET status='rejected' WHERE source=? AND job_id=?", (source, job_id))
            return
        app = conn.execute("SELECT status FROM applications WHERE source=? AND job_id=?", (source, job_id)).fetchone()
        if app and app["status"] == "filled":
            conn.execute("UPDATE applications SET status='approved' WHERE source=? AND job_id=?", (source, job_id))
            bus.publish(conn, f"submit:{source}:{job_id}:manual", "app.submit", json.dumps({"mode": "manual"}))
            notifier.send(f"Approved. Submitting {approval['ref']}...")
        else:
            notifier.send(f"{approval['ref']} still needs your input or was not auto-filled; nothing was submitted.")
    elif approval["kind"] == "email_draft":
        notifier.send("Draft noted. (v1 never sends mail; copy it into your reply.)" if decision == "approved"
                      else "Draft discarded.")

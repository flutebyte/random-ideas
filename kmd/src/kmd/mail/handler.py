"""email.received -> prefilter -> classify -> action chosen by code. Replies are DRAFTS shown in the
notifier only: v1 never sends mail, never follows links, never auto-handles OTPs."""
import json
import re

from kmd.mail import classify as C
from kmd.notify.base import request_approval
from kmd.scoring.llm import score_job

# which class triggers which action (code decides, not the model)
ACTIONS = {
    "interview_invite": "draft_and_notify",
    "recruiter_outreach": "score_draft_and_notify",
    "rejection": "update_tracker",
    "otp": "ignore",
    "other": "ignore",
}


def _set(conn, key, cls, action, state, draft=None):
    conn.execute("UPDATE emails SET class=?, action=?, state=?, draft=? WHERE msg_key=?",
                 (cls, action, state, draft, key))


def _match_application(conn, text):
    """Find a tracked application whose company (board name) appears in the email text."""
    low = text.lower()
    for row in conn.execute(
        "SELECT source, job_id FROM applications WHERE status IN ('filled','approved','submitted','needs_input')"
    ):
        if re.search(r"\b" + re.escape(row["source"].lower()) + r"\b", low):
            return dict(row)
    return None


def handle_email(conn, event, client, notifier, profile, cfg, now):
    key = json.loads(event["payload"])["msg_key"]
    em = dict(conn.execute("SELECT * FROM emails WHERE msg_key=?", (key,)).fetchone())
    if em["state"] != "new":
        return  # already handled (event redelivered)
    ok, why = C.prefilter(em["sender"] or "", em["subject"] or "", em["body"] or "")
    if not ok:
        _set(conn, key, "other", f"ignore ({why})", "ignored")
        return
    cls, summary = C.classify(client, cfg["email_model"], em["sender"], em["subject"], em["body"])
    action = ACTIONS[cls]
    if action == "ignore":
        _set(conn, key, cls, action, "ignored")
        return
    if action == "update_tracker":
        match = _match_application(conn, f"{em['sender']} {em['subject']} {em['body']}")
        if match:
            conn.execute("UPDATE applications SET status='rejected' WHERE source=? AND job_id=?",
                         (match["source"], match["job_id"]))
        notifier.send(f"Rejection: {summary}" + (f"\nMarked {match['source']}/{match['job_id']} as rejected." if match else ""))
        _set(conn, key, cls, action, "done")
        return
    # draft_and_notify / score_draft_and_notify
    extra = ""
    if action == "score_draft_and_notify":
        job = {"title": em["subject"] or "(no subject)", "url": "", "description": em["body"]}
        try:
            score, reason = score_job(client, job, profile, cfg["scoring_model"])
            extra = f"\nFit score: {score} ({reason})"
        except Exception:
            extra = "\nFit score: unavailable"
    draft = C.draft_reply(client, cfg["email_model"], em["sender"], em["subject"], em["body"],
                          profile.get("name", "the candidate"))
    _set(conn, key, cls, action, "done", draft)
    request_approval(
        conn, notifier, "email_draft", key,
        f"{cls.replace('_', ' ')} from {em['sender']}\n{em['subject']}\n{summary}{extra}\n\nDraft reply (NOT sent):\n{draft}",
        now,
    )

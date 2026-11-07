"""Notifier interface. Telegram implements it today; WhatsApp (official Cloud API) could later."""
import logging
import time

log = logging.getLogger("kmd.notify")


class Notifier:
    def send(self, text, buttons=None):
        """buttons: list of (label, callback_data). Returns a message id or None."""
        raise NotImplementedError

    def poll_replies(self):
        """Returns a list of callback_data strings the user pressed since last call."""
        raise NotImplementedError


class LogNotifier(Notifier):
    """Fallback when no Telegram is configured: everything goes to the log; nothing can be approved."""

    def send(self, text, buttons=None):
        log.info("NOTIFY: %s %s", text, [b[0] for b in buttons] if buttons else "")
        return None

    def poll_replies(self):
        return []


def request_approval(conn, notifier, kind, ref, text, now=None):
    """Create a pending approval (once per kind+ref) and send it with Approve/Reject buttons.
    Returns the approval id, or None if one already existed (so restarts don't spam)."""
    now = now if now is not None else int(time.time())
    cur = conn.execute(
        "INSERT OR IGNORE INTO approvals (kind, ref, created_at) VALUES (?, ?, ?)", (kind, ref, now)
    )
    if cur.rowcount != 1:
        return None
    aid = cur.lastrowid
    notifier.send(text, [("Approve", f"a:{aid}:y"), ("Reject", f"a:{aid}:n")])
    return aid


def decide(conn, callback_data, now=None):
    """Apply a button press. Idempotent: only the first decision on an approval counts.
    Returns (approval_row, decision) if this call decided it, else None."""
    now = now if now is not None else int(time.time())
    try:
        tag, aid, choice = callback_data.split(":")
        aid = int(aid)
    except ValueError:
        return None
    if tag != "a" or choice not in ("y", "n"):
        return None
    status = "approved" if choice == "y" else "rejected"
    cur = conn.execute(
        "UPDATE approvals SET status=?, decided_at=? WHERE id=? AND status='pending'", (status, now, aid)
    )
    if cur.rowcount != 1:
        return None
    return dict(conn.execute("SELECT * FROM approvals WHERE id=?", (aid,)).fetchone()), status


def queue_cli_decision(conn, approval_id, approve):
    """`kmd approve|reject N`: queue a button-press equivalent for the running process to apply.
    Returns False if there is no such pending approval."""
    row = conn.execute("SELECT status FROM approvals WHERE id=?", (approval_id,)).fetchone()
    if row is None or row["status"] != "pending":
        return False
    conn.execute("INSERT INTO cli_replies (data) VALUES (?)", (f"a:{approval_id}:{'y' if approve else 'n'}",))
    return True


def drain_cli_decisions(conn):
    rows = conn.execute("SELECT id, data FROM cli_replies ORDER BY id").fetchall()
    for r in rows:
        conn.execute("DELETE FROM cli_replies WHERE id=?", (r["id"],))
    return [r["data"] for r in rows]

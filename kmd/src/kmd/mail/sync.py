"""Turn new mail into email.received events, tracking UIDVALIDITY + last_uid so restarts and
mailbox resets are handled. `client` needs: uidvalidity(), max_uid(), fetch_since(last_uid)."""
import imaplib
import json
import logging
import threading

from kmd.events import bus

log = logging.getLogger("kmd.mail")


def sync(conn, client, mailbox, now):
    """Returns the number of new emails published. First run baselines (history is not processed)."""
    uv = client.uidvalidity()
    st = conn.execute("SELECT uidvalidity, last_uid FROM mail_state WHERE mailbox=?", (mailbox,)).fetchone()
    if st is None or st["uidvalidity"] != uv:
        if st is not None:
            log.warning("UIDVALIDITY changed for %s (%s -> %s): re-baselining", mailbox, st["uidvalidity"], uv)
        conn.execute("INSERT OR REPLACE INTO mail_state (mailbox, uidvalidity, last_uid) VALUES (?, ?, ?)",
                     (mailbox, uv, client.max_uid()))
        return 0
    last = st["last_uid"]
    count = 0
    for msg in client.fetch_since(last):
        key = f"{mailbox}:{uv}:{msg['uid']}"
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute(
                "INSERT OR IGNORE INTO emails (msg_key, sender, subject, body, created_at) VALUES (?, ?, ?, ?, ?)",
                (key, msg["sender"], msg["subject"], msg["body"], now),
            )
            bus.publish(conn, f"email:{key}", "email.received", json.dumps({"msg_key": key}))
            conn.execute("UPDATE mail_state SET last_uid=? WHERE mailbox=?", (msg["uid"], mailbox))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        count += 1
    return count


def watch(db_path, make_client, mailbox, stop: threading.Event, poll_secs=120, idle_secs=540, max_backoff=300):
    """Blocking loop (run it in a thread). IDLE for instant delivery, falling back to polling if the
    server doesn't support it; reconnects with exponential backoff on any error."""
    import time

    from kmd.db.engine import connect

    backoff = 5
    use_idle = True
    while not stop.is_set():
        conn = connect(db_path)
        client = make_client()
        try:
            client.connect()
            backoff = 5
            while not stop.is_set():
                n = sync(conn, client, mailbox, int(time.time()))
                if n:
                    log.info("%d new email(s)", n)
                if use_idle:
                    try:
                        client.idle(idle_secs)
                        continue
                    except imaplib.IMAP4.error:  # server refused IDLE: poll instead (network errors reconnect)
                        log.warning("IDLE not supported; falling back to polling", exc_info=True)
                        use_idle = False
                stop.wait(poll_secs)
        except Exception:
            log.warning("mail watcher error; reconnecting in %ss", backoff, exc_info=True)
            stop.wait(backoff)
            backoff = min(backoff * 2, max_backoff)
        finally:
            client.close()
            conn.close()

"""Thin IMAP wrapper (stdlib imaplib). Read-only: SELECT readonly + BODY.PEEK, so we never change flags.
Everything above this file talks to a small client interface, so tests use a fake."""
import email
import imaplib
import re
import select
from email import policy

MAX_BODY = 6000


def _text_of(msg):
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is None:
        return ""
    text = part.get_content()
    if part.get_content_type() == "text/html":
        text = re.sub(r"<(script|style).*?</\1>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:MAX_BODY]


def parse_message(uid, raw):
    msg = email.message_from_bytes(raw, policy=policy.default)
    return {
        "uid": uid,
        "sender": str(msg.get("From", "")),
        "subject": str(msg.get("Subject", "")),
        "message_id": str(msg.get("Message-ID", "")),
        "body": _text_of(msg),
    }


class ImapClient:
    def __init__(self, host, user, password, mailbox="INBOX", port=993):
        self.host, self.user, self.password, self.mailbox, self.port = host, user, password, mailbox, port
        self.m = None

    def connect(self):
        self.close()
        self.m = imaplib.IMAP4_SSL(self.host, self.port, timeout=60)
        self.m.login(self.user, self.password)
        typ, data = self.m.select(f'"{self.mailbox}"', readonly=True)
        if typ != "OK":
            raise imaplib.IMAP4.error(f"cannot select {self.mailbox}: {data}")

    def close(self):
        if self.m is not None:
            try:
                self.m.logout()
            except Exception:
                pass
            self.m = None

    def uidvalidity(self):
        typ, data = self.m.response("UIDVALIDITY")
        if not data or data[0] is None:
            self.m.select(f'"{self.mailbox}"', readonly=True)
            typ, data = self.m.response("UIDVALIDITY")
        return int(data[0])

    def max_uid(self):
        typ, data = self.m.uid("SEARCH", None, "ALL")
        uids = data[0].split() if data and data[0] else []
        return int(uids[-1]) if uids else 0

    def fetch_since(self, last_uid):
        typ, data = self.m.uid("FETCH", f"{last_uid + 1}:*", "(UID BODY.PEEK[])")
        out = []
        for item in data:
            if isinstance(item, tuple):
                m = re.search(rb"UID (\d+)", item[0])
                uid = int(m.group(1)) if m else None
                if uid is not None and uid > last_uid:  # "n:*" always returns the last msg, even if old
                    out.append(parse_message(uid, item[1]))
        return sorted(out, key=lambda x: x["uid"])

    def idle(self, timeout):
        """Block until the server says something (new mail) or `timeout` seconds pass. True if woken by the server.
        Re-issue every few minutes: servers drop idle connections after ~10-30 min."""
        m = self.m
        tag = m._new_tag()
        m.send(tag + b" IDLE\r\n")
        if not m.readline().startswith(b"+"):
            raise imaplib.IMAP4.error("server refused IDLE")
        woken = False
        try:
            sock = m.sock
            readable = (hasattr(sock, "pending") and sock.pending() > 0) or select.select([sock], [], [], timeout)[0]
            if readable:
                line = m.readline()
                woken = b"EXISTS" in line or b"RECENT" in line
        finally:
            m.send(b"DONE\r\n")
            while True:  # drain until the tagged completion
                line = m.readline()
                if line.startswith(tag) or not line:
                    break
        return woken

import json
from types import SimpleNamespace


class FakeClient:
    """Stands in for anthropic.Anthropic(). Replies with queued texts (dicts are JSON-encoded)."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        text = r if isinstance(r, str) else json.dumps(r)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


class FakeNotifier:
    def __init__(self, replies=()):
        self.sent = []
        self.replies = list(replies)

    def send(self, text, buttons=None):
        self.sent.append((text, buttons))
        return str(len(self.sent))

    def poll_replies(self):
        out, self.replies = self.replies, []
        return out


PROFILE = {
    "name": "Asha Rao",
    "title_keywords": ["engineer"],
    "skills": ["python"],
    "locations": ["Remote"],
    "deal_breakers": [],
    "blocklist": [],
    "facts": [
        {"id": "f1", "text": "Built a Python ETL pipeline at Acme that cut nightly runtime from 6 hours to 45 minutes."},
        {"id": "f2", "text": "Led a team of 4 engineers shipping a React dashboard."},
    ],
    "contact": {"first_name": "Asha", "last_name": "Rao", "email": "asha@example.com", "phone": "555-0100"},
    "resume_path": __file__,  # any real file works for upload tests
    "answers": {"authorized to work": "Yes", "salary": "Negotiable"},
}


def seed_job(conn, source="acme", job_id="1", score=90, title="Backend Engineer"):
    conn.execute("INSERT INTO jobs (source, job_id, title, url) VALUES (?, ?, ?, ?)",
                 (source, job_id, title, f"https://example.com/{source}/{job_id}"))
    conn.execute("INSERT INTO scores (source, job_id, score, reason, stage, model, created_at) VALUES (?,?,?,?,?,?,?)",
                 (source, job_id, score, "good match", "llm", "m", 1))

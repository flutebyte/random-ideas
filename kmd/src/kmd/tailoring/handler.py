import json

from kmd.events import bus
from kmd.tailoring import factcheck
from kmd.tailoring.llm import tailor


def _job(conn, source, job_id):
    row = conn.execute(
        "SELECT j.title, j.url, d.location, d.description FROM jobs j "
        "LEFT JOIN job_details d ON d.source=j.source AND d.job_id=j.job_id WHERE j.source=? AND j.job_id=?",
        (source, job_id),
    ).fetchone()
    if row is None:
        raise LookupError(f"job {source}/{job_id} not in jobs table")
    job = dict(row)
    job["company"] = source
    return job


def run_tailor(client, job, profile, model):
    """Tailor, fact-check, and on failure retry once with the problems fed back.
    Returns (bullets, letter, problems)."""
    allowed = [job.get("title") or "", job.get("company") or "", profile.get("name") or ""]
    allowed_terms = {w.lower() for s in allowed for w in s.replace("-", " ").split()}
    bullets, letter = tailor(client, job, profile, model)
    problems = factcheck.check(bullets + letter, profile["facts"], allowed_terms)
    if problems:
        bullets, letter = tailor(client, job, profile, model, problems)
        problems = factcheck.check(bullets + letter, profile["facts"], allowed_terms)
    return bullets, letter, problems


def handle_tailor(conn, event, client, profile, model, now, fill_enabled=False):
    # event_key: "tailor:<source>:<job_id>"
    _, source, job_id = event["event_key"].split(":", 2)
    job = _job(conn, source, job_id)
    bullets, letter, problems = run_tailor(client, job, profile, model)
    status = "factcheck_failed" if problems else "tailored"
    conn.execute(
        "INSERT OR REPLACE INTO applications (source, job_id, bullets, cover_letter, factcheck, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (source, job_id, json.dumps(bullets), json.dumps(letter), json.dumps(problems), status, now),
    )
    if status == "tailored":
        bus.publish(conn, f"fill:{source}:{job_id}", "app.fill" if fill_enabled else "app.notify", None)

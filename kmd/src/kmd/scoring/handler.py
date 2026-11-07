from kmd.events import bus
from kmd.scoring.llm import score_job
from kmd.scoring.prefilter import prefilter

DAY = 86400


def _llm_calls_today(conn, now):
    return conn.execute(
        "SELECT COUNT(*) FROM scores WHERE stage='llm' AND created_at > ?", (now - DAY,)
    ).fetchone()[0]


def _save(conn, source, job_id, score, reason, stage, model, now):
    conn.execute(
        "INSERT OR REPLACE INTO scores (source, job_id, score, reason, stage, model, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (source, job_id, score, reason, stage, model, now),
    )


def _get_detail(conn, source, job_id, detail_fetch):
    """Cached in job_details so a retry after an AI failure doesn't refetch. None = job is gone."""
    row = conn.execute(
        "SELECT location, description FROM job_details WHERE source=? AND job_id=?", (source, job_id)
    ).fetchone()
    if row:
        return dict(row)
    detail = detail_fetch(source, job_id)
    if detail is not None:
        conn.execute(
            "INSERT OR REPLACE INTO job_details (source, job_id, location, description) VALUES (?, ?, ?, ?)",
            (source, job_id, detail["location"], detail["description"]),
        )
    return detail


def handle_job_new(conn, event, client, profile, model, now, detail_fetch=None, tailor_threshold=None):
    # event_key looks like "gh:<board>:<job_id>"
    _, source, job_id = event["event_key"].split(":", 2)
    row = conn.execute(
        "SELECT title, url FROM jobs WHERE source=? AND job_id=?", (source, job_id)
    ).fetchone()
    if row is None:
        raise LookupError(f"job {source}/{job_id} not in jobs table")
    job = dict(row)

    ok, why = prefilter(job, profile)
    if not ok:
        _save(conn, source, job_id, 0, why, "filtered", None, now)
        return
    # only jobs that passed the free filter are worth a detail fetch
    if detail_fetch is not None:
        detail = _get_detail(conn, source, job_id, detail_fetch)
        if detail is None:
            _save(conn, source, job_id, 0, "job no longer available", "filtered", None, now)
            return
        job.update(detail)
    score, reason = score_job(client, job, profile, model)
    _save(conn, source, job_id, score, reason, "llm", model, now)
    if tailor_threshold is not None and score >= tailor_threshold:
        bus.publish(conn, f"tailor:{source}:{job_id}", "job.tailor", None)


def process_one(conn, now, client, profile, model, daily_cap=200, detail_fetch=None, tailor_threshold=None):
    """Take one job.new event and score it. Returns 'idle', 'budget', 'done' or 'failed'."""
    # check the budget BEFORE claiming, so hitting the cap doesn't burn retry attempts
    if _llm_calls_today(conn, now) >= daily_cap:
        return "budget"
    event = bus.claim(conn, now, event_type="job.new")
    if event is None:
        return "idle"
    try:
        handle_job_new(conn, event, client, profile, model, now, detail_fetch, tailor_threshold)
    except Exception:
        bus.fail(conn, event["id"])
        return "failed"
    bus.ack(conn, event["id"])
    return "done"


def drain(conn, now, client, profile, model, daily_cap=200, detail_fetch=None, tailor_threshold=None):
    """Process events until none are ready or the daily budget is hit."""
    counts = {"done": 0, "failed": 0}
    while True:
        r = process_one(conn, now, client, profile, model, daily_cap, detail_fetch, tailor_threshold)
        if r in ("idle", "budget"):
            return {**counts, "stopped": r}
        counts[r] += 1

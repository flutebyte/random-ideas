"""Autonomy gate. Auto-submit only if EVERY condition holds; otherwise a human approves.
Returns the list of failed conditions so the Telegram message can say why a human is needed."""
import json

SUPPORTED_ATS = {"greenhouse", "lever", "ashby"}
DAY = 86400


def submitted_today(conn, now):
    return conn.execute(
        "SELECT COUNT(*) FROM applications WHERE status='submitted' AND submitted_at > ?", (now - DAY,)
    ).fetchone()[0]


def evaluate(conn, source, job_id, cfg, profile, now, ats="greenhouse", unanswered=()):
    """Returns a list of reasons auto-submit is NOT allowed ([] = allowed)."""
    fails = []
    if not cfg.get("auto_submit"):
        fails.append("auto_submit is off")
    sc = conn.execute("SELECT score FROM scores WHERE source=? AND job_id=?", (source, job_id)).fetchone()
    if sc is None or sc["score"] < cfg.get("auto_submit_min_score", 85):
        fails.append(f"score {sc['score'] if sc else 'n/a'} below {cfg.get('auto_submit_min_score', 85)}")
    if ats not in SUPPORTED_ATS:
        fails.append(f"ATS {ats!r} not supported")
    if unanswered:
        fails.append(f"questions need a human: {', '.join(unanswered)}")
    blocklist = {b.lower() for b in profile.get("blocklist", [])}
    if source.lower() in blocklist:
        fails.append(f"company {source!r} is blocklisted")
    if submitted_today(conn, now) >= cfg.get("daily_submit_cap", 5):
        fails.append("daily submit cap reached")
    app = conn.execute(
        "SELECT status, factcheck FROM applications WHERE source=? AND job_id=?", (source, job_id)
    ).fetchone()
    if app is None:
        fails.append("no application row")
    else:
        if json.loads(app["factcheck"] or "null") != []:
            fails.append("fact-check did not pass")
        if app["status"] not in ("filled", "approved"):
            fails.append(f"application status is {app['status']!r}, not filled")
    return fails

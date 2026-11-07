from kmd.events import bus


def poll_board(conn, board, fetch, now):
    state = conn.execute("SELECT * FROM poller_state WHERE source = ?", (board,)).fetchone()
    etag = state["etag"] if state else None
    baselined = bool(state and state["baselined"])
    failures = state["failures"] if state else 0

    # still backing off from an earlier 429: don't even ask
    if state and now < state["backoff_until"]:
        return 0

    status, new_etag, jobs = fetch(board, etag)

    if status == 304:  # nothing changed since our saved ETag
        return 0

    if status != 200:  # 429 or any other error: wait longer each time (120s, 240s, ...)
        failures += 1
        conn.execute(
            "INSERT INTO poller_state (source, failures, backoff_until) VALUES (?, ?, ?) "
            "ON CONFLICT(source) DO UPDATE SET failures = excluded.failures, backoff_until = excluded.backoff_until",
            (board, failures, now + 60 * 2**failures),
        )
        return 0

    published = 0
    for j in jobs:
        job_id = str(j["id"])
        cur = conn.execute(
            "INSERT OR IGNORE INTO jobs (source, job_id, title, url) VALUES (?, ?, ?, ?)",
            (board, job_id, j["title"], j["url"]),
        )
        is_new = cur.rowcount == 1
        # the first poll is a baseline: remember jobs but don't announce them
        if is_new and baselined:
            if bus.publish(conn, f"gh:{board}:{job_id}", "job.new", job_id):
                published += 1

    conn.execute(
        "INSERT INTO poller_state (source, etag, baselined, failures, backoff_until) VALUES (?, ?, 1, 0, 0) "
        "ON CONFLICT(source) DO UPDATE SET etag = excluded.etag, baselined = 1, failures = 0, backoff_until = 0",
        (board, new_etag),
    )
    return published

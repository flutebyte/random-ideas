def publish(conn,key,type,payload):
    cur = conn.execute("INSERT OR IGNORE INTO events (event_key, event_type, payload) VALUES (?,?,?)", (key, type,payload),)
    return cur.rowcount==1

def ack(conn, event_id):
    conn.execute("UPDATE events SET status ='done' WHERE id=?",(event_id,))

def claim(conn, now, lease_secs=60, event_type=None):
    conn.execute("BEGIN IMMEDIATE")  # take the write lock before looking, so no one else can grab the same row
    try:
        row = conn.execute(
            "SELECT * FROM events WHERE status='pending' AND (lease_until IS NULL OR lease_until <= ?) "
            "AND (? IS NULL OR event_type = ?) LIMIT 1",
            (now, event_type, event_type),
        ).fetchone()
        if row is None:
            conn.execute("COMMIT")
            return None
        conn.execute(
            "UPDATE events SET lease_until = ? WHERE id = ?",
            (now + lease_secs, row["id"]),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return dict(row)

def fail(conn, event_id, max_attempts =3):
    conn.execute("UPDATE events SET attempts = attempts + 1 WHERE id=?",(event_id,))
    attempts = conn.execute("SELECT attempts FROM events WHERE id=?", (event_id,)).fetchone()[0]
    if attempts >= max_attempts:
        conn.execute("UPDATE events SET status='failed' WHERE id=?", (event_id,))
    else:
        conn.execute("UPDATE events SET lease_until=NULL WHERE id=?", (event_id,))

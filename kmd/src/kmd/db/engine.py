import sqlite3
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql")


def connect(path: str | Path = "data/kmd.db") -> sqlite3.Connection:
    """Open the DB with WAL + busy timeout and make sure the schema exists."""
    conn = sqlite3.connect(path, timeout=5, isolation_level=None)  # autocommit; we use explicit BEGIN
    conn.row_factory = sqlite3.Row
    # switching to WAL needs an exclusive lock, so only do it when the file isn't WAL yet
    if conn.execute("PRAGMA journal_mode").fetchone()[0] != "wal":
        conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA.read_text())
    return conn

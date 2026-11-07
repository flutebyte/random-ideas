"""python -m kmd run        poll job boards + score new jobs, forever (Ctrl+C to stop)
python -m kmd top [N]      show the best-scoring jobs found so far (default min score 70)
python -m kmd status       applications by stage, event queue, pending approvals
python -m kmd pending      list approvals waiting for you (no Telegram needed)
python -m kmd approve|reject ID   decide one; the running agent picks it up within seconds
python -m kmd dashboard [port]  read-only kanban page on http://127.0.0.1:8765
"""
import argparse
import asyncio
import logging
import os
from pathlib import Path

from kmd.config import load_config
from kmd.db.engine import connect
from kmd.profile import load_profile


def acquire_lock(path):
    """Single-instance guard: hold an OS file lock for the life of the process. None if already held."""
    f = open(path, "a+")
    try:
        if os.name == "nt":
            import msvcrt

            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def cmd_run(cfg):
    import anthropic

    from kmd.app import run_all

    if not cfg["boards"]:
        raise SystemExit('No boards configured. Add them to config.json, e.g. {"boards": ["stripe"]}')
    profile = load_profile(cfg["profile_path"])
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY (or an `ant auth login` profile)
    Path(cfg["db_path"]).parent.mkdir(parents=True, exist_ok=True)
    # pythonw has no stderr, so log to a file
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s",
                        filename=Path(cfg["db_path"]).parent / "kmd.log")
    lock = acquire_lock(Path(cfg["db_path"]).parent / "kmd.lock")
    if lock is None:
        raise SystemExit("another kmd instance is already running")
    try:
        asyncio.run(run_all(cfg, profile, client))
    except KeyboardInterrupt:
        logging.info("stopped")


def cmd_top(cfg, min_score):
    from kmd.app import top_jobs

    conn = connect(cfg["db_path"])
    rows = top_jobs(conn, min_score)
    if not rows:
        print(f"No jobs scored {min_score}+ yet.")
    for r in rows:
        print(f"{r['score']:3d}  {r['title']}\n     {r['url']}\n     {r['reason']}\n")


def cmd_status(cfg):
    import json

    from kmd.app import status

    print(json.dumps(status(connect(cfg["db_path"])), indent=2))


def cmd_pending(cfg):
    conn = connect(cfg["db_path"])
    rows = conn.execute("SELECT id, kind, ref, created_at FROM approvals WHERE status='pending' ORDER BY id").fetchall()
    if not rows:
        print("Nothing waiting for you.")
    for r in rows:
        print(f"#{r['id']}  {r['kind']}  {r['ref']}")
        app = conn.execute("SELECT url, title FROM jobs WHERE source||':'||job_id = ?", (r["ref"],)).fetchone()
        if app:
            print(f"     {app['title']}")
            print(f"     {app['url']}")


def cmd_decide(cfg, approval_id, approve):
    from kmd.notify.base import queue_cli_decision

    ok = queue_cli_decision(connect(cfg["db_path"]), approval_id, approve)
    print(("Queued." if ok else "No such pending approval.") + (" The running agent will apply it shortly." if ok else ""))


def main():
    ap = argparse.ArgumentParser(prog="kmd")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run")
    top = sub.add_parser("top")
    top.add_argument("min_score", nargs="?", type=int, default=70)
    sub.add_parser("status")
    sub.add_parser("pending")
    for name in ("approve", "reject"):
        sub.add_parser(name).add_argument("id", type=int)
    dash = sub.add_parser("dashboard")
    dash.add_argument("port", nargs="?", type=int, default=8765)
    args = ap.parse_args()
    cfg = load_config()
    if args.cmd == "run":
        cmd_run(cfg)
    elif args.cmd == "pending":
        cmd_pending(cfg)
    elif args.cmd in ("approve", "reject"):
        cmd_decide(cfg, args.id, args.cmd == "approve")
    elif args.cmd == "status":
        cmd_status(cfg)
    elif args.cmd == "dashboard":
        from kmd.dashboard import serve

        connect(cfg["db_path"]).close()
        serve(cfg["db_path"], args.port)
    else:
        cmd_top(cfg, args.min_score)


if __name__ == "__main__":
    main()

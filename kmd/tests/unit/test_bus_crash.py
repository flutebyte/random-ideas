"""A worker is killed hard (the Windows equivalent of kill -9) mid-task.
The task must not be lost, and must come back once the lease expires."""
import subprocess
import sys
import time

from kmd.events import bus

WORKER = """
import sys, time
from kmd.db.engine import connect
from kmd.events import bus

conn = connect(sys.argv[1])
ev = bus.claim(conn, now=int(sys.argv[2]), lease_secs=60)
print("claimed", ev["event_key"], flush=True)
time.sleep(600)  # "working" forever; the parent kills us before we ack
"""


def test_killed_worker_task_comes_back_after_lease(conn, tmp_path):
    db_path = tmp_path / "crash.db"
    from kmd.db.engine import connect
    c = connect(db_path)
    bus.publish(c, "k1", "job.new", "p")

    now = int(time.time())
    proc = subprocess.Popen(
        [sys.executable, "-c", WORKER, str(db_path), str(now)],
        stdout=subprocess.PIPE, text=True,
    )
    assert proc.stdout.readline().strip() == "claimed k1"
    proc.kill()  # TerminateProcess on Windows, SIGKILL on Linux: no cleanup runs
    proc.wait()

    # lease still held by the dead worker, so nobody else gets it yet
    assert bus.claim(c, now=now + 1) is None

    # lease expired: the task is handed out again, nothing was lost
    ev = bus.claim(c, now=now + 61)
    assert ev is not None and ev["event_key"] == "k1"
    c.close()

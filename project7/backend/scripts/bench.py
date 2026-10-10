"""Generate a large synthetic CSV and time the pipeline end to end (demo mode).

    python scripts/bench.py 10000000          # ~10M rows, roughly 1 GB
"""

import asyncio
import shutil
import sys
import time
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from llm import LLM  # noqa: E402
from pipeline import run_pipeline  # noqa: E402

rows = int(sys.argv[1]) if len(sys.argv) > 1 else 10_000_000
root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "data" / "bench"
shutil.rmtree(root, ignore_errors=True)
root.mkdir(parents=True)
csv = root / "upload.csv"

t0 = time.time()
con = duckdb.connect()
con.execute(f"""
    COPY (
      SELECT i AS order_id,
             TIMESTAMP '2021-01-01' + INTERVAL (CAST(random() * 1095 * 86400 AS BIGINT)) SECOND AS order_time,
             (['North','South','East','West','Central'])[1 + CAST(floor(random() * 5) AS INTEGER)] AS region,
             'product_' || CAST(floor(random() * 40) AS INTEGER) AS product,
             CAST(1 + floor(random() * 20) AS INTEGER) AS units,
             round(random() * 40, 2) AS discount_pct,
             round((1 + floor(random() * 20)) * 12.5 + random() * 30 + CASE WHEN i % 100003 = 0 THEN 9000 ELSE 0 END, 2) AS revenue,
             'customer_' || CAST(floor(random() * 500000) AS INTEGER) || '@example.com' AS customer_email,
             (['web','store','phone'])[1 + CAST(floor(random() * 3) AS INTEGER)] AS channel,
             round(random() * 5, 1) AS rating
      FROM range(1, {rows + 1}) t(i)
    ) TO '{csv.as_posix()}' (HEADER, DELIMITER ',')
""")
con.close()
print(f"generated {rows:,} rows, {csv.stat().st_size / 1e6:,.0f} MB in {time.time() - t0:.0f}s")


async def main():
    llm = LLM()
    llm.enabled = False
    start = time.time()
    first_finding = None
    async for e in run_pipeline(root, csv, False, llm):
        t = time.time() - start
        if e["event"] == "finding" and first_finding is None:
            first_finding = t
        label = e.get("message") or e.get("title") or e.get("reason") or ""
        print(f"{t:7.1f}s  {e['event']:<16} {label}")
    print(f"\nfirst finding at {first_finding:.1f}s, total {time.time() - start:.1f}s")


asyncio.run(main())

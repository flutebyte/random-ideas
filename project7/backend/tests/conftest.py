import sys
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def sample_csv(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("csv") / "sales.csv"
    con = duckdb.connect()
    con.execute("SELECT setseed(0.42)")
    con.execute(f"""
        COPY (
          WITH base AS (
            SELECT i AS order_id,
                   DATE '2023-01-01' + CAST(floor(random() * 730) AS INTEGER) AS order_date,
                   CASE WHEN random() < 0.6 THEN 'North' WHEN random() < 0.8 THEN 'South'
                        WHEN random() < 0.95 THEN 'East' ELSE 'West' END AS region,
                   'P' || CAST(floor(random() * 10) AS INTEGER) AS product,
                   CAST(1 + floor(random() * 20) AS INTEGER) AS units,
                   random() * 30 AS discount
            FROM range(1, 30001) t(i))
          SELECT order_id, order_date, region, product, units, discount,
                 round(units * 12.5 + random() * 20 + CASE WHEN order_id % 997 = 0 THEN 5000 ELSE 0 END, 2) AS revenue,
                 'user' || order_id || '@example.com' AS customer_email,
                 'USD' AS currency
          FROM base
        ) TO '{path.as_posix()}' (HEADER, DELIMITER ',')
    """)
    con.close()
    return path


@pytest.fixture()
def dataset(sample_csv, tmp_path):
    import profiler
    con = profiler.open_dataset(sample_csv, tmp_path)
    profile = profiler.build_profile(con, include_samples=True)
    yield con, profile
    con.close()

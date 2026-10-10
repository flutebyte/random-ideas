# DataLens

Upload a CSV. DataLens works out what is worth looking at, computes it exactly, and explains it in plain English,
revealed step by step. See [SPEC.md](SPEC.md) for the design and decisions.

## Run locally

```bash
# backend
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # Linux/Mac: .venv/bin/pip
cp .env.example .env            # add ANTHROPIC_API_KEY, or leave empty for demo mode
.venv/Scripts/python -m uvicorn main:app --port 8000

# frontend (dev server with proxy on :5173, or `npm run build` and let FastAPI serve it on :8000)
cd frontend && npm install && npm run dev
```

## Test

```bash
cd backend && .venv/Scripts/python -m pytest          # 32 tests
.venv/Scripts/python scripts/bench.py 10000000        # generate ~1 GB CSV and time the pipeline
```

## Deploy

```bash
docker build -t datalens .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -v datalens-data:/data datalens
```

Give the container at least 2 GB RAM and enough disk for about 3x your largest upload (CSV plus DuckDB table plus spill).
Put it behind a proxy that allows large request bodies and long-lived responses (SSE), and set `TRUST_PROXY=1`.

## How it stays honest

The model never computes anything. It picks from six analysis types; every number comes from SQL in
`backend/analyses.py`, and the model's plan is validated against the real columns before anything runs.

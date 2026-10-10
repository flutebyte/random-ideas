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

## How it compares

Positioning against the tools people reach for today (summarised from their public feature sets, not benchmarked head to head):

| | DataLens | ChatGPT data analysis / Julius-style chat tools | ydata-profiling / Sweetviz | BI copilots (Power BI, Tableau) |
|---|---|---|---|---|
| Starts with | Upload, it decides what matters | You must know what to ask | Automatic report | A built dashboard and a licence |
| Who computes the numbers | SQL on the full file | Model-written code (can be wrong or skipped) | Code | Engine |
| Model can misquote a number | No: every figure in the text is checked against the result, else replaced | Yes, nothing checks it | n/a (no prose) | Yes |
| Plain-English "so what" | Yes | Yes | No, raw stats | Partial |
| Files around 1 GB | DuckDB, streamed | Typically small upload limits | Struggles (pandas, in memory) | Needs modelling first |
| Audience | Non-technical staff | Anyone who can prompt | Data scientists | Analysts |

What is new here is the **number check** (`backend/verify.py`): the AI's wording is only shown if every figure in it traces to the SQL result, which none of the chat-style tools guarantee. Trade-off: DataLens answers a fixed menu of six analysis types and has no free-form questions yet.

## Ask your own question

After the analysis, type a question ("Does salary differ by department?"). Claude only maps it to one of the six analyses
(in demo mode, keyword matching on column names does this), then the same validated, SQL-computed, number-checked pipeline
answers it. Questions that none of the six can answer are declined with a suggestion instead of guessed at.
To make this possible the analyzed file is kept for `SESSION_TTL_SECONDS` (default 15 min), up to `MAX_QUESTIONS` (15) per file,
and deleted when it expires, when the user clicks "Analyze another file", or when the server stops.

## How it stays honest

The model never computes anything. It picks from six analysis types; every number comes from SQL in
`backend/analyses.py`, and the model's plan is validated against the real columns before anything runs.

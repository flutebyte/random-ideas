# DataLens: spec

Upload a CSV, get plain-English findings with charts. Built for non-technical staff at companies with large files.

Written with `/spec`. The interview was cut short at the user's request ("build on your own first"), so every
decision below marks an **assumed default** the user can overturn.

## Pipeline

| # | Step | Who does it | Where |
|---|------|-------------|-------|
| 0 | Preview + user notes: show example values per column; user says what the file is about and what cryptic columns (a, b, g) mean | DuckDB (first rows only, ~0.3 s on 300 MB) | `backend/profiler.py`, `frontend/src/components/ColumnReview.jsx` |
| 1 | Load + profile (types, missing %, distinct counts, ranges, date/category detection, top correlations) | DuckDB, no AI | `backend/profiler.py` |
| 2 | Choose which analyses are worth running | Claude, structured JSON from a fixed menu | `backend/llm.py`, validated in `backend/analyses.py` |
| 3 | Run the analyses, produce chart data | DuckDB SQL, deterministic | `backend/analyses.py` |
| 4 | Explain each result in plain language | Claude (template fallback) | `backend/llm.py` |
| 5 | Reveal step by step | SSE stream to React | `backend/pipeline.py`, `backend/main.py`, `frontend/src` |

Menu: `correlation`, `trend`, `outliers`, `imbalance`, `distribution`, `group_compare`.

## Decisions (assumed defaults)

| Decision | Choice | Why |
|---|---|---|
| Audience | Non-technical company staff | User's stated answer |
| Max file size | 1 GB, streamed to disk, deleted after analysis | "Large file"; hostable |
| Engine | DuckDB, not pandas | pandas needs roughly 3-10x file size in RAM; DuckDB works from disk |
| LLM | Claude, `claude-opus-5` by default (`ANTHROPIC_MODEL` to change) | User said Claude |
| Privacy | Required consent checkbox, enforced server-side. Optional "5 example rows" toggle, off by default. Id and free-text columns are never sent. | User: "we'll give it in terms and conditions" |
| Hosting | Single Docker container: FastAPI serves the built React app | User: hosted |
| Storage | None. No accounts, no history | Out of scope |
| Spec filing | Local only | The only git remote is public |

## Acceptance criteria and results

| # | Criterion | Result |
|---|---|---|
| 1 | 965 MB / 10M-row CSV: first finding in under 30 s | **23 s**, all 5 findings and explanations by 25 s (demo mode, local machine, `backend/scripts/bench.py`) |
| 2 | LLM output can never cause an invalid query | Plan is validated (types, column existence, kinds); column names are quoted; 9 rejection cases tested |
| 3 | Bad or empty file gives a friendly error, not a crash | Tested (empty, binary, wrong extension, oversize) |
| 4 | Uploads leave nothing on disk after success, failure, or disconnect | Tested for success and rejected uploads; a sweeper deletes anything older than 1 h |
| 5 | Works without an API key (demo mode) | Yes, and the UI says so |
| 6 | Findings appear one by one with a chart and an explanation | Verified in a real browser |
| 8 | Cryptic headers (a, b, g): user can explain them; meanings appear in titles, chips and explanations; unexplained ones are inferred by Claude from values and flagged as guesses | Meanings flow tested end to end; the inference itself is a prompt instruction and is **not verified with the real model** |
| 7 | AI fails, so the app still completes | Tested: planner falls back to rules, explainer falls back to templates |

## Out of scope

Excel/JSON input, multi-file joins, accounts and saved history, follow-up chat, PDF export, files over 1 GB,
authentication, non-English UI.

## Known limits (honest list)

- **Not yet run against the real Claude API** (no key in this environment). The request shape, structured-output
  schema, parsing, and failure fallbacks are tested against a mocked HTTP transport. Run once with a key before demoing.
- **Not deployed.** The Dockerfile is written but not built here.
- `distinct` counts are approximate (HyperLogLog, up to about 15% off at high cardinality). Only ID/text labelling is affected.
- Correlation is Pearson only, so it can understate non-linear relationships and is sensitive to outliers.
- Rows DuckDB cannot parse are skipped (and reported when DuckDB records them).
- Rate limiting is in-memory per process, so it resets on restart and is per-instance.
- Only one analysis engine process is assumed (the `started` set and rate limiter are in-process).

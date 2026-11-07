# kmd: job-hunt agent

Pipeline: Greenhouse boards -> `job.new` -> score (cheap model) -> `job.tailor` (strong model + deterministic fact-check)
-> `app.fill` (Playwright fills the form, stops) -> Telegram "approve?" -> `app.submit`.
Mail: IMAP -> `email.received` -> prefilter -> classify -> drafts / tracker updates (never sends mail).

## Setup
1. `pip install -e ".[dev,browser]"` then `playwright install chromium`
2. Copy `profile.example.json` to `profile.json` and fill it in. Every claim in tailored text must trace to a `facts` entry.
3. `config.json`, e.g. `{"boards": ["stripe", "airbnb"]}` (other keys: see `src/kmd/config.py`).
4. User environment variables (never put these in files): `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
   `KMD_IMAP_USER`, `KMD_IMAP_PASSWORD` (Gmail app password). Telegram / IMAP are optional; without them it logs instead.
5. `python -m kmd run`, or `powershell -File scripts\install_task.ps1` to start at logon with auto-restart.

## Commands
`python -m kmd run | top [N] | status | pending | approve ID | reject ID | dashboard [port]`.
Without Telegram, use `pending` / `approve` / `reject` from a second terminal; the running agent applies them within seconds. Logs and lock live in `data/`.

## Safety defaults
- `auto_submit` is **off**. Even when on it requires: score >= 85, supported ATS, no unanswered questions, not blocklisted,
  under the daily cap (5), fact-check passed (`src/kmd/gate/gate.py`).
- A submit with no detected confirmation page is marked `error` and never retried (check the screenshot, then apply by hand).
- Submit is idempotent and refuses to click if a required field is unanswered. Email replies are drafts only.
- Resume: the tailored bullets are shown in the approval message; the file uploaded is `resume_path` as-is.

## Tests
`python -m pytest` (no network or API key needed; browser tests skip if chromium is missing).

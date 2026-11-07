import json
from pathlib import Path

DEFAULTS = {
    "boards": [],
    "interval_minutes": 20,
    "db_path": "data/kmd.db",
    "profile_path": "profile.json",
    "scoring_model": "claude-haiku-5-5",  # the plan says "cheap model" for scoring
    "daily_cap": 200,                      # max AI scoring calls per 24h
    "score_interval_secs": 30,
    # tailoring
    "tailor_threshold": 70,                # score at/above which we tailor materials
    "tailor_model": "claude-sonnet-5-5",   # the plan says "strong model" for tailoring
    "worker_interval_secs": 15,
    # form filling (needs profile "contact" + "resume_path")
    "fill_forms": True,
    "headless": True,
    "screenshot_dir": "data/screenshots",
    # autonomy gate: auto_submit stays OFF until you turn it on
    "auto_submit": False,
    "auto_submit_min_score": 85,
    "daily_submit_cap": 5,
    # email (credentials come from env: KMD_IMAP_USER / KMD_IMAP_PASSWORD)
    "imap_host": "imap.gmail.com",
    "imap_mailbox": "INBOX",
    "imap_poll_secs": 120,
    "email_model": "claude-haiku-5-5",
    # notifier (env: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
    "notifier": "auto",                    # "auto" = telegram if env set, else log only
}


def load_config(path: str | Path = "config.json") -> dict:
    """Read config.json; missing file or missing keys fall back to DEFAULTS."""
    cfg = dict(DEFAULTS)
    p = Path(path)
    if p.exists():
        cfg.update(json.loads(p.read_text()))
    return cfg

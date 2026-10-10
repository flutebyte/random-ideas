import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

DUCKDB_MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "1GB")
DUCKDB_THREADS = int(os.environ.get("DUCKDB_THREADS", "2"))

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

MAX_CONCURRENT_ANALYSES = int(os.environ.get("MAX_CONCURRENT_ANALYSES", "2"))
UPLOADS_PER_HOUR = int(os.environ.get("UPLOADS_PER_HOUR", "10"))
DATASET_TTL_SECONDS = int(os.environ.get("DATASET_TTL_SECONDS", "3600"))
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "900"))
MAX_QUESTIONS = int(os.environ.get("MAX_QUESTIONS", "15"))
TRUST_PROXY = os.environ.get("TRUST_PROXY", "0") == "1"

MAX_FINDINGS = 5
MIN_FINDINGS = 3
KEEPALIVE_SECONDS = 15

import asyncio
import json
import logging
import shutil
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import config
from ask import MAX_QUESTION_CHARS, answer_question
from llm import LLM
from pipeline import run_pipeline
from profiler import DatasetError, preview_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

llm = LLM()
slots = asyncio.Semaphore(config.MAX_CONCURRENT_ANALYSES)
started: set[str] = set()
_uploads: dict[str, deque] = defaultdict(deque)
sessions: dict[str, dict] = {}  # dataset_id -> kept dataset for follow-up questions (expires, then deleted)
notes: dict[str, dict] = {}  # dataset_id -> {"context": str, "labels": {column: meaning}}


def _client_ip(request: Request) -> str:
    if config.TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(request: Request) -> None:
    ip, now, window = _client_ip(request), time.monotonic(), _uploads[_client_ip(request)]
    while window and now - window[0] > 3600:
        window.popleft()
    if len(window) >= config.UPLOADS_PER_HOUR:
        retry = int(3600 - (now - window[0])) + 1
        raise HTTPException(429, f"Upload limit reached. Please try again in {retry // 60 + 1} minutes.",
                            headers={"Retry-After": str(retry)})
    window.append(now)


def _close_session(dataset_id: str) -> None:
    sess = sessions.pop(dataset_id, None)
    if sess:
        try:
            sess["con"].close()
        except Exception:
            pass
        shutil.rmtree(sess["work_dir"], ignore_errors=True)


async def _sweeper() -> None:
    """Delete abandoned uploads so a hosted disk never fills up."""
    while True:
        await asyncio.sleep(600)
        for dataset_id in [k for k, v in sessions.items() if v["expires"] < time.monotonic()]:
            _close_session(dataset_id)
        cutoff = time.time() - config.DATASET_TTL_SECONDS
        for d in config.DATA_DIR.glob("*"):
            try:
                if d.is_dir() and d.stat().st_mtime < cutoff and d.name not in started and d.name not in sessions:
                    shutil.rmtree(d, ignore_errors=True)
            except OSError:
                pass
        for dataset_id in [k for k in notes if not (config.DATA_DIR / k).exists()]:
            notes.pop(dataset_id, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    shutil.rmtree(config.DATA_DIR, ignore_errors=True)
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not llm.enabled:
        log.warning("ANTHROPIC_API_KEY not set: running in DEMO mode (rule-based planner, template explanations).")
    task = asyncio.create_task(_sweeper())
    yield
    task.cancel()
    for dataset_id in list(sessions):
        _close_session(dataset_id)


app = FastAPI(title="DataLens API", lifespan=lifespan)


@app.get("/api/health")
async def health():
    return {"status": "ok", "ai": llm.enabled, "model": config.ANTHROPIC_MODEL if llm.enabled else None,
            "max_upload_mb": config.MAX_UPLOAD_MB}


@app.post("/api/upload")
async def upload(request: Request, filename: str = "data.csv"):
    """Raw-body upload: streamed straight to disk, never held in memory."""
    _check_rate_limit(request)
    if not filename.lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(400, "Please upload a .csv file.")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File is too large. The limit is {config.MAX_UPLOAD_MB} MB.")

    dataset_id = uuid.uuid4().hex
    work_dir = config.DATA_DIR / dataset_id
    work_dir.mkdir(parents=True)
    path = work_dir / "upload.csv"
    size = 0
    try:
        with open(path, "wb") as f:
            async for chunk in request.stream():
                size += len(chunk)
                if size > config.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File is too large. The limit is {config.MAX_UPLOAD_MB} MB.")
                f.write(chunk)
        if size == 0:
            raise HTTPException(400, "The file is empty.")
        with open(path, "rb") as f:
            if b"\x00" in f.read(8192):
                raise HTTPException(400, "This doesn't look like a text CSV file.")
    except BaseException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    return {"dataset_id": dataset_id, "size_bytes": size}


def _dataset_path(dataset_id: str):
    csv_path = config.DATA_DIR / dataset_id / "upload.csv"
    if not dataset_id.isalnum() or not csv_path.exists():
        raise HTTPException(404, "This upload has expired. Please upload the file again.")
    return csv_path


@app.get("/api/preview/{dataset_id}")
async def preview(dataset_id: str):
    """First rows and example values per column, so the user can check and explain their columns."""
    csv_path = _dataset_path(dataset_id)
    try:
        return await asyncio.to_thread(preview_dataset, csv_path)
    except DatasetError as e:
        shutil.rmtree(csv_path.parent, ignore_errors=True)
        raise HTTPException(400, str(e))


class Notes(BaseModel):
    context: str = Field(default="", max_length=600)
    labels: dict[str, str] = Field(default_factory=dict)


@app.post("/api/notes/{dataset_id}")
async def save_notes(dataset_id: str, body: Notes):
    """What the file is about and what cryptic columns mean, used by the analysis."""
    _dataset_path(dataset_id)
    labels = {k[:200]: v.strip()[:120] for k, v in list(body.labels.items())[:1000] if v.strip()}
    notes[dataset_id] = {"context": body.context.strip(), "labels": labels}
    return {"ok": True, "described_columns": len(labels)}


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


@app.get("/api/analyze/{dataset_id}")
async def analyze(dataset_id: str, consent: int = 0, samples: int = 0):
    if consent != 1:
        raise HTTPException(400, "You must accept the data-sharing terms before analysis.")
    csv_path = _dataset_path(dataset_id)
    if dataset_id in sessions:
        raise HTTPException(404, "This upload has expired. Please upload the file again.")
    work_dir = csv_path.parent
    if dataset_id in started:
        raise HTTPException(409, "This file is already being analyzed.")
    started.add(dataset_id)
    user_notes = notes.pop(dataset_id, {"context": "", "labels": {}})

    async def stream():
        queue: asyncio.Queue = asyncio.Queue()
        keep: dict = {}

        async def produce():
            try:
                async with slots:
                    async for evt in run_pipeline(work_dir, csv_path, bool(samples), llm, user_notes['context'], user_notes['labels'], keep):
                        await queue.put(evt)
            finally:
                if keep.get("con") is not None:
                    sessions[dataset_id] = {**keep, "expires": time.monotonic() + config.SESSION_TTL_SECONDS}
                await queue.put(None)

        producer = asyncio.create_task(produce())
        try:
            yield _sse({"event": "status", "stage": "queued", "message": "Starting...",
                        "mode": "ai" if llm.enabled else "demo"})
            while True:
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=config.KEEPALIVE_SECONDS)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if evt is None:
                    break
                yield _sse(evt)
        finally:
            producer.cancel()
            started.discard(dataset_id)
            if dataset_id not in sessions:
                shutil.rmtree(work_dir, ignore_errors=True)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=MAX_QUESTION_CHARS)


@app.post("/api/ask/{dataset_id}")
async def ask(dataset_id: str, body: Question):
    """Answer a follow-up question about a file that was just analyzed (kept briefly, then deleted)."""
    sess = sessions.get(dataset_id)
    if sess is None:
        raise HTTPException(404, "This file is no longer available for questions. Please upload it again.")
    if sess["asked"] >= config.MAX_QUESTIONS:
        raise HTTPException(429, "That's the question limit for this file. Please upload it again to keep asking.")
    async with sess["lock"], slots:
        sess["expires"] = time.monotonic() + config.SESSION_TTL_SECONDS
        return await answer_question(llm, sess, body.question)


@app.delete("/api/session/{dataset_id}")
async def end_session(dataset_id: str):
    _close_session(dataset_id)
    return {"ok": True}


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)


if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        target = (config.FRONTEND_DIST / path).resolve()
        if path and target.is_file() and config.FRONTEND_DIST.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(config.FRONTEND_DIST / "index.html")

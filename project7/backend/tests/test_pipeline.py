import asyncio
import json

import pytest
from fastapi.testclient import TestClient

import config
from llm import LLM
from pipeline import run_pipeline


def demo_llm() -> LLM:
    llm = LLM()
    llm.enabled = False
    return llm


async def collect(sample_csv, tmp_path):
    work = tmp_path / "w"
    work.mkdir()
    csv = work / "upload.csv"
    csv.write_bytes(sample_csv.read_bytes())
    return [e async for e in run_pipeline(work, csv, False, demo_llm())], work


def test_pipeline_event_order_and_cleanup(sample_csv, tmp_path):
    events, work = asyncio.run(collect(sample_csv, tmp_path))
    names = [e["event"] for e in events]
    assert names[:3] == ["status", "status", "profile"]
    assert names.index("plan") < names.index("finding") < names.index("explanation")
    assert names[-1] == "done"
    findings = [e for e in events if e["event"] == "finding"]
    exps = {e["id"] for e in events if e["event"] == "explanation"}
    assert len(findings) >= 3 and {f["id"] for f in findings} == exps
    assert next(e for e in events if e["event"] == "plan")["mode"] == "demo"
    assert any(e.get("message", "").startswith("Found ") for e in events)
    assert not work.exists()


def test_pipeline_reports_bad_file(tmp_path):
    work = tmp_path / "w"
    work.mkdir()
    (work / "upload.csv").write_bytes(b"")

    async def go():
        return [e async for e in run_pipeline(work, work / "upload.csv", False, demo_llm())]

    last = asyncio.run(go())[-1]
    assert last["event"] == "error" and last["message"]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    import main
    monkeypatch.setattr(main.llm, "enabled", False)
    with TestClient(main.app) as c:
        yield c


def parse_sse(text):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_api_upload_and_stream(client, sample_csv):
    assert client.get("/api/health").json()["status"] == "ok"
    up = client.post("/api/upload?filename=sales.csv", content=sample_csv.read_bytes())
    assert up.status_code == 200
    did = up.json()["dataset_id"]
    assert client.get(f"/api/analyze/{did}?consent=0").status_code == 400
    events = parse_sse(client.get(f"/api/analyze/{did}?consent=1&samples=0").text)
    assert events[0]["stage"] == "queued" and events[-1]["event"] == "done"
    assert client.get(f"/api/analyze/{did}?consent=1").status_code == 404  # deleted after the run


def test_api_rejects_bad_uploads(client, monkeypatch):
    assert client.post("/api/upload?filename=x.exe", content=b"a,b\n1,2").status_code == 400
    assert client.post("/api/upload?filename=x.csv", content=b"").status_code == 400
    assert client.post("/api/upload?filename=x.csv", content=b"\x00\x01binary").status_code == 400
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    assert client.post("/api/upload?filename=x.csv", content=b"a,b\n" + b"1,2\n" * 20).status_code == 413
    assert not any(config.DATA_DIR.iterdir())  # failed uploads leave nothing on disk

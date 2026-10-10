"""Files with headers like a, b, g, h: the user can explain them, and the AI is told to infer the rest."""

import asyncio
import json
import random

import httpx2
import pytest
from fastapi.testclient import TestClient

import analyses
import config
import profiler
from test_llm import fake_message, make_llm


@pytest.fixture(scope="module")
def cryptic_csv(tmp_path_factory):
    rnd = random.Random(1)
    rows = ["d,g,h,b,a"]
    for i in range(600):
        hours = round(rnd.uniform(0, 20), 1)
        rows.append(f"2023-{1 + i % 12:02d}-{1 + i % 28:02d},{rnd.choice('MF')},{hours},{round(hours * 40 + rnd.uniform(0, 50), 2)},{rnd.randint(22, 60)}")
    path = tmp_path_factory.mktemp("cryptic") / "mystery.csv"
    path.write_text("\n".join(rows))
    return path


def test_cryptic_names_are_flagged():
    flagged = {n: profiler.cryptic_name(n) for n in ["a", "g", "h", "col_3", "x1", "Unnamed: 4", "salary", "age", "id", "region"]}
    assert [n for n, f in flagged.items() if f] == ["a", "g", "h", "col_3", "x1", "Unnamed: 4"]


def test_preview_shows_examples(cryptic_csv):
    p = profiler.preview_dataset(cryptic_csv)
    cols = {c["name"]: c for c in p["columns"]}
    assert list(cols) == ["d", "g", "h", "b", "a"]
    assert all(c["cryptic"] for c in cols.values())
    assert set(cols["g"]["examples"]) <= {"M", "F"} and 1 <= len(cols["g"]["examples"]) <= 4


def test_preview_rejects_empty(tmp_path):
    empty = tmp_path / "e.csv"
    empty.write_text("")
    with pytest.raises(profiler.DatasetError):
        profiler.preview_dataset(empty)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    import main
    monkeypatch.setattr(main.llm, "enabled", False)
    with TestClient(main.app) as c:
        yield c


def events(client, dataset_id):
    text = client.get(f"/api/analyze/{dataset_id}?consent=1").text
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_meanings_flow_through_the_whole_pipeline(client, cryptic_csv):
    did = client.post("/api/upload?filename=m.csv", content=cryptic_csv.read_bytes()).json()["dataset_id"]
    pv = client.get(f"/api/preview/{did}").json()
    assert [c["name"] for c in pv["columns"]] == ["d", "g", "h", "b", "a"]
    saved = client.post(f"/api/notes/{did}", json={
        "context": "Staff pay records",
        "labels": {"h": "Overtime hours per month", "b": "Monthly pay", "g": "  ", "a": "Age"},
    }).json()
    assert saved["described_columns"] == 3  # blank meanings are dropped

    ev = events(client, did)
    profile = next(e for e in ev if e["event"] == "profile")
    assert {c["name"]: c.get("description") for c in profile["columns"]}["h"] == "Overtime hours per month"
    plan = next(e for e in ev if e["event"] == "plan")
    corr = next(f for f in plan["findings"] if f["type"] == "correlation")
    assert corr["labels"] == {"h": "Overtime hours per month", "b": "Monthly pay"}
    assert "Overtime hours per month" in corr["title"]
    finding = next(e for e in ev if e["event"] == "finding" and e["id"] == corr["id"])
    assert "hints" not in finding and finding["labels"]["b"] == "Monthly pay"
    exp = next(e for e in ev if e["event"] == "explanation" and e["id"] == corr["id"])
    assert "Overtime hours per month (h)" in exp["headline"]


def test_notes_validation_and_expiry(client, cryptic_csv):
    did = client.post("/api/upload?filename=m.csv", content=cryptic_csv.read_bytes()).json()["dataset_id"]
    assert client.post(f"/api/notes/{did}", json={"context": "x" * 601}).status_code == 422
    assert client.post("/api/notes/doesnotexist", json={}).status_code == 404
    assert client.get("/api/preview/doesnotexist").status_code == 404


def test_unreadable_file_is_caught_at_preview_and_cleaned_up(client):
    did = client.post("/api/upload?filename=m.csv", content=b"\n\n\n").json()["dataset_id"]
    r = client.get(f"/api/preview/{did}")
    assert r.status_code == 400 and r.json()["detail"]
    assert client.get(f"/api/preview/{did}").status_code == 404


def test_ai_is_told_what_columns_mean_and_asked_to_infer_the_rest(cryptic_csv, tmp_path):
    con = profiler.open_dataset(cryptic_csv, tmp_path / "w")
    profile = profiler.build_profile(con, False, {"h": "Overtime hours per month"})
    seen = {}

    def handler(request):
        seen["plan"] = json.loads(request.content)
        return httpx2.Response(200, json=fake_message('{"findings": []}'))

    asyncio.run(make_llm(handler).plan(profile, False, "Staff pay records"))
    sent = seen["plan"]["messages"][0]["content"]
    assert "<file_description>\nStaff pay records" in sent and "Overtime hours per month" in sent
    assert "infer its likely meaning" in seen["plan"]["system"]

    valid, _ = analyses.validate_plan([{"type": "correlation", "title": "t", "columns": ["h", "b"]}], profile)
    result = analyses.run_analysis(con, valid[0])
    assert result["labels"] == {"h": "Overtime hours per month"}
    assert "common_values" not in result["hints"]["h"] and "min" in result["hints"]["b"]

    def explain_handler(request):
        seen["explain"] = json.loads(request.content)
        return httpx2.Response(200, json=fake_message('{"headline": "H", "explanation": "E", "so_what": "S", "caveat": null}'))

    asyncio.run(make_llm(explain_handler).explain(result, "Staff pay records"))
    payload = json.loads(seen["explain"]["messages"][0]["content"])
    assert payload["column_meanings"] == {"h": "Overtime hours per month"}
    assert list(payload["column_hints"]) == ["b"]  # only unexplained columns need hints
    assert payload["file_description"] == "Staff pay records"
    con.close()

"""Exercises the real Claude code path against a fake HTTP transport (no API key needed)."""

import asyncio
import json

import anthropic
import httpx2

import analyses
from llm import LLM


def fake_message(text: str) -> dict:
    return {
        "id": "msg_test", "type": "message", "role": "assistant", "model": "claude-opus-5",
        "content": [{"type": "text", "text": text}], "stop_reason": "end_turn", "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


def make_llm(handler) -> LLM:
    llm = LLM()
    llm.enabled = True
    llm.client = anthropic.AsyncAnthropic(
        api_key="test", max_retries=0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )
    return llm


def test_plan_request_shape_and_parse(dataset):
    _, profile = dataset
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        plan = {"findings": [
            {"type": "correlation", "title": "Do units drive revenue?", "why": "Pricing.", "columns": ["units", "revenue"], "agg": None},
            {"type": "trend", "title": "Revenue over time", "why": "Growth.", "columns": ["order_date", "revenue"], "agg": "sum"},
        ]}
        return httpx2.Response(200, json=fake_message(json.dumps(plan)))

    items, mode = asyncio.run(make_llm(handler).plan(profile, include_samples=True))
    assert mode == "ai" and [i["type"] for i in items] == ["correlation", "trend"]
    body = seen["body"]
    assert body["model"] == "claude-opus-5"
    assert "json_schema" in json.dumps(body["output_config"])
    sent = body["messages"][0]["content"]
    assert "<dataset_profile>" in sent and "sample_rows" in sent
    assert "customer_email" not in sent.split("sample_rows")[1]  # id/text columns never leave the server
    valid, skipped = analyses.validate_plan(items, profile)
    assert len(valid) == 2 and not skipped


def test_samples_withheld_without_consent(dataset):
    _, profile = dataset
    seen = {}

    def handler(request):
        seen["content"] = request.content.decode()
        return httpx2.Response(200, json=fake_message('{"findings": []}'))

    asyncio.run(make_llm(handler).plan(profile, include_samples=False))
    assert "sample_rows" not in seen["content"]


def test_plan_falls_back_when_api_fails(dataset):
    _, profile = dataset
    items, mode = asyncio.run(make_llm(lambda r: httpx2.Response(500, json={"type": "error", "error": {"type": "api_error", "message": "boom"}})).plan(profile, False))
    assert mode == "fallback" and len(items) >= 3


def test_explain_parses_and_falls_back(dataset):
    con, _ = dataset
    result = analyses.run_analysis(con, {"id": "f1", "type": "imbalance", "title": "t", "why": "w", "columns": ["region"], "agg": None})
    seen = {}

    def ok(request):
        seen["body"] = request.content.decode()
        exp = {"headline": "H", "explanation": "E", "so_what": "S", "caveat": None}
        return httpx2.Response(200, json=fake_message(json.dumps(exp)))

    exp = asyncio.run(make_llm(ok).explain(result))
    assert exp["source"] == "ai" and exp["headline"] == "H"
    assert "North" in seen["body"]  # computed statistics are what the model is given

    bad = asyncio.run(make_llm(lambda r: httpx2.Response(500, json={"type": "error", "error": {"type": "api_error", "message": "x"}})).explain(result))
    assert bad["source"] == "template" and bad["headline"]

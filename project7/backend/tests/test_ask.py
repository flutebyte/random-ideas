import asyncio

import analyses
from ask import answer_question, heuristic_question
from llm import LLM


def _session(con, profile):
    return {"con": con, "profile": profile, "context": "", "asked": 0}


def test_heuristic_maps_question_to_analysis(dataset):
    _, profile = dataset
    assert heuristic_question("Does revenue differ by region?", profile)["type"] == "group_compare"
    assert heuristic_question("Is revenue related to units?", profile)["type"] == "correlation"
    assert heuristic_question("How has revenue changed by order date?", profile)["type"] == "trend"
    assert heuristic_question("Are there unusual values in revenue?", profile)["type"] == "outliers"
    assert heuristic_question("What is the weather?", profile) is None
    # a distinctive word of a column name is enough: "customer" -> customer_email is text, so ignored
    assert heuristic_question("Does the discount differ by product?", profile)["columns"] == ["product", "discount"]


def test_answer_is_computed_and_number_checked(dataset):
    con, profile = dataset
    llm = LLM()
    llm.enabled = False
    out = asyncio.run(answer_question(llm, _session(con, profile), "Does revenue differ by region?"))
    assert out["answered"] and out["finding"]["type"] == "group_compare"
    assert out["explanation"]["verified"]["unverified"] == []
    assert out["plan"]["id"] == "q1"


def test_unanswerable_question_is_refused_politely(dataset):
    con, profile = dataset
    llm = LLM()
    llm.enabled = False
    out = asyncio.run(answer_question(llm, _session(con, profile), "Will we be rich next year?"))
    assert out["answered"] is False and out["reason"]

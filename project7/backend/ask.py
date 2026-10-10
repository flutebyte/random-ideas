"""Free-form questions, answered through the same checked pipeline as the main analysis.

The question is mapped to ONE of the six analyses (by Claude, or by keyword matching in demo mode),
validated against the real columns, computed in SQL, explained, and number-checked. The model never
writes SQL and never computes anything, so a question can only ever be answered with exact figures.
"""

from __future__ import annotations

import asyncio
import re

from analyses import AnalysisSkipped, _SUM_HINT, run_analysis, validate_plan
from llm import LLM
from pipeline import explain_checked

MAX_QUESTION_CHARS = 300
_OUTLIER_WORDS = re.compile(r"outlier|unusual|extreme|weird|odd|abnormal|anomal", re.I)
_NOT_UNDERSTOOD = ("I couldn't tell which columns you mean. Try naming them, "
                   "for example: \"Does salary differ by department?\"")


def heuristic_question(question: str, profile: dict) -> dict | None:
    """Offline matcher: find the columns the question names and pick the analysis that fits them."""
    q = " " + re.sub(r"[_\-]+", " ", question.lower()) + " "
    words = set(re.findall(r"[a-z0-9]+", q))
    words |= {w[:-1] for w in words if w.endswith("s") and len(w) > 3}
    usable = [c for c in profile["columns"] if c["kind"] in ("numeric", "categorical", "datetime")]

    def tokens(c):
        return {t for t in re.findall(r"[a-z0-9]+", re.sub(r"[_\-]+", " ", c["name"].lower())) if len(t) >= 4}

    token_owners: dict[str, int] = {}
    for c in usable:
        for t in tokens(c):
            token_owners[t] = token_owners.get(t, 0) + 1

    hits = []
    for c in usable:
        names = {re.sub(r"[_\-]+", " ", c["name"].lower())}
        if c.get("description"):
            names.add(c["description"].lower())
        pos = [q.find(n) for n in names if len(n) > 1 and q.find(n) != -1]
        if not pos:  # fall back to a single distinctive word of the name (e.g. "salary" for annual_salary)
            pos = [q.find(t) for t in tokens(c) if token_owners[t] == 1 and t in words and q.find(t) != -1]
        if pos:
            hits.append((min(pos), c))
    hits.sort(key=lambda h: h[0])
    cols = [c for _, c in hits]
    dates = [c for c in cols if c["kind"] == "datetime"]
    nums = [c for c in cols if c["kind"] == "numeric"]
    cats = [c for c in cols if c["kind"] == "categorical"]

    def item(atype, columns, agg=None):
        return {"type": atype, "title": question.strip()[:120], "why": "You asked this.",
                "columns": [c["name"] for c in columns], "agg": agg}

    if dates:
        if nums:
            agg = "sum" if any(h in nums[0]["name"].lower() for h in _SUM_HINT) else "avg"
            return item("trend", [dates[0], nums[0]], agg)
        return item("trend", [dates[0]])
    if len(nums) >= 2 and not cats:
        return item("correlation", nums[:2])
    if cats and nums:
        return item("group_compare", [cats[0], nums[0]])
    if len(nums) == 1:
        return item("outliers" if _OUTLIER_WORDS.search(question) else "distribution", nums)
    if cats:
        return item("imbalance", cats[:1])
    return None


async def answer_question(llm: LLM, session: dict, question: str) -> dict:
    question = " ".join(question.split())[:MAX_QUESTION_CHARS]
    profile, context = session["profile"], session["context"]
    if llm.enabled:
        item, reason = await llm.plan_question(question, profile, context)
        mode = "ai"
    else:
        item, reason = heuristic_question(question, profile), _NOT_UNDERSTOOD
        mode = "demo"
    if item is None:
        return {"answered": False, "reason": reason or "That can't be answered with the checks available here."}

    specs, skipped = validate_plan([item], profile)
    if not specs:
        why = skipped[0]["reason"] if skipped else "that question doesn't fit the available checks"
        return {"answered": False, "reason": f"I can't answer that with the data as it is: {why}."}
    spec = specs[0]
    session["asked"] += 1
    spec["id"] = f"q{session['asked']}"
    try:
        result = await asyncio.to_thread(run_analysis, session["con"], spec)
    except AnalysisSkipped as e:
        return {"answered": False, "reason": str(e)}
    _, explanation = await explain_checked(llm, spec["id"], result, context)
    finding = {k: v for k, v in result.items() if k != "hints"}
    return {"answered": True, "mode": mode,
            "plan": {k: spec[k] for k in ("id", "type", "title", "why", "columns", "labels")},
            "finding": finding, "explanation": explanation}

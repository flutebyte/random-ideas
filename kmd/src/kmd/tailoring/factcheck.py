"""Deterministic trace-back check. The model must cite profile fact ids for every claim;
we verify the ids exist and that numbers / proper nouns in the text appear in the cited facts.
No LLM involved, so it can't be talked around."""
import re

NUM = re.compile(r"\d[\d,.]*\d|\d")
WORD = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]*")
# words allowed to be capitalised mid-sentence without a source (letter furniture)
FURNITURE = {"dear", "hiring", "manager", "team", "sincerely", "regards", "hi", "hello", "thanks",
             "thank", "best", "kind", "yours", "faithfully", "i", "recruiter",
             "recruiting", "committee", "sir", "madam"}
MAX_BOILERPLATE_WORDS = 12


def _norm_num(s):
    return s.replace(",", "").rstrip(".")


def _sentence_starts(text):
    """Offsets of words that start a sentence (start of text or after . ! ? or newline)."""
    starts = {0}
    for m in re.finditer(r"[.!?\n]\s+", text):
        starts.add(m.end())
    return starts


def check_item(item, facts_by_id, allowed_terms):
    text = item.get("text", "")
    problems = []
    if item.get("kind") == "boilerplate":
        if len(text.split()) > MAX_BOILERPLATE_WORDS or NUM.search(text):
            problems.append(f"boilerplate too substantial or has numbers: {text!r}")
        return problems
    ids = item.get("fact_ids") or []
    if not ids:
        return [f"claim without fact_ids: {text!r}"]
    unknown = [i for i in ids if i not in facts_by_id]
    if unknown:
        return [f"unknown fact ids {unknown}: {text!r}"]
    source = " ".join(facts_by_id[i] for i in ids).lower()
    source_nums = {_norm_num(n) for n in NUM.findall(source)}
    for n in NUM.findall(text):
        if _norm_num(n) not in source_nums:
            problems.append(f"number {n!r} not in cited facts: {text!r}")
    starts = _sentence_starts(text)
    for m in WORD.finditer(text):
        w = m.group(0).rstrip(".")
        if not w[0].isupper() or m.start() in starts:
            continue
        lw = w.lower()
        if lw in FURNITURE or lw in allowed_terms or lw in source:
            continue
        problems.append(f"term {w!r} not in cited facts: {text!r}")
    return problems


def check(items, facts, allowed_terms=()):
    """items: list of {text, fact_ids, kind?}. facts: profile['facts'] list of {id, text}.
    Returns a list of problem strings; [] means every claim traces back."""
    facts_by_id = {f["id"]: f["text"] for f in facts}
    allowed = {t.lower() for t in allowed_terms}
    problems = []
    for item in items:
        problems.extend(check_item(item, facts_by_id, allowed))
    return problems

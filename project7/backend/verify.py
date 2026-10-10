"""Number check: every figure in an explanation must trace back to the computed result.

The model never computes, but it can still misquote. This closes that gap: numbers in the
written text are matched against the numbers produced by SQL (allowing for rounding and
percent/fraction forms). Anything that cannot be traced is reported.
"""

from __future__ import annotations

import re

_NUM = re.compile(r"(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?")
_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}


def _parse(text: str) -> list[float]:
    out = []
    for m in _NUM.findall(text):
        try:
            out.append(float(m.replace(",", "")))
        except ValueError:
            pass
    return out


def _collect(obj, acc: list[float]) -> None:
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        acc.append(float(obj))
    elif isinstance(obj, str):
        acc.extend(_parse(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect(v, acc)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect(v, acc)


def _decimals(text: str, value: float) -> int:
    """How many decimals the writer used for this number (to allow matching after rounding)."""
    for m in _NUM.findall(text):
        if float(m.replace(",", "")) == value and "." in m:
            return len(m.split(".")[1])
    return 0


def _matches(value: float, truth: list[float], decimals: int) -> bool:
    tol = 0.5 * 10 ** -decimals
    for t in truth:
        for cand in (t, t * 100, t / 100, abs(t)):
            if abs(cand - abs(value)) <= tol + 1e-9 or abs(cand - abs(value)) <= abs(cand) * 0.005:
                return True
    return False


def check_numbers(explanation: dict, result: dict) -> dict:
    """Return {"checked": n, "unverified": [numbers]} for the explanation's text fields."""
    truth: list[float] = []
    _collect(result.get("stats"), truth)
    _collect(result.get("columns"), truth)
    text = " ".join(str(explanation.get(k) or "") for k in ("headline", "explanation", "so_what", "caveat"))
    # Numbers inside column names / labels are identifiers, not claims.
    names = list(result.get("columns") or []) + list((result.get("labels") or {}).values())
    for name in names:
        text = text.replace(str(name), " ")
    truth.extend(float(v) for v in _WORDS.values())
    claims = [v for v in _parse(text)]
    bad = [v for v in claims if v not in (0.0, 1.0, 100.0) and not _matches(v, truth, _decimals(text, v))]
    return {"checked": len(claims), "unverified": sorted(set(bad))}

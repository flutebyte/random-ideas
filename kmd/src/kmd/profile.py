import json
from pathlib import Path

REQUIRED = ("title_keywords", "skills", "locations")


def load_profile(path: str | Path = "profile.json") -> dict:
    """Read profile.json. Fails with the name of the missing/invalid field."""
    data = json.loads(Path(path).read_text())
    for key in REQUIRED:
        if not isinstance(data.get(key), list) or not data[key]:
            raise ValueError(f"profile: '{key}' must be a non-empty list")
    data.setdefault("deal_breakers", [])
    data.setdefault("blocklist", [])
    facts = data.setdefault("facts", [])
    if not isinstance(facts, list) or any(
        not isinstance(f, dict) or not f.get("id") or not f.get("text") for f in facts
    ):
        raise ValueError("profile: 'facts' must be a list of {id, text}")
    if len({f["id"] for f in facts}) != len(facts):
        raise ValueError("profile: duplicate fact ids")
    return data

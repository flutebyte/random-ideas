def prefilter(job, profile):
    """Free keyword check before spending money on the LLM. Returns (ok, reason)."""
    title = (job["title"] or "").lower()
    for bad in profile["deal_breakers"]:
        if bad.lower() in title:
            return False, f"deal-breaker '{bad}' in title"
    if not any(k.lower() in title for k in profile["title_keywords"]):
        return False, "title matches none of title_keywords"
    return True, ""

"""Greenhouse application form: scan -> plan (pure) -> fill -> stop. Submit is a separate function
that is only ever called after a human approval or a passing gate."""
import json
import re
import time
from pathlib import Path

# label regex -> how to get the value from profile["contact"]. Order matters (first match wins).
STANDARD = [
    (r"first\s*name|given name", lambda c: c.get("first_name")),
    (r"last\s*name|family name|surname", lambda c: c.get("last_name")),
    (r"^(full\s*)?name\b", lambda c: f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()),
    (r"e-?mail", lambda c: c.get("email")),
    (r"phone|mobile", lambda c: c.get("phone")),
    (r"linkedin", lambda c: c.get("linkedin")),
    (r"github", lambda c: c.get("github")),
    (r"website|portfolio|personal site", lambda c: c.get("website")),
    (r"current location|city|location", lambda c: c.get("location")),
]
COVER = re.compile(r"cover\s*letter", re.I)
RESUME = re.compile(r"resume|cv\b", re.I)

SCAN_JS = r"""
() => {
  const out = [];
  const root = document.querySelector('#application_form, #application-form, form') || document;
  root.querySelectorAll('input, textarea, select').forEach(el => {
    const t = (el.type || el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button'].includes(t)) return;
    let label = '';
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) label = l.innerText; }
    if (!label) { const l = el.closest('label'); if (l) label = l.innerText; }
    if (!label) label = el.getAttribute('aria-label') || el.placeholder || el.name || '';
    const required = el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(label);
    const options = el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.text.trim()).filter(Boolean) : [];
    const selector = el.id ? '#' + CSS.escape(el.id) : (el.name ? '[name="' + el.name + '"]' : null);
    if (!selector) return;
    out.push({selector, label: label.replace(/\s+/g, ' ').replace('*', '').trim(), type: t, required, options});
  });
  return out;
}
"""


def plan_fields(fields, profile, cover_letter_text):
    """Pure. Returns (fills, unanswered). fills: [{selector, kind, value, label}].
    Required fields we can't answer from the profile land in unanswered, so a human decides."""
    contact = profile.get("contact", {})
    custom = profile.get("answers", {})  # {"regex on label": "answer"}
    fills, unanswered = [], []
    for f in fields:
        label, typ = f["label"], f["type"]
        value, kind = None, "text"
        if typ == "file":
            hint = f"{label} {f['selector']}"  # new forms label the input just "Attach"; the id says what it is
            if RESUME.search(hint) and not COVER.search(hint) and profile.get("resume_path"):
                value, kind = profile["resume_path"], "file"
            elif COVER.search(hint):
                continue  # we paste the letter as text; a file slot for it is optional
        elif typ == "textarea" and COVER.search(label):
            value = cover_letter_text
        else:
            for pattern, getter in STANDARD:
                if re.search(pattern, label, re.I):
                    value = getter(contact)
                    break
            if value is None:
                for pattern, ans in custom.items():
                    if re.search(pattern, label, re.I):
                        value = ans
                        break
            if typ == "select":
                kind = "select"
                if value is not None and not any(str(value).lower() == o.lower() for o in f["options"]):
                    value = None  # never guess a dropdown option
            elif typ == "checkbox":
                kind = "check"
                value = value if value in (True, False) else None
        if value in (None, ""):
            if f["required"]:
                unanswered.append(label or f["selector"])
            continue
        fills.append({"selector": f["selector"], "kind": kind, "value": value, "label": label})
    return fills, unanswered


def letter_text(cover_letter_items):
    return "\n\n".join(i["text"] for i in cover_letter_items)


APPLY_LINK = re.compile(r"^\W*apply( now| for this (role|job|position))?\W*$", re.I)


def _looks_like_application(fields):
    labels = " ".join(f["label"].lower() for f in fields)
    return bool(re.search(r"e-?mail", labels) and re.search(r"first|name", labels))


def find_form(page):
    """Return (frame, fields) for the real application form, or (None, []).
    Looks in every iframe (companies embed Greenhouse on their own site), and if the page is only a
    job description, follows its 'Apply' link once. Never types or submits anything."""
    for attempt in range(2):
        for frame in page.frames:
            try:
                fields = frame.evaluate(SCAN_JS)
            except Exception:
                continue
            if _looks_like_application(fields):
                return frame, fields
        if attempt == 0:
            link = page.get_by_role("link", name=APPLY_LINK).first
            try:
                link.click(timeout=3000)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(2500)
            except Exception:
                break
    return None, []


NO_FORM = "application form not found on page"


def _apply(page, fills):
    for f in fills:
        loc = page.locator(f["selector"]).first
        if f["kind"] == "file":
            loc.set_input_files(f["value"])
        elif f["kind"] == "select":
            loc.select_option(label=f["value"])
        elif f["kind"] == "check":
            loc.set_checked(bool(f["value"]))
        else:
            loc.fill(str(f["value"]))


CONFIRMED = re.compile(r"thank you for applying|application (has been )?(submitted|received)|thanks for applying|submitted", re.I)


def _confirmed(page):
    """Explicit success detection: a confirmation URL, title or message. No signal => not confirmed."""
    try:
        text = page.title() + " " + page.url + " " + page.inner_text("body", timeout=3000)[:3000]
    except Exception:
        return False
    return bool(CONFIRMED.search(text) or "confirmation" in page.url)


def _shot(page, screenshot_dir, name):
    d = Path(screenshot_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name}-{int(time.time())}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def _public(fills):
    return [{k: v for k, v in f.items() if k != "selector"} for f in fills]


def fill_form(url, profile, cover_letter_items, screenshot_dir, headless=True, name="app", pw_factory=None):
    """Open the form, fill what we can, screenshot, and STOP. Returns
    {'payload': [...], 'unanswered': [...], 'screenshot': path}. Never clicks submit."""
    if pw_factory is None:
        from playwright.sync_api import sync_playwright as pw_factory
    with pw_factory() as pw:
        browser = pw.chromium.launch(headless=headless)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            frame, fields = find_form(page)
            if frame is None:
                fills, unanswered = [], [NO_FORM]
            else:
                fills, unanswered = plan_fields(fields, profile, letter_text(cover_letter_items))
                _apply(frame, fills)
            shot = _shot(page, screenshot_dir, name)
        finally:
            browser.close()
    return {"payload": _public(fills), "unanswered": unanswered, "screenshot": shot}


def submit_form(url, profile, cover_letter_items, screenshot_dir, headless=True, name="app", pw_factory=None):
    """Refill and click submit. Only call after approval / a passing gate.
    Refuses to click if anything required is unanswered."""
    if pw_factory is None:
        from playwright.sync_api import sync_playwright as pw_factory
    with pw_factory() as pw:
        browser = pw.chromium.launch(headless=headless)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            frame, fields = find_form(page)
            if frame is None:
                raise RuntimeError(f"refusing to submit, unanswered required fields: {[NO_FORM]}")
            fills, unanswered = plan_fields(fields, profile, letter_text(cover_letter_items))
            if unanswered:
                raise RuntimeError(f"refusing to submit, unanswered required fields: {unanswered}")
            _apply(frame, fills)
            frame.locator("#submit_app, button[type=submit], input[type=submit]").first.click()
            page.wait_for_load_state("networkidle", timeout=30000)
            confirmed = _confirmed(page)
            shot = _shot(page, screenshot_dir, name + "-submitted")
        finally:
            browser.close()
    return {"payload": json.dumps(_public(fills)), "screenshot": shot, "confirmed": confirmed}

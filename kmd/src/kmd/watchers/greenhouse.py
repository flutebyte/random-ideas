import json
import urllib.error
import urllib.request

from kmd.watchers.htmltext import html_to_text

BASE = "https://boards-api.greenhouse.io/v1/boards"


class DetailError(Exception):
    """Couldn't get a job's details right now (network, 429, 5xx). Worth retrying."""


def fetch_detail(board, job_id, base=BASE, timeout=15):
    """Full posting for one job: {"location": str, "description": plain text}.

    Returns None if the job no longer exists (404). Raises DetailError for
    anything temporary, so the caller can retry.
    """
    req = urllib.request.Request(f"{base}/{board}/jobs/{job_id}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise DetailError(f"HTTP {e.code} for {board}/{job_id}") from e
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        raise DetailError(f"{board}/{job_id}: {e}") from e
    return {
        "location": (data.get("location") or {}).get("name", ""),
        "description": html_to_text(data.get("content", "")),
    }


def fetch(board, etag, base=BASE, timeout=15):
    """Real HTTP fetch for poll_board. Returns (status, etag, jobs).

    status 0 means we couldn't reach the server at all; poll_board treats it
    like any other error and backs off.
    """
    req = urllib.request.Request(f"{base}/{board}/jobs")
    if etag:
        req.add_header("If-None-Match", etag)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
            jobs = [
                {"id": j["id"], "title": j.get("title", ""), "url": j.get("absolute_url", "")}
                for j in data.get("jobs", [])
            ]
            return resp.status, resp.headers.get("ETag"), jobs
    except urllib.error.HTTPError as e:  # 304, 404, 429, 5xx all land here
        return e.code, etag, []
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 0, etag, []

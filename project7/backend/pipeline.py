"""Orchestrates the five steps and yields UI events as they happen."""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path
from typing import AsyncIterator

import config
from analyses import AnalysisSkipped, heuristic_plan, run_analysis, validate_plan
from llm import LLM, template_explanation
from verify import check_numbers
from profiler import DatasetError, build_profile, open_dataset

log = logging.getLogger("pipeline")


def _status(stage: str, message: str, **extra) -> dict:
    return {"event": "status", "stage": stage, "message": message, **extra}


def _public_profile(profile: dict) -> dict:
    cols = [
        {k: c.get(k) for k in ("name", "dtype", "kind", "null_pct", "distinct", "description")}
        for c in profile["columns"]
    ]
    return {
        "row_count": profile["row_count"],
        "column_count": profile["column_count"],
        "columns": cols,
        "warnings": profile["warnings"],
    }


async def explain_checked(llm: LLM, fid: str, result: dict, context: str) -> tuple[str, dict]:
    exp = await llm.explain(result, context)
    check = check_numbers(exp, result)
    if check["unverified"] and exp.get("source") == "ai":
        log.warning("explanation %s had untraceable numbers %s; using template", fid, check["unverified"])
        exp = {**template_explanation(result), "source": "template", "replaced_after_check": True}
        check = check_numbers(exp, result)
    return fid, {**exp, "verified": {"checked": check["checked"], "unverified": check["unverified"]}}


async def run_pipeline(work_dir: Path, csv_path: Path, include_samples: bool, llm: LLM,
                       context: str = "", labels: dict | None = None, keep: dict | None = None) -> AsyncIterator[dict]:
    """If `keep` is given and the run succeeds, the open dataset is stored in it (for follow-up questions)
    instead of being deleted; the caller then owns cleanup."""
    con = None
    kept = False
    tasks: dict[str, asyncio.Task] = {}
    try:
        yield _status("loading", "Reading your file...")
        con = await asyncio.to_thread(open_dataset, csv_path, work_dir)

        yield _status("profiling", "Looking at your data...")
        profile = await asyncio.to_thread(build_profile, con, include_samples, labels)
        yield {"event": "profile", **_public_profile(profile)}

        yield _status("planning", "Deciding what is worth checking...")
        raw_plan, mode = await llm.plan(profile, include_samples, context)
        specs, skipped = validate_plan(raw_plan, profile)
        if len(specs) < config.MIN_FINDINGS:
            extra, more_skipped = validate_plan(raw_plan + heuristic_plan(profile), profile)
            if len(extra) > len(specs):
                specs, skipped = extra, skipped + more_skipped
        if not specs:
            yield {"event": "error", "message": "We couldn't find anything meaningful to analyze in this file."}
            return

        yield {"event": "plan", "mode": mode, "skipped": skipped,
               "findings": [{k: s[k] for k in ("id", "type", "title", "why", "columns", "labels")} for s in specs]}
        noun = "thing" if len(specs) == 1 else "things"
        yield _status("analyzing", f"Found {len(specs)} {noun} worth checking...")

        results: dict[str, dict] = {}
        for spec in specs:
            try:
                result = await asyncio.to_thread(run_analysis, con, spec)
            except AnalysisSkipped as e:
                yield {"event": "finding_skipped", "id": spec["id"], "title": spec["title"], "reason": str(e)}
                continue
            except Exception:
                log.exception("analysis %s failed", spec["id"])
                yield {"event": "finding_skipped", "id": spec["id"], "title": spec["title"],
                       "reason": "This check could not be completed on your data."}
                continue
            results[spec["id"]] = result
            yield {"event": "finding", **{k: v for k, v in result.items() if k != "hints"}}
            tasks[spec["id"]] = asyncio.create_task(explain_checked(llm, spec["id"], result, context))

        if not results:
            yield {"event": "error", "message": "None of the planned checks could be completed on this file."}
            return

        yield _status("explaining", "Putting it into plain language...")
        for fut in asyncio.as_completed(list(tasks.values())):
            fid, exp = await fut
            yield {"event": "explanation", "id": fid, **exp}

        if keep is not None:
            keep.update(con=con, profile=profile, context=context, work_dir=work_dir, asked=0, lock=asyncio.Lock())
            kept = True
        yield {"event": "done", "findings": len(results), "mode": mode, "can_ask": kept}
    except DatasetError as e:
        yield {"event": "error", "message": str(e)}
    except Exception:
        log.exception("pipeline crashed")
        yield {"event": "error", "message": "Something went wrong while analyzing your file. Please try again."}
    finally:
        for t in tasks.values():
            if not t.done():
                t.cancel()
        if not kept:
            if con is not None:
                try:
                    con.close()
                except Exception:
                    pass
            shutil.rmtree(work_dir, ignore_errors=True)

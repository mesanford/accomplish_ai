"""Plan assistant logic: clean a model draft, verify it with the rules engine, repair once.

Everything here is pure. The model is an injected function `(prompt) -> raw dict`, so tests
(and the local fake planner) plug in without any network.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date

from trailhead_core import check_path
from trailhead_core.catalog import Catalog
from trailhead_core.models import FeasibilityResult, Path, PathItem, PathStatus, ScoutRecord, Severity

from .assistant_prompt import MAX_REQUEST_CHARS, build_prompt, build_repair_prompt
from .paths import feasibility_doc

log = logging.getLogger(__name__)

DAILY_DRAFT_LIMIT = 5
# A troop-wide ceiling keeps the AI bill bounded: about $0.04 a draft, so at most about $4 a troop a month.
TROOP_MONTHLY_DRAFT_LIMIT = 100
ModelFn = Callable[[str], dict]


def validate_request(text: object) -> str:
    """The request text, trimmed. Raises ValueError with a user-facing message if unusable."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Tell us what you want to work toward.")
    if len(text.strip()) > MAX_REQUEST_CHARS:
        raise ValueError(f"Keep your request under {MAX_REQUEST_CHARS} characters.")
    return text.strip()


def usage_doc_id(uid: str, day: date) -> str:
    return f"{uid}_{day.isoformat()}"


def troop_month_doc_id(day: date) -> str:
    """The troop's monthly draft counter. The id has no full date, so the 30-day usage cleanup leaves it alone."""
    return f"troop_month_{day.strftime('%Y-%m')}"


def within_daily_limit(count_today: int, limit: int = DAILY_DRAFT_LIMIT) -> bool:
    return count_today < limit


def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def clean_items(raw: object, scout: ScoutRecord, catalog: Catalog, today: date) -> list[dict]:
    """Keep only real, unearned badges, once each. Bad dates become None so the engine flags them."""
    items: list[dict] = []
    seen: set[str] = set()
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        award_id = entry.get("awardId")
        if award_id not in catalog.badges or award_id in scout.earned_badges or award_id in seen:
            continue
        seen.add(award_id)
        start, end = _parse_date(entry.get("plannedStart")), _parse_date(entry.get("plannedEnd"))
        if start and end and end < start:
            start = end = None
        if start and start < today:
            start = today
            end = max(end, today) if end else None
        items.append(
            {
                "awardId": award_id,
                "plannedStart": start.isoformat() if start else None,
                "plannedEnd": end.isoformat() if end else None,
            }
        )
    return items


def clean_response(raw: object, scout: ScoutRecord, catalog: Catalog, today: date) -> tuple[list[dict], str]:
    data = raw if isinstance(raw, dict) else {}
    explanation = data.get("explanation")
    text = explanation.strip()[:1000] if isinstance(explanation, str) else ""
    return clean_items(data.get("items"), scout, catalog, today), text


def _to_path(scout: ScoutRecord, goal_id: str, target: date | None, items: list[dict]) -> Path:
    return Path(
        scout_id=scout.scout_id,
        goal_award_id=goal_id,
        target_date=target,
        items=[
            PathItem(
                award_id=i["awardId"],
                order=n,
                planned_start=_parse_date(i["plannedStart"]),
                planned_end=_parse_date(i["plannedEnd"]),
            )
            for n, i in enumerate(items)
        ],
    )


def _check(
    scout: ScoutRecord, goal_id: str, target: date | None, items: list[dict], today: date, catalog: Catalog
) -> FeasibilityResult:
    return check_path(_to_path(scout, goal_id, target, items), scout, today, catalog)


_BADNESS = {PathStatus.OK: 0, PathStatus.AT_RISK: 1, PathStatus.INFEASIBLE: 2}


def draft_plan(
    model: ModelFn,
    scout: ScoutRecord,
    goal_id: str,
    target: date | None,
    request: str,
    today: date,
    catalog: Catalog,
) -> dict:
    """Draft, verify, and (if infeasible) repair once. The engine's verdict is returned untouched."""
    prompt = build_prompt(today, scout, goal_id, target, request, catalog)
    items, explanation = clean_response(model(prompt), scout, catalog, today)
    result = _check(scout, goal_id, target, items, today, catalog)
    repaired = False
    if result.status == PathStatus.INFEASIBLE:
        errors = [i.message for i in result.issues if i.severity == Severity.ERROR]
        log.info("assistant draft infeasible; one repair round (%d problems)", len(errors))
        try:
            raw = model(build_repair_prompt(prompt, items, errors))
            new_items, new_text = clean_response(raw, scout, catalog, today)
        except Exception:  # the first draft is still useful, with the engine's verdict attached
            log.exception("assistant repair call failed")
            new_items, new_text = [], ""
        if new_items:
            new_result = _check(scout, goal_id, target, new_items, today, catalog)
            if _BADNESS[new_result.status] <= _BADNESS[result.status]:
                items, explanation, result, repaired = new_items, new_text or explanation, new_result, True
    return {
        "items": items,
        "explanation": explanation,
        "feasibility": feasibility_doc(result),
        "repaired": repaired,
    }

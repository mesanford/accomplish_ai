"""Building engine inputs from Firestore documents, and deciding when to recheck a path."""

from __future__ import annotations

from datetime import date, datetime

from trailhead_core.models import Path, PathItem, ScoutRecord

# Fields that change what the engine would say. Anything else (like a title) needs no recheck.
PLAN_FIELDS = ("goalAwardId", "targetDate", "items")


def _as_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def needs_recheck(before: dict | None, after: dict | None) -> bool:
    if after is None:
        return False
    if before is None or "feasibility" not in after:
        return True
    return any(before.get(f) != after.get(f) for f in PLAN_FIELDS)


def path_from_doc(doc: dict) -> Path:
    return Path(
        scout_id=doc["scoutId"],
        goal_award_id=doc["goalAwardId"],
        target_date=_as_date(doc.get("targetDate")),
        items=[
            PathItem(
                award_id=i["awardId"],
                order=i.get("order", n),
                planned_start=_as_date(i.get("plannedStart")),
                planned_end=_as_date(i.get("plannedEnd")),
            )
            for n, i in enumerate(doc.get("items", []))
        ],
    )


def scout_from_docs(scout_id: str, record: dict, progress_docs: list[dict]) -> ScoutRecord:
    """`record` is troops/{t}/scoutRecords/{scoutId}; progress docs give earned badges."""
    earned = {
        p["awardId"]: _as_date(p.get("completedAt")) or date.min
        for p in progress_docs
        if p.get("status") == "complete" and p.get("awardType", "merit_badge") == "merit_badge"
    }
    return ScoutRecord(
        scout_id=scout_id,
        birth_year=record["birthYear"],
        birth_month=record["birthMonth"],
        current_rank_id=record.get("currentRankId", "scout"),
        rank_dates={k: _as_date(v) for k, v in (record.get("rankDates") or {}).items()},
        earned_badges=earned,
    )


def feasibility_doc(result) -> dict:
    """Engine result as a Firestore-friendly map (dates as ISO strings)."""
    return result.model_dump(mode="json")

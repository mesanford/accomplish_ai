"""Earliest possible date for each rank on the way to a goal."""

from __future__ import annotations

from datetime import date, timedelta

from .catalog import Catalog, Rank
from .dates import add_months, age_deadline
from .eagle import eagle_slots_filled, missing_eagle_required
from .models import Issue, PathItem, ScoutRecord, Severity


def badge_finish_dates(items: list[PathItem], scout: ScoutRecord, catalog: Catalog) -> dict[str, date]:
    """Earned badges at their earned date, plus planned badges at their planned finish."""
    dates = dict(scout.earned_badges)
    for item in items:
        if item.award_id in catalog.badges and item.award_id not in dates and item.planned_end:
            dates[item.award_id] = item.planned_end
    return dates


def _badges_ready_on(rank: Rank, finishes: dict[str, date], catalog: Catalog) -> date | None:
    """First date the Scout holds enough badges, and enough Eagle-required ones, for `rank`."""
    if not rank.total_badges:
        return date.min
    held: list[str] = []
    for badge_id, finished in sorted(finishes.items(), key=lambda kv: kv[1]):
        held.append(badge_id)
        if len(held) >= rank.total_badges and eagle_slots_filled(held, catalog) >= rank.total_eagle_required:
            return finished
    return None


def rank_timeline(
    scout: ScoutRecord, items: list[PathItem], goal_id: str, catalog: Catalog, today: date
) -> tuple[dict[str, date], list[Issue]]:
    issues: list[Issue] = []
    timeline: dict[str, date] = {}
    finishes = badge_finish_dates(items, scout, catalog)
    previous = scout.rank_dates.get(scout.current_rank_id)
    if previous is None:
        previous = today
        if scout.current_rank_id != "scout":
            issues.append(
                Issue(
                    code="missing_rank_date",
                    severity=Severity.WARNING,
                    message="The date of the current rank is missing, so timing is counted from today.",
                )
            )
    for rank in catalog.ranks_between(scout.current_rank_id, goal_id):
        earliest = max(add_months(previous, rank.months_after_previous), today)
        if rank.min_days:
            earliest = max(earliest, today + timedelta(days=rank.min_days))
        ready = _badges_ready_on(rank, finishes, catalog)
        if ready is None:
            # Report against the goal, so the Scout sees everything still missing, not just the next rank.
            issues.append(_short_on_badges(catalog.ranks[goal_id], finishes, catalog))
            return timeline, issues
        earliest = max(earliest, ready)
        if rank.before_age:
            issues.extend(_age_check(rank, earliest, scout))
        timeline[rank.id] = earliest
        previous = earliest
    return timeline, issues


def _short_on_badges(rank: Rank, finishes: dict[str, date], catalog: Catalog) -> Issue:
    have = len(finishes)
    slots = eagle_slots_filled(finishes, catalog)
    parts = []
    if have < rank.total_badges:
        parts.append(f"{rank.name} needs {rank.total_badges} merit badges; the plan has {have}.")
    if slots < rank.total_eagle_required:
        parts.append(f"It needs {rank.total_eagle_required} Eagle-required badges; the plan has {slots}.")
        if rank.total_eagle_required == catalog.eagle_required_slots:
            parts.append("Missing: " + ", ".join(missing_eagle_required(finishes, catalog)) + ".")
    return Issue(code="not_enough_badges", severity=Severity.ERROR, message=" ".join(parts), award_id=rank.id)


def _age_check(rank: Rank, earliest: date, scout: ScoutRecord) -> list[Issue]:
    soonest, latest = age_deadline(scout.birth_year, scout.birth_month, rank.before_age or 0)
    if earliest > latest:
        severity, verb = Severity.ERROR, "comes after"
    elif earliest >= soonest:
        severity, verb = Severity.WARNING, "may come after"
    else:
        return []
    return [
        Issue(
            code="age_limit",
            severity=severity,
            message=(
                f"The earliest {rank.name} date, {earliest.isoformat()}, {verb} the Scout's "
                f"{rank.before_age}th birthday ({soonest:%B %Y})."
            ),
            award_id=rank.id,
        )
    ]

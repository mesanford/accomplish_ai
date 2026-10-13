"""Checks on individual planned merit badges: duration, prerequisites and workload."""

from __future__ import annotations

from datetime import date, timedelta

from .catalog import Catalog
from .models import Issue, PathItem, ScoutRecord, Severity

# Sum of difficulty across badges worked at the same time before we warn.
MAX_CONCURRENT_DIFFICULTY = 10


def check_badges(items: list[PathItem], scout: ScoutRecord, catalog: Catalog) -> list[Issue]:
    issues: list[Issue] = []
    for item in items:
        badge = catalog.badges.get(item.award_id)
        if badge is None:
            continue  # ranks and unknown ids are handled elsewhere
        if item.award_id in scout.earned_badges:
            continue
        if item.planned_end is None:
            issues.append(
                Issue(
                    code="unscheduled",
                    severity=Severity.WARNING,
                    message=f"{badge.name} has no planned finish date.",
                    award_id=badge.id,
                )
            )
        elif badge.min_days and item.planned_start:
            days = (item.planned_end - item.planned_start).days
            if days < badge.min_days:
                issues.append(
                    Issue(
                        code="too_short",
                        severity=Severity.ERROR,
                        message=(
                            f"{badge.name} needs at least {badge.min_days} days of tracking; the plan allows {days}."
                        ),
                        award_id=badge.id,
                    )
                )
        if badge.prereq_any_of and not _prereq_met(item, badge.prereq_any_of, items, scout):
            names = " or ".join(catalog.badges[p].name for p in badge.prereq_any_of)
            issues.append(
                Issue(
                    code="prerequisite",
                    severity=Severity.ERROR,
                    message=f"{badge.name} requires {names} first.",
                    award_id=badge.id,
                )
            )
    issues.extend(_workload(items, scout, catalog))
    return issues


def _prereq_met(item: PathItem, prereqs: tuple[str, ...], items: list[PathItem], scout: ScoutRecord) -> bool:
    if any(p in scout.earned_badges for p in prereqs):
        return True
    start = item.planned_start or item.planned_end
    for other in items:
        if other.award_id in prereqs and other.planned_end and start and other.planned_end <= start:
            return True
    return False


def _workload(items: list[PathItem], scout: ScoutRecord, catalog: Catalog) -> list[Issue]:
    """Warn on weeks where the badges being worked together add up to too much."""
    spans = [
        (i.planned_start, i.planned_end, catalog.badges[i.award_id].difficulty)
        for i in items
        if i.award_id in catalog.badges and i.award_id not in scout.earned_badges and i.planned_start and i.planned_end
    ]
    if not spans:
        return []
    week = min(s for s, _, _ in spans)
    last = max(e for _, e, _ in spans)
    while week <= last:
        load = sum(d for s, e, d in spans if s <= week <= e)
        if load > MAX_CONCURRENT_DIFFICULTY:
            return [_overload_issue(week, load)]
        week += timedelta(days=7)
    return []


def _overload_issue(week: date, load: int) -> Issue:
    return Issue(
        code="overloaded",
        severity=Severity.WARNING,
        message=(
            f"The week of {week.isoformat()} stacks badges with a combined difficulty of {load} "
            f"(over {MAX_CONCURRENT_DIFFICULTY}). Consider spreading them out."
        ),
    )

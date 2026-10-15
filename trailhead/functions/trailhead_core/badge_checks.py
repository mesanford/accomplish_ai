"""Checks on individual planned merit badges: duration, prerequisites and workload."""

from __future__ import annotations

from datetime import date, timedelta

from .catalog import Catalog
from .dates import human
from .models import Issue, PathItem, ScoutRecord, Severity

# Sum of difficulty across badges worked at the same time before we warn.
MAX_CONCURRENT_DIFFICULTY = 10


def check_badges(items: list[PathItem], scout: ScoutRecord, catalog: Catalog) -> list[Issue]:
    issues: list[Issue] = []
    unscheduled: list[str] = []
    for item in items:
        badge = catalog.badges.get(item.award_id)
        if badge is None:
            continue  # ranks and unknown ids are handled elsewhere
        if item.award_id in scout.earned_badges:
            continue
        if item.planned_end is None:
            unscheduled.append(badge.name)
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
        if badge.finish_by and item.planned_end and item.planned_end > badge.finish_by:
            deadline = human(badge.finish_by)
            issues.append(
                Issue(
                    code="discontinued",
                    severity=Severity.ERROR,
                    message=(
                        f"{badge.name} was discontinued. Scouts who already started it must finish by "
                        f"{deadline}; the plan finishes {human(item.planned_end)}."
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
    if unscheduled:
        issues.insert(0, _unscheduled_issue(unscheduled))
    issues.extend(_workload(items, scout, catalog))
    return issues


def _unscheduled_issue(names: list[str]) -> Issue:
    """One warning for every badge without a finish date, so the real problems stay visible."""
    if len(names) == 1:
        message = f"{names[0]} has no planned finish date, so it can't count toward a rank yet."
    else:
        listed = ", ".join(names)
        message = f"{len(names)} badges have no planned finish date, so they can't count toward a rank yet: {listed}."
    return Issue(code="unscheduled", severity=Severity.WARNING, message=message)


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
            f"The week of {human(week)} stacks badges with a combined difficulty of {load} "
            f"(over {MAX_CONCURRENT_DIFFICULTY}). Consider spreading them out."
        ),
    )

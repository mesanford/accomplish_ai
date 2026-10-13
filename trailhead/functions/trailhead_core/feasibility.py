"""Checks whether a Scout's path can reach its goal by the target date."""

from __future__ import annotations

from datetime import date, timedelta

from .badge_checks import check_badges
from .catalog import Catalog, load_catalog
from .models import FeasibilityResult, Issue, Path, PathStatus, ScoutRecord, Severity
from .timeline import rank_timeline

# How far ahead "start soon" next steps look.
NEXT_STEP_WINDOW = timedelta(days=21)


def check_path(path: Path, scout: ScoutRecord, today: date, catalog: Catalog | None = None) -> FeasibilityResult:
    catalog = catalog or load_catalog()
    issues: list[Issue] = []
    if path.goal_award_id not in catalog.ranks:
        issues.append(
            Issue(code="unknown_goal", severity=Severity.ERROR, message=f"Unknown goal: {path.goal_award_id}.")
        )
        return _result(issues, None, [])
    unknown = [i.award_id for i in path.items if i.award_id not in catalog.badges and i.award_id not in catalog.ranks]
    issues += [
        Issue(code="unknown_award", severity=Severity.ERROR, message=f"Unknown award: {a}.", award_id=a)
        for a in unknown
    ]
    issues += check_badges(path.items, scout, catalog)
    timeline, timing = rank_timeline(scout, path.items, path.goal_award_id, catalog, today)
    issues += timing
    earliest = timeline.get(path.goal_award_id)
    if earliest and path.target_date and earliest > path.target_date:
        goal = catalog.ranks[path.goal_award_id].name
        issues.append(
            Issue(
                code="misses_target",
                severity=Severity.ERROR,
                message=(
                    f"The earliest possible {goal} date is {earliest.isoformat()}, "
                    f"after the target of {path.target_date.isoformat()}."
                ),
                award_id=path.goal_award_id,
            )
        )
    return _result(issues, earliest, next_steps(path, scout, timeline, today, catalog))


def next_steps(
    path: Path, scout: ScoutRecord, timeline: dict[str, date], today: date, catalog: Catalog, limit: int = 3
) -> list[str]:
    """Plain-language actions for the Scout, soonest first."""
    steps: list[str] = []
    upcoming = sorted(
        (i for i in path.items if i.award_id in catalog.badges and i.award_id not in scout.earned_badges),
        key=lambda i: i.planned_start or date.max,
    )
    for item in upcoming:
        if item.planned_start and item.planned_start <= today + NEXT_STEP_WINDOW:
            name = catalog.badges[item.award_id].name
            when = "now" if item.planned_start <= today else f"by {item.planned_start.isoformat()}"
            steps.append(f"Start {name} {when}.")
    for rank_id, when in sorted(timeline.items(), key=lambda kv: kv[1]):
        steps.append(f"Earliest {catalog.ranks[rank_id].name} date: {when.isoformat()}.")
        break
    return steps[:limit]


def _result(issues: list[Issue], earliest: date | None, steps: list[str]) -> FeasibilityResult:
    if any(i.severity == Severity.ERROR for i in issues):
        status = PathStatus.INFEASIBLE
    elif issues:
        status = PathStatus.AT_RISK
    else:
        status = PathStatus.OK
    return FeasibilityResult(status=status, issues=issues, earliest_goal_date=earliest, next_steps=steps)

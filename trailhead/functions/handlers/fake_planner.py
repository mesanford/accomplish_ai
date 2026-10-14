"""FAKE planner for local development and tests. Never used when talking to the real Gemini model.

Picks the badges a Scout still needs for the goal rank (Eagle-required first, then one from each
Eagle choice group, then easy electives) and spaces them out from today in two lanes, respecting
each badge's minimum tracking days. Same input, same output.
"""

from __future__ import annotations

from datetime import date, timedelta

from trailhead_core.catalog import Catalog
from trailhead_core.models import ScoutRecord


def _candidates(scout: ScoutRecord, catalog: Catalog) -> list[str]:
    ordered = sorted(catalog.badges.values(), key=lambda b: (b.difficulty, b.id))
    open_badges = [b for b in ordered if b.id not in scout.earned_badges]
    required = [b.id for b in open_badges if b.eagle_required]
    held_groups = {catalog.badges[e].eagle_group for e in scout.earned_badges if e in catalog.badges}
    picks = [
        next(b.id for b in open_badges if b.eagle_group == group)
        for group in sorted(catalog.eagle_groups)
        if group not in held_groups
    ]
    rest = [b.id for b in open_badges if b.id not in required and b.id not in picks]
    return required + picks + rest


def fake_plan(scout: ScoutRecord, goal_id: str, catalog: Catalog, today: date) -> dict:
    goal = catalog.ranks[goal_id]
    need = max(goal.total_badges - len(scout.earned_badges), 0)
    lanes = [today + timedelta(days=7)] * 2
    items = []
    for badge_id in _candidates(scout, catalog)[:need]:
        badge = catalog.badges[badge_id]
        lane = lanes.index(min(lanes))
        start = lanes[lane]
        days = max(14 + 7 * badge.difficulty, (badge.min_days or 0) + 7)
        end = start + timedelta(days=days)
        lanes[lane] = end + timedelta(days=1)
        items.append({"awardId": badge_id, "plannedStart": start.isoformat(), "plannedEnd": end.isoformat()})
    return {
        "items": items,
        "explanation": (
            f"Practice plan (not from Gemini): {len(items)} badges toward {goal.name}, "
            "Eagle-required badges first, two at a time."
        ),
    }

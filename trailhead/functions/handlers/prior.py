"""Advancement a Scout earned before joining Trailhead: checking it and turning it into documents.

Earlier work is marked `source: "prior"` (badges) or listed in `priorRankIds` (ranks). It counts toward
plans like anything else, but the Scoutbook handoff report leaves it out: it should already be in Scoutbook.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from trailhead_core.catalog import Catalog

from .membership import InvalidInput

MAX_ITEMS = 200
REQ_LABEL = re.compile(r"^[0-9]{1,2}[a-z]?(\([0-9a-z]{1,3}\))?$", re.IGNORECASE)


@dataclass
class PriorPlan:
    rank_dates: dict[str, str]
    current_rank_id: str | None
    completed: dict[str, str] = field(default_factory=dict)  # badge id -> completion date
    partials: dict[str, tuple[str, list[str]]] = field(default_factory=dict)  # badge id -> (date, requirement labels)


def _date(value, what: str, today: date, earliest: date) -> str:
    try:
        d = date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise InvalidInput(f"Enter a date like 2025-06-14 for {what}.") from err
    if d > today:
        raise InvalidInput(f"The date for {what} is in the future.")
    if d < earliest:
        raise InvalidInput(f"The date for {what} is before the Scout turned 10.")
    return d.isoformat()


def check_prior(data: dict, record: dict, catalog: Catalog, today: date) -> PriorPlan:
    """Validate a leader's entry of earlier advancement for one Scout."""
    earliest = date(record["birthYear"] + 10, record["birthMonth"], 1)
    ranks_in = data.get("ranks") or {}
    badges_in = data.get("badges") or []
    partials_in = data.get("partials") or []
    if len(badges_in) + len(partials_in) > MAX_ITEMS:
        raise InvalidInput(f"Enter at most {MAX_ITEMS} badges at a time.")

    rank_dates: dict[str, str] = {}
    for rank_id, value in ranks_in.items():
        if rank_id not in catalog.ranks:
            raise InvalidInput(f"Unknown rank: {rank_id}.")
        if value:
            rank_dates[rank_id] = _date(value, catalog.ranks[rank_id].name, today, earliest)
    ordered = sorted(rank_dates, key=lambda r: catalog.ranks[r].order)
    for lower, higher in zip(ordered, ordered[1:], strict=False):
        if rank_dates[higher] < rank_dates[lower]:
            low, high = catalog.ranks[lower].name, catalog.ranks[higher].name
            raise InvalidInput(f"{high} is dated before {low}. Check the rank dates.")
    current = ordered[-1] if ordered else None

    plan = PriorPlan(rank_dates=rank_dates, current_rank_id=current)
    for item in badges_in:
        badge_id = item.get("awardId")
        if badge_id not in catalog.badges:
            raise InvalidInput(f"Unknown merit badge: {badge_id}.")
        plan.completed[badge_id] = _date(item.get("date"), catalog.badges[badge_id].name, today, earliest)
    for item in partials_in:
        badge_id = item.get("awardId")
        if badge_id not in catalog.badges:
            raise InvalidInput(f"Unknown merit badge: {badge_id}.")
        name = catalog.badges[badge_id].name
        if badge_id in plan.completed:
            raise InvalidInput(f"{name} is listed as both completed and partly done.")
        labels = list(dict.fromkeys(str(r).strip().lower() for r in item.get("requirements") or [] if str(r).strip()))
        if not labels:
            raise InvalidInput(f"List the requirements already done for {name}, such as 1, 2a, 4.")
        bad = [r for r in labels if not REQ_LABEL.match(r)]
        if bad:
            raise InvalidInput(f"{name}: '{bad[0]}' doesn't look like a requirement number. Use forms like 3 or 4b.")
        plan.partials[badge_id] = (_date(item.get("date"), name, today, earliest), labels)
    return plan


def completed_doc(scout_id: str, badge_id: str, version_id: str, day: str, member_id: str) -> dict:
    return {
        "scoutId": scout_id,
        "awardId": badge_id,
        "versionId": version_id,
        "status": "complete",
        "completedAt": day,
        "source": "prior",
        "recordedByMemberId": member_id,
    }


def partial_doc(scout_id: str, badge_id: str, version_id: str, day: str, labels: list[str], member_id: str) -> dict:
    return {
        "scoutId": scout_id,
        "awardId": badge_id,
        "versionId": version_id,
        "status": "in_progress",
        "requirements": {r: {"status": "signed", "source": "prior", "date": day} for r in labels},
        "source": "prior",
        "recordedByMemberId": member_id,
    }


def keep_existing(existing: dict | None) -> bool:
    """Never overwrite work recorded in Trailhead itself; earlier entries can be corrected freely."""
    return bool(existing) and existing.get("source") != "prior"

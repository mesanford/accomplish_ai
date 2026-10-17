"""Patrols. No Firestore calls here.

A patrol is `troops/{t}/patrols/{id}` with a name, an optional color and the member ids of its patrol leader and
assistant patrol leader. A Scout's patrol is `patrolId` on their member document, so a Scout is in at most one patrol.
Only the server writes both (see firestore.rules), so a leader can't be named for a patrol the Scout isn't in.
Membership history is not kept.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from handlers.membership import InvalidInput

MAX_PATROLS, MAX_NAME, MAX_ASSIGN = 20, 40, 60
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def parse_patrol(data: dict) -> dict:
    name = " ".join(str(data.get("name") or "").split())
    if not name:
        raise InvalidInput("Patrol name is required.")
    if len(name) > MAX_NAME:
        raise InvalidInput(f"Patrol name must be {MAX_NAME} characters or fewer.")
    color = data.get("color") or None
    if color is not None and not (isinstance(color, str) and COLOR.match(color)):
        raise InvalidInput("Pick a color from the list.")
    return {"name": name, "color": color.lower() if color else None}


def name_taken(name: str, patrol_id: str | None, patrols: dict[str, dict]) -> bool:
    wanted = name.casefold()
    return any(p.get("name", "").casefold() == wanted for pid, p in patrols.items() if pid != patrol_id)


def check_officers(patrol_id: str, leader_id, assistant_id, members: dict[str, dict]) -> None:
    """The patrol leader and assistant must be two different Scouts who are in this patrol."""
    for label, member_id in (("patrol leader", leader_id), ("assistant patrol leader", assistant_id)):
        if member_id is None:
            continue
        member = members.get(member_id) or {}
        if member.get("kind") != "scout" or member.get("patrolId") != patrol_id:
            raise InvalidInput(f"The {label} must be a Scout in this patrol. Add them to the patrol first.")
    if leader_id is not None and leader_id == assistant_id:
        raise InvalidInput("The patrol leader and assistant patrol leader must be different Scouts.")


@dataclass
class AssignPlan:
    member_patrol: dict[str, str | None] = field(default_factory=dict)  # scout id -> new patrol id (None: none)
    patrol_fields: dict[str, dict] = field(default_factory=dict)  # patrol id -> fields to change


def _drop_officer(plan: AssignPlan, patrols: dict[str, dict], patrol_id: str | None, scout_id: str) -> None:
    patrol = patrols.get(patrol_id or "")
    if not patrol:
        return
    for key in ("leaderId", "assistantId"):
        if patrol.get(key) == scout_id:
            plan.patrol_fields.setdefault(patrol_id, {})[key] = None


def plan_assign(scout_ids: list[str], patrol_id: str | None, members: dict[str, dict], patrols: dict[str, dict]):
    """Move Scouts into a patrol (or out of every patrol). A Scout who leaves a patrol stops being its leader."""
    if patrol_id is not None and patrol_id not in patrols:
        raise InvalidInput("That patrol was not found.")
    ids = list(dict.fromkeys(scout_ids))
    if not ids or len(ids) > MAX_ASSIGN:
        raise InvalidInput(f"Choose between 1 and {MAX_ASSIGN} Scouts.")
    plan = AssignPlan()
    for scout_id in ids:
        member = members.get(scout_id) or {}
        if member.get("kind") != "scout":
            raise InvalidInput("Only Scouts can be in a patrol.")
        old = member.get("patrolId")
        if old == patrol_id:
            continue
        plan.member_patrol[scout_id] = patrol_id
        _drop_officer(plan, patrols, old, scout_id)
    return plan


def plan_delete(patrol_id: str, members: dict[str, dict]) -> list[str]:
    """The Scouts to take out of a patrol that is being deleted."""
    return sorted(m for m, d in members.items() if d.get("patrolId") == patrol_id)


def plan_erase(scout_id: str, patrols: dict[str, dict]) -> dict[str, dict]:
    """patrol id -> fields to clear when a Scout's records are erased (their member document goes anyway)."""
    plan = AssignPlan()
    for patrol_id in patrols:
        _drop_officer(plan, patrols, patrol_id, scout_id)
    return plan.patrol_fields

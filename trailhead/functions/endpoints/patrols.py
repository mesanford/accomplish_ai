"""Patrols: a leader creates them, puts Scouts in them and names the patrol leader and assistant.

Patrols and each Scout's `patrolId` are written only here (see firestore.rules), so the rules the planner in
`handlers/patrols.py` checks always hold.
"""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.erase import commit, delete_op, update_op
from fb import fail, refuse_if_blocked, require_leader, troop
from handlers.membership import InvalidInput
from handlers.patrols import MAX_PATROLS, check_officers, name_taken, parse_patrol, plan_assign, plan_delete

Code = https_fn.FunctionsErrorCode


def _docs(collection) -> dict[str, dict]:
    return {d.id: d.to_dict() for d in collection.stream()}


def _officer(data: dict, key: str, kept=None):
    """The member id sent for an officer, None if cleared, or `kept` (the current one) if the key was not sent."""
    if key not in data:
        return kept
    value = data.get(key)
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise InvalidInput("Choose a Scout from the list.")
    return value


@https_fn.on_call()
def save_patrol(req: https_fn.CallableRequest) -> dict:
    """Create a patrol, or change its name, color, patrol leader and assistant (`patrolId` given)."""
    data = req.data or {}
    require_leader(req, data.get("troopId"))
    t = troop(data["troopId"])
    patrols, members = _docs(t.collection("patrols")), _docs(t.collection("members"))
    patrol_id = data.get("patrolId")
    try:
        fields = parse_patrol(data)
        if patrol_id is not None and "color" not in data and patrol_id in patrols:
            fields["color"] = patrols[patrol_id].get("color")  # a rename alone keeps the color
        if patrol_id is not None and patrol_id not in patrols:
            raise InvalidInput("That patrol was not found.")
        if name_taken(fields["name"], patrol_id, patrols):
            raise InvalidInput("Another patrol already has that name.")
        if patrol_id is None and len(patrols) >= MAX_PATROLS:
            raise InvalidInput(f"A troop can have up to {MAX_PATROLS} patrols.")
        old = patrols.get(patrol_id or "", {})
        leader_id = _officer(data, "leaderId", old.get("leaderId"))
        assistant_id = _officer(data, "assistantId", old.get("assistantId"))
        if patrol_id is not None:
            check_officers(patrol_id, leader_id, assistant_id, members)
        elif leader_id or assistant_id:
            raise InvalidInput("Create the patrol and add Scouts first. Then name the patrol leader.")
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    if patrol_id is None:
        ref = t.collection("patrols").document()
        ref.set({**fields, "leaderId": None, "assistantId": None, "createdAt": firestore.SERVER_TIMESTAMP})
        return {"patrolId": ref.id}
    t.collection("patrols").document(patrol_id).update({**fields, "leaderId": leader_id, "assistantId": assistant_id})
    return {"patrolId": patrol_id}


def _apply(t, plan) -> None:
    ops = []
    for scout_id, patrol_id in plan.member_patrol.items():
        value = patrol_id if patrol_id is not None else firestore.DELETE_FIELD
        ops.append(update_op(t.collection("members").document(scout_id), {"patrolId": value}))
    for patrol_id, fields in plan.patrol_fields.items():
        ops.append(update_op(t.collection("patrols").document(patrol_id), fields))
    commit(ops)


@https_fn.on_call()
def assign_patrol(req: https_fn.CallableRequest) -> dict:
    """Put Scouts in a patrol (`patrolId`), or take them out of any patrol (`patrolId` null)."""
    data = req.data or {}
    require_leader(req, data.get("troopId"))
    t = troop(data["troopId"])
    ids = data.get("scoutIds")
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        raise fail(Code.INVALID_ARGUMENT, "Choose at least one Scout.")
    if data.get("patrolId"):
        for scout_id in dict.fromkeys(ids):
            refuse_if_blocked(
                t, scout_id, "patrols"
            )  # taking a Scout out of a patrol collects nothing, so only adding is blocked
    try:
        plan = plan_assign(ids, data.get("patrolId"), _docs(t.collection("members")), _docs(t.collection("patrols")))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    _apply(t, plan)
    return {"moved": len(plan.member_patrol)}


@https_fn.on_call()
def delete_patrol(req: https_fn.CallableRequest) -> dict:
    """Delete a patrol. Its Scouts stay on the roster with no patrol."""
    data = req.data or {}
    require_leader(req, data.get("troopId"))
    t, patrol_id = troop(data["troopId"]), str(data.get("patrolId") or "-")
    if not t.collection("patrols").document(patrol_id).get().exists:
        raise fail(Code.NOT_FOUND, "That patrol was not found.")
    scouts = plan_delete(patrol_id, _docs(t.collection("members")))
    ops = [update_op(t.collection("members").document(s), {"patrolId": firestore.DELETE_FIELD}) for s in scouts]
    commit([*ops, delete_op(t.collection("patrols").document(patrol_id))])
    return {"deleted": True, "scoutsUnassigned": len(scouts)}

"""Deleting a "Join us" request (lead): by a leader now, or by the retention job after 12 months."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.erase import Op, commit, delete_op, update_op
from fb import fail, require_leader, troop

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def lead_ops(t, lead_id: str) -> list[Op]:
    """Delete the lead. An invite made for this family keeps working, but no longer points at the lead (accepting
    it would otherwise try to mark a deleted lead as joined). The lead goes last, so a failed run can repeat."""
    ops: list[Op] = [
        update_op(invite.reference, {"leadId": firestore.DELETE_FIELD})
        for invite in t.collection("invites").where("leadId", "==", lead_id).stream()
    ]
    return [*ops, delete_op(t.collection("leads").document(lead_id))]


def erase_lead(troop_id: str, lead_id: str) -> int:
    ops = lead_ops(troop(troop_id), lead_id)
    commit(ops)
    return len(ops)


@https_fn.on_call()
def delete_lead(req: https_fn.CallableRequest) -> dict:
    """A leader deletes a family's request to join, with its contact details. Leaders only."""
    data = req.data or {}
    troop_id, lead_id = data.get("troopId"), data.get("leadId")
    require_leader(req, troop_id)
    if not isinstance(lead_id, str) or not lead_id or "/" in lead_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a family to delete.")
    if not troop(troop_id).collection("leads").document(lead_id).get().exists:
        raise fail(Code.NOT_FOUND, "That family isn't in your recruiting list.")
    erase_lead(troop_id, lead_id)
    log.info("lead deleted troop=%s by=leader", troop_id)
    return {"deleted": True}

"""A leader makes a Scout (13 or older, with their own login) the troop's quartermaster, or takes the role away.

Adults get the role through `set_member_roles` and invites like any other. A Scout's roles are otherwise never
edited, so this is the one exception, and it grants nothing but the quartermaster role. A Scout under 13 can't have
a login, so can't hold it.
"""

from __future__ import annotations

import logging
from datetime import date

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.parent_links import stage_roles
from fb import db, fail, require_leader, troop
from handlers.membership import InvalidInput, scout_login_blocker

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call()
def set_scout_quartermaster(req: https_fn.CallableRequest) -> dict:
    """Give a Scout the quartermaster role (`quartermaster: true`) or take it back (`false`)."""
    data = req.data or {}
    troop_id, member_id, on = data.get("troopId"), data.get("memberId"), data.get("quartermaster")
    require_leader(req, troop_id)
    if not isinstance(member_id, str) or not member_id or not isinstance(on, bool):
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout and say whether they are the quartermaster.")
    t = troop(troop_id)

    @firestore.transactional
    def change(tx) -> list[str]:
        member = t.collection("members").document(member_id).get(transaction=tx).to_dict()
        if member is None or member.get("kind") != "scout" or not member.get("uid"):
            raise InvalidInput("Only a Scout who has joined with their own login can be the quartermaster.")
        if on:
            record = t.collection("scoutRecords").document(member_id).get(transaction=tx).to_dict()
            blocker = scout_login_blocker(record, date.today())
            if blocker:
                raise InvalidInput("Only a Scout who is 13 or older can be the quartermaster.")
        roles = ["scout", "quartermaster"] if on else ["scout"]
        stage_roles(tx, t, troop_id, member["uid"], member_id, roles)
        return roles

    try:
        roles = change(db().transaction())
    except InvalidInput as err:
        raise fail(Code.FAILED_PRECONDITION, str(err)) from err
    log.info("scout quartermaster troop=%s on=%s", troop_id, on)
    return {"roles": roles}

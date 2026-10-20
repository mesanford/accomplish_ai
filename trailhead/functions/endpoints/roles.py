"""Leaders change the roles an adult holds in the troop."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.parent_links import stage_link, stage_roles, stage_unlink
from fb import db as get_db
from fb import fail, require_leader, troop, troop_today
from handlers.membership import YPT_ROLES, InvalidInput, parse_ypt
from handlers.roles import (
    NO_LEADER,
    NO_MANAGER,
    loses_all_badge_managers,
    loses_all_leaders,
    new_links,
    parse_roles,
    ypt_blocker,
)

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def _scout_ids(data: dict, scouts: set[str]) -> list[str]:
    chosen = list(dict.fromkeys(data.get("scoutIds") or []))
    if not set(chosen) <= scouts:
        raise InvalidInput("Choose Scouts from the roster.")
    return chosen


@https_fn.on_call()
def set_member_roles(req: https_fn.CallableRequest) -> dict:
    """Set an adult's roles (leader, Scoutmaster, advancement, counselor, committee, treasurer, quartermaster,
    parent). Never a Scout's.

    Roles that sign off or message Scouts need a current Youth Protection date. Adding "parent" links the chosen
    Scouts but records no consent: the parent agrees themselves the next time they open the troop. Removing
    "parent" unlinks every Scout. The troop always keeps at least one leader, and once it has a Scoutmaster or
    advancement chair it keeps at least one of them.
    """
    data = req.data or {}
    troop_id, member_id = data.get("troopId"), data.get("memberId")
    caller = require_leader(req, troop_id)
    if not isinstance(member_id, str) or not member_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a person.")
    try:
        roles = parse_roles(data.get("roles"))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    t = troop(troop_id)

    @firestore.transactional
    def change(tx) -> list[str]:
        member = t.collection("members").document(member_id).get(transaction=tx).to_dict()
        if member is None or member.get("kind") != "adult" or not member.get("uid"):
            raise InvalidInput("Only adults who have joined can have their roles changed.")
        uid = member["uid"]
        access_docs = {d.id: d.to_dict() for d in t.collection("access").get(transaction=tx)}
        target = access_docs.get(uid)
        if target is None or "scout" in target.get("roles", []):
            raise InvalidInput("Only adults who have joined can have their roles changed.")
        old, new = set(target.get("roles", [])), set(roles)
        added, removed = new - old, old - new
        if loses_all_leaders(uid, roles, access_docs):
            raise InvalidInput(NO_LEADER)
        if loses_all_badge_managers(uid, roles, access_docs):
            raise InvalidInput(NO_MANAGER)
        today, expires, extra = troop_today(troop_id), member.get("yptExpiresAt"), {}
        if data.get("yptExpiresAt"):
            expires = parse_ypt(data["yptExpiresAt"], [], today)
            by = "self" if caller["memberId"] == member_id else caller["memberId"]
            extra = {"yptExpiresAt": expires, "yptUpdatedBy": by, "yptUpdatedAt": firestore.SERVER_TIMESTAMP}
        blocker = ypt_blocker(added, expires, member.get("displayName", "This person"), today)
        if blocker:
            raise InvalidInput(blocker)
        scouts = {d.id for d in t.collection("members").where("kind", "==", "scout").get(transaction=tx)}
        chosen = _scout_ids(data, scouts) if "parent" in new else []
        if "parent" in added and not chosen:
            raise InvalidInput("Choose which Scouts this person is a parent of.")
        children = t.collection("members").where("guardianIds", "array_contains", member_id)
        linked = [d.id for d in children.get(transaction=tx)]
        if added or removed or extra:
            stage_roles(tx, t, troop_id, uid, member_id, roles, extra)
        if "parent" in removed:
            stage_unlink(tx, t, uid, member_id, linked, [])
        fresh = new_links(target, chosen)
        stage_link(tx, t, uid, member_id, fresh, pending=True)  # their own consent is still to come
        if YPT_ROLES & old and not YPT_ROLES & new:
            tx.update(t, {"yptCopyMemberIds": firestore.ArrayRemove([member_id])})
        return fresh

    try:
        waiting = change(get_db().transaction())
    except InvalidInput as err:
        raise fail(
            Code.FAILED_PRECONDITION if err.args[0] in (NO_LEADER, NO_MANAGER) else Code.INVALID_ARGUMENT, str(err)
        ) from err
    log.info("roles changed troop=%s now=%s waiting=%d", troop_id, ",".join(roles), len(waiting))
    return {"roles": roles, "pendingScoutIds": waiting}

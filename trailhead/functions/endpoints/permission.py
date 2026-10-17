"""A parent gives permission for their Scout to go to an event, and can add a note only leaders see. A leader can
record a signed paper slip instead."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.signup_core import Code, args, bad, read_all, refs
from fb import db, fail, refuse_if_blocked, require_access, require_leader, require_not_held, troop
from handlers import signups as rules
from handlers.roles import acts_for
from handlers.signups import PAPER, PENDING, SignupError

log = logging.getLogger(__name__)


@https_fn.on_call()
def approve_permission(req: https_fn.CallableRequest) -> dict:
    """Record a parent's permission (who and when). Only a parent linked to this Scout can give it.

    Leaders can't approve for a family unless they are that Scout's parent. `healthNote` is optional, replaces any
    earlier note, and is readable only by leaders (and written only here and at sign-up).
    """
    troop_id, event_id, member_id = args(req)
    data = req.data or {}
    access = require_access(req, troop_id)
    if "parent" not in access.get("roles", []) or not acts_for(access, member_id):
        raise fail(Code.PERMISSION_DENIED, "Only a parent of this Scout can give permission.")
    t = troop(troop_id)
    require_not_held(t, [member_id])
    if str(data.get("healthNote") or "").strip():
        refuse_if_blocked(t, member_id, "health")
    r = refs(t, event_id)
    name = (t.collection("members").document(access["memberId"]).get().to_dict() or {}).get("displayName", "")
    signer, now = {"memberId": access["memberId"], "name": name}, datetime.now(UTC)
    try:
        note = rules.clean_note(data.get("healthNote")) if "healthNote" in data else None
    except SignupError as err:
        raise bad(err) from None

    @firestore.transactional
    def run(tx) -> str:
        event, signups = read_all(tx, r)
        current = signups.get(member_id)
        if current is None or not rules.read_config(event):
            raise fail(Code.NOT_FOUND, "That sign-up was not found.")
        if current["permission"]["state"] == PENDING:
            current = rules.with_permission(current, signer, now)
            signups[member_id] = current
            tx.update(
                r["signups"].document(member_id), {"permission": current["permission"], "status": current["status"]}
            )
            tx.update(r["event"], {"signupCounts": rules.counts(signups)})
        if note is not None:
            if note:
                tx.set(
                    r["notes"].document(member_id), {"note": note, "updatedAt": now, "byMemberId": signer["memberId"]}
                )
            else:
                tx.delete(r["notes"].document(member_id))
        return current["status"]

    status = run(db().transaction())
    log.info("event permission troop=%s event=%s", troop_id, event_id)
    return {"status": status}


@https_fn.on_call()
def record_paper_permission(req: https_fn.CallableRequest) -> dict:
    """A leader records that a signed paper permission slip was received for a Scout's sign-up.

    For a Scout whose parents are not on Forthright. It counts like a parent's approval, and records who recorded it
    and when, with `permission.method` "paper". It is not an in-app approval: `approve_permission` still needs a
    parent of the Scout, and a leader can't approve through it.
    """
    troop_id, event_id, member_id = args(req)
    access = require_leader(req, troop_id)
    t = troop(troop_id)
    r = refs(t, event_id)
    name = (t.collection("members").document(access["memberId"]).get().to_dict() or {}).get("displayName", "")
    signer, now = {"memberId": access["memberId"], "name": name}, datetime.now(UTC)

    @firestore.transactional
    def run(tx) -> str:
        event, signups = read_all(tx, r)
        current = signups.get(member_id)
        problem = rules.paper_blocker(current) if rules.read_config(event) else "That sign-up was not found."
        if problem:
            raise fail(Code.NOT_FOUND if current is None else Code.FAILED_PRECONDITION, problem)
        current = rules.with_permission(current, signer, now, PAPER)
        signups[member_id] = current
        tx.update(r["signups"].document(member_id), {"permission": current["permission"], "status": current["status"]})
        tx.update(r["event"], {"signupCounts": rules.counts(signups)})
        return current["status"]

    status = run(db().transaction())
    log.info("event paper permission troop=%s event=%s", troop_id, event_id)
    return {"status": status}

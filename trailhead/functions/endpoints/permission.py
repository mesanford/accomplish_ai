"""A parent gives permission for their Scout to go to an event, and can add a note only leaders see."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.signup_core import Code, args, bad, read_all, refs
from fb import db, fail, require_access, troop
from handlers import signups as rules
from handlers.roles import acts_for
from handlers.signups import PENDING, SignupError

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

"""Event sign-ups: sign someone up (or put them on the waitlist) and cancel. The server owns every status field."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.signup_core import Code, args, bad, read_all, refs, write_promotions
from endpoints.signup_mail import send_permission_needed, send_promoted
from fb import db, fail, is_leader, require_access, troop
from handlers import signups as rules
from handlers.signups import PENDING, SignupError

log = logging.getLogger(__name__)


def _signer(t, access: dict) -> dict:
    name = (t.collection("members").document(access["memberId"]).get().to_dict() or {}).get("displayName", "")
    return {"memberId": access["memberId"], "name": name}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def sign_up_for_event(req: https_fn.CallableRequest) -> dict:
    """Sign up a Scout (a parent, a leader, or the Scout if 13 or older) or an adult (themselves, or a leader).

    A parent signing up their Scout also gives permission, so they must say so (`permission: true`) when the event
    needs it. If the event is full the person goes on the waitlist. Families can't sign up after the deadline.
    """
    troop_id, event_id, member_id = args(req)
    data = req.data or {}
    access = require_access(req, troop_id)
    t, r = troop(troop_id), refs(troop(troop_id), event_id)
    member = t.collection("members").document(member_id).get().to_dict()
    if member is None:
        raise fail(Code.NOT_FOUND, "That person is not in the troop.")
    now = datetime.now(UTC)
    zone = rules.troop_zone(t.get().to_dict())

    @firestore.transactional
    def run(tx) -> dict:
        event, signups = read_all(tx, r)
        config = rules.read_config(event)
        if config is None:
            raise fail(Code.FAILED_PRECONDITION, "Sign-ups are not open for this event.")
        if member_id in signups:
            raise fail(Code.ALREADY_EXISTS, "Already signed up.")
        try:
            if not is_leader(access) and (closed := rules.closed_reason(config, event, now, zone)):
                raise SignupError(closed)
            record = t.collection("scoutRecords").document(member_id).get().to_dict()
            how = rules.route(access, member_id, member, record, config, now.date())
            answers = rules.clean_answers(config, data.get("answers"), enforce_required=how != "leader")
            note = rules.clean_note(data.get("healthNote")) if how == "parent" else ""
            doc = rules.new_signup(
                member_id, member, how, _signer(t, access), config, answers,
                rules.has_room(signups, config["capacity"]), now, data.get("permission") is True,
            )  # fmt: skip
        except SignupError as err:
            raise bad(err) from None
        signups[member_id] = doc
        tx.set(r["signups"].document(member_id), doc)
        if note:
            tx.set(r["notes"].document(member_id), {"note": note, "updatedAt": now, "byMemberId": access["memberId"]})
        tx.update(r["event"], {"signupCounts": rules.counts(signups)})
        return {"status": doc["status"], "permission": doc["permission"]["state"]}

    result = run(db().transaction())
    if result["permission"] == PENDING:
        send_permission_needed(troop_id, event_id, r["event"].get().to_dict() or {}, [member_id])
    log.info("event signup troop=%s event=%s status=%s", troop_id, event_id, result["status"])
    return {"status": result["status"]}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def cancel_signup(req: https_fn.CallableRequest) -> dict:
    """Take someone off an event. The first person on the waitlist moves up and their family is emailed."""
    troop_id, event_id, member_id = args(req)
    access = require_access(req, troop_id)
    if not rules.can_cancel(access, member_id):
        raise fail(Code.PERMISSION_DENIED, "You can only cancel for yourself or your own Scout.")
    r = refs(troop(troop_id), event_id)

    @firestore.transactional
    def run(tx) -> tuple[dict, dict, list[str]]:
        event, signups = read_all(tx, r)
        if member_id not in signups:
            raise fail(Code.NOT_FOUND, "That person is not signed up.")
        del signups[member_id]
        tx.delete(r["signups"].document(member_id))
        tx.delete(r["notes"].document(member_id))
        return event, signups, write_promotions(tx, r, event, signups)

    event, signups, promoted = run(db().transaction())
    send_promoted(troop_id, event_id, event, promoted, signups)
    return {"promoted": len(promoted)}

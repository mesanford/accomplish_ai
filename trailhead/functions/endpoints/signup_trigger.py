"""Waitlist promotion when a leader raises or removes the capacity, and bringing earlier RSVPs into sign-ups."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn

from endpoints.advancement import Written, _before_after
from endpoints.signup_core import Code, read_all, refs, write_promotions
from endpoints.signup_mail import send_promoted
from fb import db, fail, require_leader, troop
from handlers import signups as rules

log = logging.getLogger(__name__)


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}", secrets=["RESEND_API_KEY"])
def on_event_written_signups(event: Written) -> None:
    """When the capacity of an event goes up (or is removed), let people in from the waitlist."""
    before, after = _before_after(event)
    new, old = rules.read_config(after), rules.read_config(before)
    if new is None or old is None or old["capacity"] == new["capacity"]:
        return
    troop_id, event_id = event.params["troopId"], event.params["eventId"]
    r = refs(troop(troop_id), event_id)

    @firestore.transactional
    def run(tx):
        doc, signups = read_all(tx, r)
        return doc, signups, write_promotions(tx, r, doc, signups)

    try:
        doc, signups, promoted = run(db().transaction())
        send_promoted(troop_id, event_id, doc, promoted, signups)
    except Exception:
        log.exception("waitlist promotion failed")


@https_fn.on_call()
def import_rsvps(req: https_fn.CallableRequest) -> dict:
    """Turn an event's earlier "going" RSVPs into sign-ups. The RSVPs are left in place. Safe to run again.

    Each person is added as if a leader signed them up: a spot if there is room, otherwise the waitlist. A Scout still
    needs a parent's permission if the event asks for it, since an RSVP was never permission.
    """
    data = req.data or {}
    troop_id, event_id = data.get("troopId"), data.get("eventId")
    access = require_leader(req, troop_id)
    if not isinstance(event_id, str) or not event_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose an event.")
    t = troop(troop_id)
    r = refs(t, event_id)
    rsvps = [d.id for d in r["event"].collection("rsvps").stream() if (d.to_dict() or {}).get("going") is True]
    members = {i: (t.collection("members").document(i).get().to_dict() or {}) for i in rsvps}
    now = datetime.now(UTC)
    signer = {"memberId": access["memberId"], "name": ""}

    @firestore.transactional
    def run(tx) -> int:
        event, signups = read_all(tx, r)
        config = rules.read_config(event)
        if config is None:
            raise fail(Code.FAILED_PRECONDITION, "Turn on sign-ups first.")
        added = 0
        for member_id in sorted(rsvps):
            member = members[member_id]
            if member_id in signups or not member:
                continue
            if config["audience"] == ("adults" if member.get("kind") == "scout" else "scouts"):
                continue
            doc = rules.new_signup(
                member_id, member, "leader", signer, config, {}, rules.has_room(signups, config["capacity"]), now
            )
            doc["importedFromRsvp"] = True
            signups[member_id] = doc
            tx.set(r["signups"].document(member_id), doc)
            added += 1
        tx.update(r["event"], {"signupCounts": rules.counts(signups)})
        return added

    return {"imported": run(db().transaction())}

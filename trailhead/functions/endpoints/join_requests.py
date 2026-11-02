"""Finding a troop already on Forthright and asking to join it (see handlers/troop_match.py).

A request lives at troops/{troopId}/joinRequests/{uid}, readable by the troop's leaders only, and is copied to
users/{uid}.joinRequests so the person's home page can show it waiting. Approving adds the person the way an invite
does; declining or cancelling removes both copies.
"""

from __future__ import annotations

import logging
from contextlib import suppress
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn
from google.api_core.exceptions import NotFound

from endpoints.mailer import address_of, app_url, send_all
from endpoints.membership import _access, _membership
from endpoints.notify import deliver
from fb import db, fail, require_leader, require_uid, troop
from handlers import join_emails
from handlers.account import LEADER_ROLES
from handlers.membership import InvalidInput
from handlers.retention import today_local
from handlers.signup_config import troop_zone
from handlers.troop_match import MAX_PENDING, approved_member, matching, new_join_request, unit_key

log = logging.getLogger(__name__)
BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


def _pending(uid: str) -> dict:
    return (db().collection("users").document(uid).get().to_dict() or {}).get("joinRequests") or {}


def _forget(uid: str, troop_id: str) -> None:
    """Remove the request from the person's home page. Never recreates a deleted account's users document."""
    with suppress(NotFound):
        db().collection("users").document(uid).update({f"joinRequests.{troop_id}": firestore.DELETE_FIELD})


@https_fn.on_call()
def find_troops(req: https_fn.CallableRequest) -> dict:
    """Troops with this unit number in this council: only their name, unit, council and district. For each, whether
    the caller is already in it or has already asked to join."""
    uid = require_uid(req)
    data = req.data or {}
    key = unit_key(str(data.get("unitNumber") or ""))
    if not key:
        return {"matches": []}
    docs = {d.id: d.to_dict() for d in db().collection("troops").where("unitKey", "==", key).limit(100).stream()}
    found = matching(docs, data.get("council"))
    mine, pending = (db().collection("users").document(uid).get().to_dict() or {}).get("troops") or {}, _pending(uid)
    for t in found:
        t["member"], t["requested"] = t["troopId"] in mine, t["troopId"] in pending
    return {"matches": found}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def request_to_join(req: https_fn.CallableRequest) -> dict:
    """Ask a troop's leaders to let the caller in. Emails and pushes the troop's leaders."""
    uid = require_uid(req)
    data = req.data or {}
    troop_id = data.get("troopId")
    troop_doc = troop(troop_id).get().to_dict() if troop_id else None
    if not troop_doc or troop_doc.get("retiredAt"):
        raise fail(BAD, "That troop isn't on Forthright any more.")
    t = troop(troop_id)
    if t.collection("access").document(uid).get().exists:
        raise fail(BAD, "You're already in this troop.")
    pending = _pending(uid)
    if troop_id not in pending and len(pending) >= MAX_PENDING:
        raise fail(BAD, "You have 3 requests waiting already. Wait for an answer, or cancel one on your home page.")
    try:
        request = new_join_request(data, uid, address_of(uid), today_local(zone=troop_zone(troop_doc)))
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    now = datetime.now(UTC)
    t.collection("joinRequests").document(uid).set({**request, "requestedAt": now})
    entry = {"name": troop_doc["name"], "unitNumber": troop_doc["unitNumber"], "requestedAt": now}
    db().collection("users").document(uid).set({"joinRequests": {troop_id: entry}}, merge=True)
    leaders = sorted(d.id for d in t.collection("access").stream() if LEADER_ROLES & set(d.to_dict().get("roles", [])))
    name = request["displayName"]
    try:
        email = join_emails.join_requested(name, troop_doc["name"], troop_id, app_url())
        deliver("join_requested", leaders, email, join_emails.join_requested_note(name, troop_id))
    except Exception:
        log.exception("join request email failed")
    return {"requested": True}


@https_fn.on_call()
def cancel_join_request(req: https_fn.CallableRequest) -> dict:
    uid = require_uid(req)
    troop_id = (req.data or {}).get("troopId")
    if not troop_id:
        raise fail(BAD, "Which troop?")
    troop(troop_id).collection("joinRequests").document(uid).delete()
    _forget(uid, troop_id)
    return {"cancelled": True}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def answer_join_request(req: https_fn.CallableRequest) -> dict:
    """A leader approves (with the role they pick, the one asked for by default) or declines a request."""
    data = req.data or {}
    troop_id, uid = data.get("troopId"), data.get("uid")
    require_leader(req, troop_id)
    t = troop(troop_id)
    request_ref = t.collection("joinRequests").document(str(uid or "-"))
    if data.get("approve") is not True:
        snap = request_ref.get()
        if snap.exists:
            request_ref.delete()
            _forget(uid, troop_id)
            troop_doc = t.get().to_dict() or {}
            send_all("join_declined", [address_of(uid)], join_emails.join_declined(troop_doc["name"], app_url()))
        return {"approved": False}

    @firestore.transactional
    def approve(tx) -> tuple[str, dict]:
        snap = request_ref.get(transaction=tx)
        if not snap.exists:
            raise InvalidInput("This request was answered already or withdrawn.")
        troop_doc = t.get(transaction=tx).to_dict()
        access_ref = t.collection("access").document(uid)
        if access_ref.get(transaction=tx).exists:
            tx.delete(request_ref)
            return "", troop_doc
        member = approved_member(snap.to_dict(), data.get("creatorRole"), today_local(zone=troop_zone(troop_doc)))
        member_ref = t.collection("members").document()
        tx.set(member_ref, member)
        tx.set(access_ref, _access(member_ref.id, member["roles"], [], member["yptExpiresAt"]))
        user = {"troops": {troop_id: _membership(troop_doc, member_ref.id, member["roles"])}}
        tx.set(db().collection("users").document(uid), user, merge=True)
        tx.delete(request_ref)
        return member_ref.id, troop_doc

    try:
        member_id, troop_doc = approve(db().transaction())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    _forget(uid, troop_id)
    if member_id:
        send_all("join_approved", [address_of(uid)], join_emails.join_approved(troop_doc["name"], troop_id, app_url()))
    return {"approved": True, "memberId": member_id}

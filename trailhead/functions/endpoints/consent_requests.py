"""Asking a Scout's parents for consent by email: the leader's actions, the answers, and the nightly clean-up.

A Scout under 13 (or of unknown age) can only be consented for by a parent. The troop enters the parents' emails; each
gets a personal link. While nobody has agreed the Scout is "waiting" (`consentHold` on the member) and no other data
is collected. See handlers/consent_requests.py for the data model and schedule.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

from firebase_admin import auth, firestore
from firebase_functions import https_fn

from endpoints.mailer import address_of, app_url, send_all
from endpoints.removal import erase_scout
from fb import db, fail, is_held, require_leader, require_uid, troop
from handlers import email_templates as tpl
from handlers.consent_requests import (
    AGREED,
    DECLINED,
    MAX_PARENTS,
    clean_parents,
    expired,
    needs_parent_consent,
    new_parent,
    new_request,
    outcome,
    settle,
    to_email,
    with_status,
)
from handlers.email_recipients import wants_email
from handlers.membership import INVITE_DAYS, InvalidInput

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def request_ref(t, scout_id: str):
    return t.collection("consentRequests").document(scout_id)


def opted_out(address: str) -> bool:
    """True if this address belongs to a login that turned notification emails off (the email carries a note then)."""
    try:
        uid = auth.get_user_by_email(address).uid
    except Exception:
        return False
    return not wants_email(db().collection("users").document(uid).get().to_dict())


def mint_parents(t, troop_id: str, scout_id: str, entered: list[dict], created_by: str, now: datetime) -> list[dict]:
    """A personal, email-locked parent invite for each person entered. Returns the parent entries for the request."""
    parents = []
    for item in entered:
        code = secrets.token_urlsafe(16)
        parent = new_parent(item["name"], item["email"], code)
        invite = {
            "role": "parent",
            "note": "",
            "expiresAt": now + timedelta(INVITE_DAYS),
            "scoutIds": [scout_id],
            "emailLock": item["email"],
            "requestScoutId": scout_id,
            "requestPid": parent["pid"],
            "createdBy": created_by,
            "createdAt": now,
        }
        t.collection("invites").document(code).set(invite)
        parents.append(parent)
    return parents


def email_parents(t, troop_id: str, scout_id: str, request: dict, pids: list[str], now: datetime) -> tuple[dict, int]:
    """Email these parents of the request and record it. Returns (updated request, how many went out). Sent whatever
    the person's notification choice; a note says why if they turned those off."""
    scout = t.collection("members").document(scout_id).get().to_dict() or {}
    scout_first = tpl.first_name(scout.get("displayName"))
    troop_name = (t.get().to_dict() or {}).get("name", "Your troop")
    sent, parents = 0, []
    for p in request.get("parents", []):
        if p.get("pid") in pids:
            link = f"{app_url()}/join/{troop_id}/{p['code']}"
            email = tpl.consent_request(
                scout_first,
                tpl.first_name(p["name"]),
                troop_name,
                link,
                app_url(),
                reminder=p.get("sentCount", 0) > 0,
                opted_out=opted_out(p["email"]),
            )
            if send_all("consent_request", [p["email"]], email):
                p = {**p, "sentCount": p.get("sentCount", 0) + 1, "lastSentAt": now}
                p.setdefault("firstSentAt", now)
                sent += 1
        parents.append(p)
    request = {**request, "parents": parents}
    request_ref(t, scout_id).set(request)
    return request, sent


def start_request(
    t, troop_id: str, scout_id: str, entered: list[dict], by: str, now: datetime, kind: str, deletes: bool
):
    """Create (or add to) a Scout's request and email the new parents at once."""
    request = request_ref(t, scout_id).get().to_dict() or new_request([], now, kind, deletes)
    fresh = mint_parents(t, troop_id, scout_id, entered, by, now)
    request = {**request, "parents": [*request.get("parents", []), *fresh]}
    return email_parents(t, troop_id, scout_id, request, [p["pid"] for p in fresh], now)


def _leader_scout(req, data) -> tuple[str, str, dict, dict]:
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    access = require_leader(req, troop_id)
    member = troop(troop_id).collection("members").document(str(scout_id or "-")).get().to_dict()
    if not member or member.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    return troop_id, scout_id, access, member


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def set_consent_parents(req: https_fn.CallableRequest) -> dict:
    """A leader enters one or more parent or guardian emails for a Scout, and each is emailed a personal link.

    For a Scout waiting for consent (or an older under-13 Scout with only a leader's confirmation) this asks for the
    first consent. For a Scout who already has consent it invites another parent. Up to four parents in all."""
    data = req.data or {}
    troop_id, scout_id, access, member = _leader_scout(req, data)
    t, now = troop(troop_id), datetime.now(UTC)
    try:
        entered = clean_parents(data.get("parents"))
        existing = request_ref(t, scout_id).get().to_dict() or {}
        have = {p["email"] for p in existing.get("parents", [])}
        entered = [e for e in entered if e["email"] not in have]
        if len(existing.get("parents", [])) + len(entered) > MAX_PARENTS:
            raise InvalidInput(f"A Scout can have at most {MAX_PARENTS} parents or guardians listed.")
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    held = is_held(member)
    if not held and not data.get("invite"):
        record = t.collection("scoutRecords").document(scout_id).get().to_dict()
        consented = bool((t.collection("consents").document(scout_id).get().to_dict() or {}).get("parentConsents"))
        if not consented and needs_parent_consent(record, now.date()):
            t.collection("members").document(scout_id).update({"consentHold": True})
            held = True
    kind = "consent" if held else "invite"
    _, sent = start_request(t, troop_id, scout_id, entered, access["memberId"], now, kind, deletes=False)
    return {"sent": sent, "kind": kind}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def resend_consent_request(req: https_fn.CallableRequest) -> dict:
    """A leader re-sends the email to parents who haven't answered. Shares the schedule: a parent gets at most one
    email every 7 days and four in all, so a click inside that window sends nothing to that parent."""
    data = req.data or {}
    troop_id, scout_id, _, _ = _leader_scout(req, data)
    t, now = troop(troop_id), datetime.now(UTC)
    request = request_ref(t, scout_id).get().to_dict()
    if not request:
        raise fail(Code.FAILED_PRECONDITION, "There is no email request for this Scout. Enter a parent's email first.")
    request = settle(request, now)
    pids = to_email(request, now)
    waiting = [p for p in request["parents"] if p["status"] == "emailed"]
    request, sent = email_parents(t, troop_id, scout_id, request, pids, now)
    return {"sent": sent, "tooSoon": len(waiting) - sent}


@https_fn.on_call()
def cancel_consent_request(req: https_fn.CallableRequest) -> dict:
    """A leader cancels the wait. A Scout added with this request (no records yet) is deleted. An older Scout who
    already has records stays on the roster as "needs parent consent"; only the parents' contact details go."""
    data = req.data or {}
    troop_id, scout_id, _, member = _leader_scout(req, data)
    t = troop(troop_id)
    request = request_ref(t, scout_id).get().to_dict() or {}
    if request.get("deletesScout") and is_held(member):
        erase_scout(troop_id, scout_id, member.get("uid"))
        return {"removed": True}
    drop_request(t, scout_id)
    return {"removed": False}


def drop_request(t, scout_id: str) -> None:
    """Delete a request and the personal invites that came with it (the parents' contact details)."""
    for invite in t.collection("invites").where("requestScoutId", "==", scout_id).stream():
        invite.reference.delete()
    request_ref(t, scout_id).delete()


@https_fn.on_call()
def decline_consent_request(req: https_fn.CallableRequest) -> dict:
    """A parent who opened their emailed link says they don't agree. They stop getting reminders and aren't linked.
    If every listed parent has declined, the waiting Scout is deleted."""
    uid = require_uid(req)
    data = req.data or {}
    troop_id, code = data.get("troopId"), data.get("code")
    if not troop_id or not code:
        raise fail(Code.INVALID_ARGUMENT, "This link is incomplete.")
    t = troop(troop_id)
    snap = t.collection("invites").document(str(code)).get()
    invite = snap.to_dict() if snap.exists else None
    if not invite or not invite.get("requestScoutId"):
        raise fail(Code.INVALID_ARGUMENT, "This link isn't valid.")
    if (address_of(uid) or "").lower() != invite.get("emailLock"):
        raise fail(Code.PERMISSION_DENIED, "Sign in with the email address this link was sent to.")
    scout_id = invite["requestScoutId"]
    request = request_ref(t, scout_id).get().to_dict()
    if not request or outcome(request) == AGREED:
        return {"ok": True, "removed": False}
    request = with_status(request, invite["requestPid"], DECLINED)
    request_ref(t, scout_id).set(request)
    member = t.collection("members").document(scout_id).get().to_dict()
    if outcome(request) == DECLINED and request.get("deletesScout") and is_held(member):
        erase_scout(troop_id, scout_id, (member or {}).get("uid"))
        log.info("consent declined by every parent troop=%s: waiting scout deleted", troop_id)
        return {"ok": True, "removed": True}
    return {"ok": True, "removed": False}


@https_fn.on_call()
def sync_consent_holds(req: https_fn.CallableRequest) -> dict:
    """Mark Scouts who only a parent can consent for (under 13, or age unknown) and have no parent consent yet as
    waiting, and lift the mark from any who have one. Safe to run again; the roster runs it for leaders."""
    troop_id = (req.data or {}).get("troopId")
    require_leader(req, troop_id)
    return {"held": sync_holds(troop(troop_id), datetime.now(UTC))}


def sync_holds(t, now: datetime) -> int:
    members = {d.id: d.to_dict() or {} for d in t.collection("members").where("kind", "==", "scout").stream()}
    records = {d.id: d.to_dict() for d in t.collection("scoutRecords").stream()}
    consents = {d.id: d.to_dict() or {} for d in t.collection("consents").stream()}
    held, batch, ops = 0, db().batch(), 0
    for scout_id, member in members.items():
        if member.get("leftAt"):
            continue
        has_parent = bool(consents.get(scout_id, {}).get("parentConsents"))
        should = not has_parent and needs_parent_consent(records.get(scout_id), now.date())
        held += int(should)
        if should != bool(member.get("consentHold")):
            ref = t.collection("members").document(scout_id)
            batch.update(ref, {"consentHold": True if should else firestore.DELETE_FIELD})
            ops += 1
    if ops:
        batch.commit()
    return held


def expire_requests(t, troop_id: str, now: datetime) -> tuple[int, int]:
    """Retention rule: requests past 30 days, or declined by every parent, delete the waiting Scout (if it was added
    with the request) and the parents' contact details. Returns (due, done)."""
    due = done = 0
    for snap in t.collection("consentRequests").stream():
        request = snap.to_dict() or {}
        member = t.collection("members").document(snap.id).get().to_dict()
        gone = member is None
        dead = request.get("deletesScout") and is_held(member) and outcome(request) == DECLINED
        if not (expired(request, now) or dead or gone):
            continue
        due += 1
        try:
            if request.get("deletesScout") and is_held(member) and not gone and outcome(request) != AGREED:
                erase_scout(troop_id, snap.id, (member or {}).get("uid"))
            else:
                drop_request(t, snap.id)
            done += 1
        except Exception:
            log.exception("consent request clean-up failed troop=%s", troop_id)
    return due, done


def email_waiting_requests(t, troop_id: str, now: datetime) -> int:
    """The daily job's emails for Scouts waiting on a parent: due parents only, nothing once someone agreed."""
    sent = 0
    for snap in t.collection("consentRequests").stream():
        request = settle(snap.to_dict() or {}, now)
        member = t.collection("members").document(snap.id).get().to_dict()
        if request.get("kind") == "consent" and not is_held(member):
            continue  # someone already agreed another way
        pids = to_email(request, now)
        if pids:
            sent += email_parents(t, troop_id, snap.id, request, pids, now)[1]
        elif request != (snap.to_dict() or {}):
            request_ref(t, snap.id).set(request)
    return sent

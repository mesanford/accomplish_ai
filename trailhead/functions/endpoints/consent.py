"""Parental consent records. troops/{t}/consents/{scoutId} is written only here, and read by leaders and the family."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.mailer import address_of, app_url, send_all
from fb import fail, require_access, require_uid, troop
from handlers import email_templates as tpl
from handlers.membership import InvalidInput, check_invite
from handlers.roles import acts_for

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def consent_ref(t, scout_id: str):
    return t.collection("consents").document(scout_id)


def stage_parent_consent(write, t, scout_ids: list[str], entry: dict) -> None:
    """Add a parent's consent to each Scout's record. `write` is a transaction or a batch."""
    for scout_id in scout_ids:
        write.set(consent_ref(t, scout_id), {"parentConsents": firestore.ArrayUnion([entry])}, merge=True)
        # A parent agreeing lifts the hold on a Scout who was waiting for a first consent.
        write.set(t.collection("members").document(scout_id), {"consentHold": firestore.DELETE_FIELD}, merge=True)


def stage_leader_confirmation(write, t, scout_id: str, entry: dict) -> None:
    write.set(consent_ref(t, scout_id), {"leaderConfirmation": entry}, merge=True)


def send_consent_confirmation(troop_id: str, scout_ids: list[str], entry: dict) -> None:
    """Email the parent a copy of what they agreed to ("email plus" in COPPA terms), always, whatever their
    notification choice. Called once, after a parent's consent is saved. `entry` is the saved record: uid, memberId,
    at and notice version. Never raises: the consent is already saved.
    """
    try:
        t = troop(troop_id)
        names = [
            tpl.first_name((t.collection("members").document(s).get().to_dict() or {}).get("displayName"))
            for s in scout_ids
        ]
        when = entry["at"].strftime("%B %d, %Y").replace(" 0", " ")
        troop_name = (t.get().to_dict() or {}).get("name", "Your troop")
        email = tpl.consent_confirmation(names, troop_name, when, entry["version"], app_url())
        address = address_of(entry["uid"])
        send_all("consent_confirmation", [address] if address else [], email)
    except Exception:
        log.error("consent confirmation email failed")


@https_fn.on_call()
def invite_notice(req: https_fn.CallableRequest) -> dict:
    """What the Join page needs before someone accepts: the troop's name, the invite's role, and whether the
    person is already in the troop (the role is then added to their membership)."""
    uid = require_uid(req)
    data = req.data or {}
    troop_id, code = data.get("troopId"), data.get("code")
    if not troop_id or not code:
        raise fail(Code.INVALID_ARGUMENT, "This invite link is incomplete.")
    t = troop(troop_id)
    snap = t.collection("invites").document(code).get()
    try:
        invite = check_invite(snap.to_dict() if snap.exists else None, datetime.now(UTC))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    member = t.collection("access").document(uid).get().exists
    notice = {
        "troopName": (t.get().to_dict() or {}).get("name", "Your troop"),
        "role": invite["role"],
        "alreadyMember": member,
    }
    if invite.get("requestScoutId"):  # an email request for a Scout: the parent can agree or decline
        scout = t.collection("members").document(invite["requestScoutId"]).get().to_dict() or {}
        notice["scoutFirstName"] = tpl.first_name(scout.get("displayName"))
        notice["emailLocked"] = bool(invite.get("emailLock"))
    return notice


@https_fn.on_call()
def withdraw_parent_consent(req: https_fn.CallableRequest) -> dict:
    """A parent withdraws consent for their Scout. That asks the troop to delete the Scout's records.

    Nothing is deleted here. The withdrawal shows leaders a notice until they remove the Scout.
    """
    require_uid(req)
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    if not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    access = require_access(req, troop_id)
    if "parent" not in access.get("roles", []) or not acts_for(access, scout_id):
        raise fail(Code.PERMISSION_DENIED, "Only this Scout's parent or guardian can withdraw consent.")
    ref = consent_ref(troop(troop_id), scout_id)
    if (ref.get().to_dict() or {}).get("withdrawal"):
        return {"ok": True}
    entry = {"uid": req.auth.uid, "memberId": access["memberId"], "at": datetime.now(UTC)}
    ref.set({"withdrawal": entry}, merge=True)
    log.info("consent withdrawn troop=%s scout=%s", troop_id, scout_id)
    return {"ok": True}

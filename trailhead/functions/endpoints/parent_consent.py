"""A leader links themselves to a Scout as a parent, and a parent answers a consent notice a leader asked for."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.consent import send_consent_confirmation, stage_parent_consent
from endpoints.parent_links import stage_guardians, stage_link, stage_roles, stage_unlink
from fb import db, fail, is_leader, require_access
from fb import troop as troop_ref
from handlers.consent import check_parent_consent, parent_consent_entry
from handlers.membership import InvalidInput
from handlers.roles import decline_result, in_order, pending_ids

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call()
def link_self_as_parent(req: https_fn.CallableRequest) -> dict:
    """A leader or advancement chair says an existing Scout is their child. They agree to the parent notice."""
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    access = require_access(req, troop_id)
    if not is_leader(access):
        raise fail(Code.PERMISSION_DENIED, "Only a leader or advancement chair can link themselves to a Scout.")
    if not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    t = troop_ref(troop_id)
    scout = t.collection("members").document(scout_id).get().to_dict()
    if scout is None or scout.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    uid, member_id = req.auth.uid, access["memberId"]
    if scout_id in access.get("scoutIds", []) or member_id in scout.get("guardianIds", []):
        raise fail(Code.FAILED_PRECONDITION, "You're already linked to this Scout as a parent.")
    try:
        check_parent_consent(data)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    consent = parent_consent_entry(uid, member_id, datetime.now(UTC))
    batch = db().batch()
    stage_roles(batch, t, troop_id, uid, member_id, in_order([*access.get("roles", []), "parent"]))
    stage_link(batch, t, uid, member_id, [scout_id])
    stage_parent_consent(batch, t, [scout_id], consent)
    batch.commit()
    send_consent_confirmation(troop_id, [scout_id], consent)
    return {"ok": True}


@https_fn.on_call()
def answer_pending_consent(req: https_fn.CallableRequest) -> dict:
    """A parent whose leader linked them to Scouts agrees to the notice (`consent` true) or declines (false).

    Agreeing records their consent. Declining unlinks them from those Scouts, and drops the parent role if no
    Scout is left. Until they answer, they can't see those Scouts and aren't copied on their messages.
    """
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    pending = pending_ids(access)
    if not pending:
        return {"ok": True, "linked": access.get("scoutIds", [])}
    uid, member_id, t = req.auth.uid, access["memberId"], troop_ref(troop_id)
    batch = db().batch()
    if data.get("consent") is False:
        keep, roles = decline_result(access)
        stage_unlink(batch, t, uid, member_id, pending, keep)
        stage_roles(batch, t, troop_id, uid, member_id, roles)
        batch.commit()
        log.info("parent consent declined troop=%s scouts=%d", troop_id, len(pending))
        return {"ok": True, "linked": keep}
    try:
        check_parent_consent(data)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    consent = parent_consent_entry(uid, member_id, datetime.now(UTC))
    stage_parent_consent(batch, t, pending, consent)
    stage_guardians(batch, t, member_id, pending)  # now the troop roster shows them as the Scouts' parent
    batch.update(t.collection("access").document(uid), {"consentPendingScoutIds": firestore.DELETE_FIELD})
    batch.commit()
    send_consent_confirmation(troop_id, pending, consent)
    return {"ok": True, "linked": access.get("scoutIds", [])}

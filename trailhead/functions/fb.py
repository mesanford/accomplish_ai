"""Shared Firebase setup and helpers for the Cloud Functions."""

from __future__ import annotations

import logging
import os
from functools import cache

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn, options

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES
from handlers.consent_kinds import HOLD_MESSAGE, is_held, kind_blocker
from handlers.roles import acts_for

initialize_app()
options.set_global_options(region="us-central1", max_instances=10)
# Python shows only warnings by default, which hid the info-level audit lines (retention summaries, Scout removals,
# Claude usage). Never log names or message text at any level.
logging.getLogger().setLevel(logging.INFO)


@cache
def db():
    if os.environ.get("FUNCTIONS_EMULATOR") == "true" and os.environ.get("FIRESTORE_EMULATOR_HOST"):
        # The emulator needs no real credentials; the Admin SDK would otherwise demand them.
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import firestore as gcf

        return gcf.Client(project=os.environ["GCLOUD_PROJECT"], credentials=AnonymousCredentials())
    return firestore.client()


def troop(troop_id: str):
    return db().collection("troops").document(troop_id)


def fail(code: https_fn.FunctionsErrorCode, message: str) -> https_fn.HttpsError:
    return https_fn.HttpsError(code, message)


def require_uid(req: https_fn.CallableRequest) -> str:
    if req.auth is None:
        raise fail(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Sign in first.")
    return req.auth.uid


def require_access(req: https_fn.CallableRequest, troop_id: str | None, scout_id: str | None = None) -> dict:
    """The caller's access record for the troop. With `scout_id`, the caller must be able to see that Scout."""
    uid = require_uid(req)
    if not troop_id:
        raise fail(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "Choose a troop.")
    snap = troop(troop_id).collection("access").document(uid).get()
    access = snap.to_dict() if snap.exists else None
    if access is None:
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "You're not a member of this troop.")
    if scout_id and not is_leader(access) and not acts_for(access, scout_id):
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "You can't see this Scout.")
    return access


def require_leader(req: https_fn.CallableRequest, troop_id: str | None) -> dict:
    access = require_access(req, troop_id)
    if not is_leader(access):
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Only troop leaders can do that.")
    return access


def is_leader(access: dict) -> bool:
    return bool(LEADER_ROLES & set(access.get("roles", [])))


def can_manage_badges(access: dict) -> bool:
    """Only the Scoutmaster and the advancement chair change merit badge records (blue cards, paper cards, earlier
    badges). A badge's assigned counselor also signs that badge's requirements, which is checked where it happens."""
    return bool(BADGE_MANAGER_ROLES & set(access.get("roles", [])))


def require_badge_manager(req: https_fn.CallableRequest, troop_id: str | None) -> dict:
    access = require_access(req, troop_id)
    if not can_manage_badges(access):
        raise fail(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "Only the Scoutmaster or advancement chair can change merit badge records.",
        )
    return access


def refuse_if_held(member: dict | None) -> None:
    """Stop any write of Scout data for a Scout who is waiting for parent consent."""
    if is_held(member):
        raise fail(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, HOLD_MESSAGE)


def refuse_if_blocked(t, scout_id: str, kind: str) -> None:
    """Stop a write of one kind of Scout data (accounts, health, patrols, activity, equipment) that must wait."""
    member = t.collection("members").document(scout_id).get().to_dict()
    if not member or member.get("kind") != "scout":
        return
    consent = t.collection("consents").document(scout_id).get().to_dict()
    reason = kind_blocker(member, consent, kind)
    if reason:
        raise fail(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, reason)


def require_not_held(t, scout_ids) -> None:
    """Refuse if any of these Scouts is waiting for parent consent. `t` is the troop reference."""
    for scout_id in dict.fromkeys(s for s in scout_ids if isinstance(s, str) and s):
        refuse_if_held(t.collection("members").document(scout_id).get().to_dict())

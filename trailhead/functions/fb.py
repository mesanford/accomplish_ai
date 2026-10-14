"""Shared Firebase setup and helpers for the Cloud Functions."""

from __future__ import annotations

import os
from functools import cache

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn, options

initialize_app()
options.set_global_options(region="us-central1", max_instances=10)

LEADER_ROLES = {"leader", "advancement"}


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
    if scout_id and not is_leader(access) and scout_id not in access.get("scoutIds", []):
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "You can't see this Scout.")
    return access


def require_leader(req: https_fn.CallableRequest, troop_id: str | None) -> dict:
    access = require_access(req, troop_id)
    if not is_leader(access):
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Only troop leaders can do that.")
    return access


def is_leader(access: dict) -> bool:
    return bool(LEADER_ROLES & set(access.get("roles", [])))

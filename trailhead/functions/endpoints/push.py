"""Sends web push notifications through Firebase Cloud Messaging. Sending never raises: a failed push must not fail the
action that caused it.

`PUSH_MODE=send` sends. Anything else (the default) only logs how many devices it would have used, never tokens or
text. The Functions emulator always logs, and also writes each push to `pushOutbox` so integration tests can see who
would have been notified. That collection is closed to every client. Devices are stored at `users/{uid}/devices/{id}`,
which only the functions in this module write.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Callable

from firebase_admin import firestore, messaging
from firebase_functions import https_fn

from endpoints.mailer import app_url
from fb import db, fail, require_uid
from handlers.push import MAX_DEVICES_PER_USER, MAX_PUSH_USERS, Note, Target, choose, targets

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
# FCM errors that mean the token will never work again, so the device record is deleted.
DEAD = (messaging.UnregisteredError, messaging.SenderIdMismatchError)
SendEach = Callable[[list[messaging.Message]], list[Exception | None]]


def push_mode(env=os.environ) -> str:
    if env.get("FUNCTIONS_EMULATOR") == "true":
        return "log"
    return "send" if env.get("PUSH_MODE") == "send" else "log"


def device_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def devices_ref(uid: str):
    return db().collection("users").document(uid).collection("devices")


def _devices_of(uids: list[str]) -> dict[str, list[tuple[str, str]]]:
    return {u: [(d.id, (d.to_dict() or {}).get("token", "")) for d in devices_ref(u).stream()] for u in uids}


def _message(target: Target, note: Note, base: str) -> messaging.Message:
    """A data message: the app's service worker shows it, so the text is built in one place."""
    return messaging.Message(
        token=target.token,
        data={"title": note.title, "body": note.body, "link": f"{base}{note.path}", "tag": note.kind},
        webpush=messaging.WebpushConfig(headers={"TTL": "86400", "Urgency": "normal"}),
    )


def send_each(messages: list[messaging.Message]) -> list[Exception | None]:
    """The error (or None) for each message, in order."""
    out: list[Exception | None] = []
    for start in range(0, len(messages), 500):
        batch = messaging.send_each(messages[start : start + 500])
        out += [None if r.success else r.exception for r in batch.responses]
    return out


def forget(target: Target) -> None:
    devices_ref(target.uid).document(target.device_id).delete()


def _record_in_outbox(template: str, target: Target, note: Note) -> None:
    db().collection("pushOutbox").add(
        {"template": template, "uid": target.uid, "title": note.title, "body": note.body, "path": note.path}
    )


def push_all(
    template: str,
    uids: list[str],
    note: Note,
    send: SendEach = send_each,
    env=os.environ,
    cap: int = MAX_PUSH_USERS,
) -> int:
    """Push `note` to every device of these logins who want it. Returns how many devices were (or would be) used."""
    try:
        unique = list(dict.fromkeys(uids))
        if not unique:
            return 0
        users = {
            snap.id: snap.to_dict() for snap in db().get_all([db().collection("users").document(u) for u in unique])
        }
        wanted = choose(unique, users, note.kind, cap)  # devices are read only for people who want this push
        chosen = targets(wanted, users, _devices_of(wanted), note.kind, cap)
        if not chosen:
            return 0
        if push_mode(env) != "send":
            log.info("push template=%s mode=log devices=%d", template, len(chosen))
            if env.get("FUNCTIONS_EMULATOR") == "true":
                for target in chosen:
                    _record_in_outbox(template, target, note)
            return len(chosen)
        base = app_url(env)
        errors = send([_message(t, note, base) for t in chosen])
        sent = 0
        for target, err in zip(chosen, errors, strict=True):
            if err is None:
                sent += 1
            elif isinstance(err, DEAD):
                forget(target)
            else:
                log.error("push template=%s failed error=%s", template, type(err).__name__)
        log.info("push template=%s mode=send sent=%d of=%d", template, sent, len(chosen))
        return sent
    except Exception:
        log.error("push template=%s failed before sending", template)
        return 0


def _token(data: dict) -> str:
    token = data.get("token")
    if not isinstance(token, str) or not 20 <= len(token) <= 4096:
        raise fail(Code.INVALID_ARGUMENT, "That device could not be registered.")
    return token


@https_fn.on_call()
def register_push_device(req: https_fn.CallableRequest) -> dict:
    """Remember this device so it gets pushes. Registering again only refreshes the record, and a device last used by
    another login moves to this one, so a shared tablet never keeps the old person's pushes."""
    uid = require_uid(req)
    token = _token(req.data or {})
    try:
        for other in db().collection_group("devices").where("token", "==", token).stream():
            if other.reference.parent.parent.id != uid:
                other.reference.delete()
    except Exception:
        log.error("could not clear this device from other logins")
    existing = {d.id: d.to_dict() or {} for d in devices_ref(uid).stream()}
    this = device_id(token)
    if this not in existing and len(existing) >= MAX_DEVICES_PER_USER:
        oldest = min(existing, key=lambda i: str(existing[i].get("createdAt")))
        devices_ref(uid).document(oldest).delete()
    now = firestore.SERVER_TIMESTAMP
    devices_ref(uid).document(this).set(
        {"token": token, "createdAt": existing.get(this, {}).get("createdAt", now), "seenAt": now}
    )
    return {"deviceId": this}


@https_fn.on_call()
def remove_push_device(req: https_fn.CallableRequest) -> dict:
    """Stop pushes to this device (turning them off, or signing out)."""
    uid = require_uid(req)
    devices_ref(uid).document(device_id(_token(req.data or {}))).delete()
    return {"removed": True}

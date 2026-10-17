"""The public "Ask to join the pilot" form. Anyone can call it, so it validates hard and caps volume."""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.mailer import send_all
from fb import db, fail
from handlers.membership import InvalidInput
from handlers.pilot import DAILY_CAP, PRIVACY_EMAIL, new_pilot_request, operator_notice, usage_key
from handlers.recruiting import Spam

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
SUCCESS = {"ok": True}


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def request_pilot(req: https_fn.CallableRequest) -> dict:
    now = datetime.now(UTC)
    try:
        request = new_pilot_request((req.data or {}).get("form"))
    except Spam:
        return SUCCESS
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err

    usage_ref = db().collection("pilotUsage").document(usage_key(now))
    request_ref = db().collection("pilotRequests").document()

    @firestore.transactional
    def save(tx) -> bool:
        snap = usage_ref.get(transaction=tx)
        count = (snap.to_dict() or {}).get("count", 0) if snap.exists else 0
        if count >= DAILY_CAP:
            return False
        tx.set(usage_ref, {"count": count + 1, "day": now.date().isoformat()})
        tx.set(request_ref, {**request, "status": "new", "createdAt": now})
        return True

    if not save(db().transaction()):
        raise fail(
            https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            "We have had a lot of requests today. Please try again tomorrow.",
        )
    # Telling the operator is best effort: send_all never raises, and the request is already saved.
    send_all("pilot_request", [PRIVACY_EMAIL], operator_notice(request))
    return SUCCESS

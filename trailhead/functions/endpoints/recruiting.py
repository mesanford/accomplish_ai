"""The public Join us form. Anyone can call it, so it validates hard and caps volume."""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, troop
from handlers.membership import InvalidInput
from handlers.recruiting import DAILY_CAP, Spam, new_lead, usage_key

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
SUCCESS = {"ok": True}
CLOSED = "This troop isn't taking new families through the website right now."


@https_fn.on_call()
def submit_interest(req: https_fn.CallableRequest) -> dict:
    data = req.data or {}
    slug = str(data.get("slug") or "").strip().lower()
    site = db().collection("publicSites").document(slug).get() if slug and "/" not in slug else None
    site_doc = site.to_dict() if site is not None and site.exists else None
    if not site_doc or not site_doc.get("troopId"):
        raise fail(https_fn.FunctionsErrorCode.NOT_FOUND, "We couldn't find that troop's page.")
    if not (site_doc.get("recruiting") or {}).get("open"):
        raise fail(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, CLOSED)
    now = datetime.now(UTC)
    try:
        lead = new_lead(data.get("form"))
    except Spam:
        return SUCCESS
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err

    t = troop(site_doc["troopId"])
    usage_ref = t.collection("usage").document(usage_key(now))
    lead_ref = t.collection("leads").document()

    @firestore.transactional
    def save(tx) -> bool:
        snap = usage_ref.get(transaction=tx)
        count = (snap.to_dict() or {}).get("count", 0) if snap.exists else 0
        if count >= DAILY_CAP:
            return False
        tx.set(usage_ref, {"count": count + 1, "day": now.date().isoformat()})
        tx.set(lead_ref, {**lead, "createdAt": now})
        return True

    if not save(db().transaction()):
        raise fail(
            https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            "The troop has had a lot of messages today. Please try again tomorrow.",
        )
    return SUCCESS

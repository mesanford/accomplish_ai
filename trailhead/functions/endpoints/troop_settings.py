"""Saving a troop's settings (see handlers/troop_settings.py). Leaders only.

The troop document is closed to clients, so the details go through this function. A new name or unit number is also
written to every member's `users/{uid}.troops` entry (how the app lists a person's troops) and to the published
website, so nothing shows the old name.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, require_leader, troop
from handlers.membership import InvalidInput
from handlers.troop_settings import parse_settings, renamed

log = logging.getLogger(__name__)


def _copy_name(troop_id: str, t, site: dict, fields: dict) -> int:
    """Write the new name and unit number wherever they're copied. Returns how many documents changed."""
    batch, count = db().batch(), 0
    for access in t.collection("access").stream():
        user = db().collection("users").document(access.id)
        if user.get().exists:
            batch.update(
                user, {f"troops.{troop_id}.name": fields["name"], f"troops.{troop_id}.unitNumber": fields["unitNumber"]}
            )
            count += 1
    if site.get("published") and site.get("slug"):
        public = db().collection("publicSites").document(site["slug"])
        if public.get().exists:
            batch.update(public, {"troopName": fields["name"], "unitNumber": fields["unitNumber"]})
            count += 1
    batch.commit()
    return count


@https_fn.on_call()
def save_troop_settings(req: https_fn.CallableRequest) -> dict:
    """Save the troop's name, unit number, council, district, chartered organization, meeting place, time zone and
    key positions."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    t = troop(troop_id)
    adults = {d.id for d in t.collection("members").where("kind", "==", "adult").stream()}
    try:
        fields = parse_settings(data, adults)
    except InvalidInput as err:
        raise fail(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, str(err)) from err
    before = t.get().to_dict() or {}
    t.update({**fields, "settingsUpdatedAt": firestore.SERVER_TIMESTAMP})
    copies = _copy_name(troop_id, t, before.get("site") or {}, fields) if renamed(before, fields) else 0
    log.info("troop settings saved renamed=%s copies=%d", copies > 0, copies)
    return {"saved": True}

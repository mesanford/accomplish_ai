"""An adult enters their own new Youth Protection expiry date, one troop at a time.

Clients can't write `yptExpiresAt` (the rules refuse it), so this is the only path besides a leader's Change roles.
The date goes on both the member and the access record, with who entered it and when.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, require_access, troop, troop_today
from handlers.membership import InvalidInput
from handlers.ypt_dates import SELF, parse_own_date

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call()
def set_my_ypt(req: https_fn.CallableRequest) -> dict:
    """`{troopId, yptExpiresAt: "YYYY-MM-DD"}`: set the caller's own training date in that troop."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    if "scout" in access.get("roles", []):
        raise fail(Code.PERMISSION_DENIED, "Only adults have Youth Protection training.")
    try:
        expires = parse_own_date(data.get("yptExpiresAt"), troop_today(troop_id))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    t = troop(troop_id)
    member_ref = t.collection("members").document(access["memberId"])
    if (member_ref.get().to_dict() or {}).get("kind") != "adult":
        raise fail(Code.NOT_FOUND, "You're not an adult member of this troop.")
    fields = {"yptExpiresAt": expires, "yptUpdatedBy": SELF, "yptUpdatedAt": firestore.SERVER_TIMESTAMP}
    batch = db().batch()
    batch.update(member_ref, fields)
    batch.update(t.collection("access").document(req.auth.uid), fields)
    batch.commit()
    log.info("ypt date entered by the adult")
    return {"yptExpiresAt": expires.date().isoformat()}

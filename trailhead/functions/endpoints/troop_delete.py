"""Deleting a troop from Troop settings. Only a troop that nobody else uses can be deleted this way (see
`delete_blocker`): usually a copy someone made by mistake before finding the troop was already on Forthright."""

from __future__ import annotations

import logging

from firebase_functions import https_fn

from endpoints.retention_troop import erase_troop
from fb import fail, require_leader, troop
from handlers.troop_match import delete_blocker

log = logging.getLogger(__name__)


@https_fn.on_call(timeout_sec=300, memory=512)
def delete_troop(req: https_fn.CallableRequest) -> dict:
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    if data.get("confirm") is not True:
        raise fail(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "Confirm that you want to delete the troop.")
    uid = req.auth.uid
    t = troop(troop_id)
    logins = [d.id for d in t.collection("access").list_documents()]
    members = [d.to_dict() for d in t.collection("members").stream()]
    ledger = t.collection("ledger").count().get()[0][0].value
    blocker = delete_blocker(uid, logins, members, ledger)
    if blocker:
        raise fail(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, blocker)
    docs, files = erase_troop(troop_id, t, t.get().to_dict() or {})
    t.delete()
    log.warning("troop deleted by its only leader troop=%s docs=%d files=%d", troop_id, docs + 1, files)
    return {"deleted": True}

"""Tracking when a troop was last used, and a leader marking a Scout as having left the troop.

Last activity: the app calls `record_activity` when a signed-in member opens a troop, at most once a day per
browser. The function writes `troops/{t}.lastActiveAt` at most once a day per troop (it skips the write when the
stored date is already today). The retention job deletes a troop 18 months after its last activity.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import fail, require_access, require_leader, troop
from handlers.retention import local_date, today_local

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call()
def record_activity(req: https_fn.CallableRequest) -> dict:
    """Note that someone in this troop used the app today. Any member may call it."""
    troop_id = (req.data or {}).get("troopId")
    require_access(req, troop_id)
    t = troop(troop_id)
    if local_date((t.get().to_dict() or {}).get("lastActiveAt")) == today_local():
        return {"recorded": False}
    t.update({"lastActiveAt": firestore.SERVER_TIMESTAMP})
    return {"recorded": True}


@https_fn.on_call()
def mark_scout_left(req: https_fn.CallableRequest) -> dict:
    """Record that a Scout has left the troop (`left: true`), or undo it (`left: false`). Leaders only.

    The time is the server's, so it can't be backdated: the records are deleted 12 months after it. Marking a
    Scout who is already marked keeps the first date.
    """
    data = req.data or {}
    troop_id, scout_id, left = data.get("troopId"), data.get("scoutId"), data.get("left")
    require_leader(req, troop_id)
    if not isinstance(scout_id, str) or not scout_id or not isinstance(left, bool):
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout and whether they have left.")
    ref = troop(troop_id).collection("members").document(scout_id)
    member = ref.get().to_dict()
    if member is None or member.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    if left and member.get("leftAt") is None:
        ref.update({"leftAt": firestore.SERVER_TIMESTAMP})
    elif not left and "leftAt" in member:
        ref.update({"leftAt": firestore.DELETE_FIELD})
    left_at = (ref.get().to_dict() or {}).get("leftAt")
    log.info("scout left troop=%s left=%s", troop_id, left)
    return {"left": left_at is not None, "leftAt": left_at.isoformat() if left_at else None}

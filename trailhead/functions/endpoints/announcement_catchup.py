"""Letting people who join later read recent announcements. An announcement's readers are fixed when it is posted,
so when someone joins, gains a role, or is linked to a Scout, this adds them to the announcements from the last
`CATCH_UP_MONTHS` whose audience now includes them. A Scoutmaster or advancement chair is added to every one, because
they can edit or delete any post. Older posts stay with the people who were there."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import firestore_fn
from google.api_core.exceptions import NotFound

from endpoints.advancement import Written, _before_after
from endpoints.announcements import _docs, _signups
from fb import troop
from handlers import announcement_audience as aud
from handlers.announcements import CATCH_UP_MONTHS
from handlers.retention import add_months

log = logging.getLogger(__name__)
WATCHED = ("memberId", "roles", "scoutIds", "consentPendingScoutIds")


def catch_up(troop_id: str, uid: str, now: datetime | None = None) -> int:
    """Add `uid` to recent announcements it is now in the audience of. Returns how many were added."""
    t = troop(troop_id)
    now = now or datetime.now(UTC)
    since = datetime.combine(add_months(now.date(), -CATCH_UP_MONTHS), now.timetz())
    recent = [d for d in t.collection("announcements").where("createdAt", ">=", since).stream()]
    missing = [d for d in recent if uid not in (d.to_dict().get("readerUids") or [])]
    if not missing:
        return 0
    members, logins = _docs(t.collection("members")), _docs(t.collection("access"))
    added = 0
    manager = aud.is_post_manager(logins.get(uid))  # a Scoutmaster or advancement chair reads every recent post
    for snap in missing:
        spec = snap.to_dict().get("audience") or {}
        try:
            signups = _signups(t, spec["eventId"])[0] if spec.get("type") == "event" else set()
            in_audience = uid in aud.resolve(spec, members, logins, signups).uids
        except Exception:  # a deleted event or an odd old audience: leave that post as it was
            in_audience = False
        if in_audience or manager:
            with_reader = {"readerUids": firestore.ArrayUnion([uid])}
            try:
                snap.reference.update(with_reader)
                added += 1
            except NotFound:
                continue
    log.info("announcements catch_up troop=%s added=%d", troop_id, added)
    return added


@firestore_fn.on_document_written(document="troops/{troopId}/access/{uid}")
def on_access_written_announcements(event: Written) -> None:
    before, after = _before_after(event)
    if after is None or all((before or {}).get(k) == after.get(k) for k in WATCHED):
        return
    catch_up(event.params["troopId"], event.params["uid"])

"""Recording advancement a Scout earned before joining Trailhead."""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import can_manage_badges, db, fail, require_leader, require_not_held, troop
from handlers.membership import InvalidInput
from handlers.prior import check_prior, completed_doc, keep_existing, partial_doc
from handlers.retention import today_local
from trailhead_core.catalog import badge_version, load_catalog

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


@https_fn.on_call()
def record_prior_advancement(req: https_fn.CallableRequest) -> dict:
    """Leaders enter ranks a Scout earned earlier. The Scoutmaster and advancement chair also enter merit badges
    earned earlier, plus partly finished badges.

    Badges already completed or started in Trailhead are left alone and reported back as skipped.
    """
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    access = require_leader(req, troop_id)
    if (data.get("badges") or data.get("partials")) and not can_manage_badges(access):
        raise fail(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "Only the Scoutmaster or advancement chair can record merit badges. Leaders can still record ranks.",
        )
    t = troop(troop_id)
    require_not_held(t, [scout_id])
    record_ref = t.collection("scoutRecords").document(scout_id or "-")
    record = record_ref.get().to_dict()
    if record is None:
        raise fail(https_fn.FunctionsErrorCode.NOT_FOUND, "That Scout isn't on the roster.")
    catalog = load_catalog()
    try:
        plan = check_prior(data, record, catalog, today_local())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err

    version = badge_version()
    member_id = access["memberId"]
    progress = t.collection("progress")
    batch = db().batch()
    written, skipped = 0, []
    items = [(b, completed_doc(scout_id, b, version, d, member_id)) for b, d in plan.completed.items()]
    items += [(b, partial_doc(scout_id, b, version, d, labels, member_id)) for b, (d, labels) in plan.partials.items()]
    for badge_id, doc in items:
        ref = progress.document(f"{scout_id}_{badge_id}")
        if keep_existing(ref.get().to_dict()):
            skipped.append(catalog.badges[badge_id].name)
            continue
        batch.set(ref, doc)
        written += 1

    if plan.rank_dates:
        current = record.get("currentRankId", "scout")
        newest = plan.current_rank_id
        update = {f"rankDates.{r}": d for r, d in plan.rank_dates.items()}
        update["priorRankIds"] = firestore.ArrayUnion(list(plan.rank_dates))
        if catalog.ranks[newest].order >= catalog.ranks.get(current, catalog.ranks["scout"]).order:
            update["currentRankId"] = newest
        batch.update(record_ref, update)
    batch.commit()
    return {"ranks": len(plan.rank_dates), "badges": written, "skipped": skipped}

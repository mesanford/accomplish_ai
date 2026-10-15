"""Recording paper blue cards signed by counselors outside Trailhead."""

from __future__ import annotations

from datetime import UTC, date, datetime

from firebase_functions import https_fn

from fb import db, fail, require_leader, troop
from handlers.membership import InvalidInput
from handlers.paper_cards import already_started, card_doc, check_paper_card, progress_doc, signoff_doc
from trailhead_core.catalog import badge_version, load_catalog

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


@https_fn.on_call()
def record_paper_blue_card(req: https_fn.CallableRequest) -> dict:
    """A leader enters a paper blue card: the card, each signed requirement and the progress, in one batch."""
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    access = require_leader(req, troop_id)
    t = troop(troop_id)
    record = t.collection("scoutRecords").document(scout_id or "-").get().to_dict()
    if record is None:
        raise fail(https_fn.FunctionsErrorCode.NOT_FOUND, "That Scout isn't on the roster.")
    catalog = load_catalog()
    try:
        plan = check_paper_card(data, record, catalog, date.today())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err

    card_ref = t.collection("blueCards").document(f"{scout_id}_{plan.award_id}")
    progress_ref = t.collection("progress").document(f"{scout_id}_{plan.award_id}")
    if already_started(card_ref.get().to_dict(), progress_ref.get().to_dict()):
        raise fail(
            https_fn.FunctionsErrorCode.ALREADY_EXISTS,
            f"This Scout already has a {catalog.badges[plan.award_id].name} blue card or finished badge in "
            "Forthright. Use that card instead.",
        )

    now, version = datetime.now(UTC), badge_version()
    batch = db().batch()
    signoff_ids = {}
    for label in plan.requirements:
        ref = t.collection("signoffs").document()
        signoff_ids[label] = ref.id
        batch.set(ref, signoff_doc(scout_id, plan, label, version, req.auth.uid, now))
    batch.set(progress_ref, progress_doc(scout_id, plan, version, signoff_ids, now))
    batch.set(card_ref, card_doc(scout_id, plan, version, access["memberId"], now))
    batch.commit()
    return {"cardId": card_ref.id, "requirements": len(plan.requirements), "complete": bool(plan.completed_on)}

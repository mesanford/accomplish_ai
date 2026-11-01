"""plan_action ops for the rest of a plan's life: cancel its trip, notice changes made on the event page, close it
and delete it. See endpoints/plans.py.
"""

from __future__ import annotations

from firebase_admin import firestore

from endpoints.plans_events import SEG, seg_event
from endpoints.plans_shared import Ctx, bad
from fb import db, troop_today
from handlers import plans_core as core
from handlers import plans_publish as pub
from handlers.membership import InvalidInput

NOW = firestore.SERVER_TIMESTAMP


def cancel_plan(ctx: Ctx) -> dict:
    """Cancel the trip: its upcoming event is cancelled (families are told by the usual alert) and the plan closes."""
    try:
        note = core.text(ctx.data.get("note"), 200, "note")
    except InvalidInput as err:
        raise bad(err) from err
    ref, live = seg_event(ctx)
    cancelled = False
    today = troop_today(ctx.troop_id).isoformat()
    if live and live.get("cancelled") is not True and str(live.get("start", "")) >= today:
        ref.update({"cancelled": True, **({"cancelNote": note} if note else {})})
        cancelled = True
    ctx.plan_ref.update({"status": "cancelled", "updatedAt": NOW})
    return {"eventCancelled": cancelled}


def reconcile(ctx: Ctx) -> dict:
    """Notice what happened to the event on the event page: deleted, cancelled, or details changed since publish."""
    ref, live = seg_event(ctx)
    if ref is None:
        return {"state": None}
    snap = (ctx.plan.get("publishedSnapshot") or {}).get(SEG)
    state = "deleted" if live is None else ("cancelled" if live.get("cancelled") is True else "live")
    found = {"state": state, "drift": pub.drift(live, snap) if live else []}
    if (ctx.plan.get("eventState") or {}).get(SEG) != found:
        ctx.plan_ref.update({f"eventState.{SEG}": found})
    return found


def close(ctx: Ctx) -> dict:
    ctx.plan_ref.update({"status": "closed", "updatedAt": NOW})
    return {"closed": True}


def delete_plan(ctx: Ctx) -> dict:
    """Delete a plan and everything under it. Its event, if any, stays on the calendar as an ordinary event."""
    ref, live = seg_event(ctx)
    batch = db().batch()
    if live:
        batch.update(ref, {"planId": firestore.DELETE_FIELD, "planSegmentId": firestore.DELETE_FIELD})
    for sub in ("options", "milestones", "acks", "private"):
        for doc in ctx.plan_ref.collection(sub).list_documents():
            batch.delete(doc)
    batch.delete(ctx.t.collection("planSummaries").document(ctx.plan_id))
    batch.delete(ctx.plan_ref)
    batch.commit()
    return {"deleted": True}

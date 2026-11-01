"""plan_action ops that connect a plan to events: start one from an event, link, unlink and publish.

A published plan's event is an ordinary event that also carries `planId` and `planSegmentId` (server only). Creating
it sends no alert. A re-publish changes only the fields a leader ticks, and the existing alert trigger tells
families once, as it does for any change a leader makes on the event page.
"""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.plans_edit import new_plan
from endpoints.plans_shared import Ctx, bad, refresh_intent, stamp, write_summary
from fb import db, fail
from handlers import plans_core as core
from handlers import plans_publish as pub
from handlers import plans_templates as tpl
from handlers.membership import InvalidInput
from trailhead_core.plan_checks import blockers

Code = https_fn.FunctionsErrorCode
NOW = firestore.SERVER_TIMESTAMP
SEG = "s1"


def seg_event(ctx: Ctx):
    """(event ref, event dict or None) for the plan's segment, or (None, None) if it was never published."""
    event_id = (ctx.plan.get("eventIds") or {}).get(SEG)
    if not event_id:
        return None, None
    ref = ctx.t.collection("events").document(event_id)
    return ref, ref.get().to_dict()


def _link_fields(plan_ref) -> dict:
    return {"planId": plan_ref.id, "planSegmentId": SEG}


def create_from_event(ctx: Ctx) -> dict:
    """Start a plan from an existing event (a past trip to repeat, or one already on the calendar), linked to it."""
    ref = ctx.t.collection("events").document(str(ctx.data.get("eventId") or "-"))
    event = ref.get().to_dict()
    if not event:
        raise fail(Code.NOT_FOUND, "That event was not found.")
    if event.get("planId"):
        raise fail(Code.FAILED_PRECONDITION, "That event already belongs to a plan.")
    try:
        fields = core.core(pub.core_from_event(event))
    except InvalidInput as err:
        raise bad(err) from err
    linked = {"status": "published", "eventIds": {SEG: ref.id}, "publishedSnapshot": {SEG: pub.snapshot(event)}}
    plan_id = new_plan(ctx, {**fields, **linked}, tpl.template_milestones(fields["kind"]), ((ref, _link_fields),))
    write_summary(ctx)
    return {"planId": plan_id}


def link_event(ctx: Ctx) -> dict:
    """Attach an existing event to a plan that has none yet. The plan's details are not written to it."""
    current, live = seg_event(ctx)
    if live:
        raise fail(Code.FAILED_PRECONDITION, "This plan already has an event. Unlink it first.")
    ref = ctx.t.collection("events").document(str(ctx.data.get("eventId") or "-"))
    event = ref.get().to_dict()
    if not event:
        raise fail(Code.NOT_FOUND, "That event was not found.")
    if event.get("planId"):
        raise fail(Code.FAILED_PRECONDITION, "That event already belongs to a plan.")
    batch = db().batch()
    batch.update(ref, _link_fields(ctx.plan_ref))
    batch.update(
        ctx.plan_ref,
        {
            "eventIds": {SEG: ref.id},
            "publishedSnapshot": {SEG: pub.snapshot(event)},
            "status": "published",
            "updatedAt": NOW,
        },
    )
    batch.commit()
    ctx.plan = {**ctx.plan, "eventIds": {SEG: ref.id}}
    write_summary(ctx)
    return {"eventId": ref.id}


def unlink_event(ctx: Ctx) -> dict:
    """Detach the event: it stays on the calendar as an ordinary event, and the plan goes back to planning."""
    ref, live = seg_event(ctx)
    batch = db().batch()
    if live:
        batch.update(ref, {"planId": firestore.DELETE_FIELD, "planSegmentId": firestore.DELETE_FIELD})
    status = "decided" if ctx.plan.get("decision") else "draft"
    batch.update(ctx.plan_ref, {"eventIds": {}, "publishedSnapshot": {}, "status": status, "updatedAt": NOW})
    batch.commit()
    ctx.plan = {**ctx.plan, "eventIds": {}}
    write_summary(ctx)
    return {"unlinked": bool(live)}


def _venue(ctx: Ctx) -> tuple[str | None, dict]:
    """Why the chosen place isn't known to be secured (or None), and the record to store if a leader confirms."""
    option_id = (ctx.plan.get("decision") or {}).get("optionId")
    option = ctx.plan_ref.collection("options").document(option_id).get().to_dict() if option_id else None
    problem = pub.availability_problem(option, datetime.now(UTC))
    if problem and ctx.data.get("confirmedWithVenue") is not True and ctx.data.get("dryRun") is not True:
        raise fail(Code.FAILED_PRECONDITION, f"{problem} Confirm with the venue, then tick the box to publish.")
    return problem, ({"confirmedWithVenue": stamp(ctx)} if problem else {})


def publish(ctx: Ctx) -> dict:
    """Create the plan's event, or change the ticked fields of the one it made. `dryRun` shows what would happen."""
    seg = (ctx.plan.get("segments") or [{}])[0]
    if ctx.plan.get("status") in ("cancelled", "closed"):
        raise fail(Code.FAILED_PRECONDITION, "This plan is closed. Clone it to plan the trip again.")
    if not seg.get("start"):
        raise fail(Code.FAILED_PRECONDITION, "Add the trip's dates before publishing.")
    blocked = blockers(refresh_intent(ctx))
    if blocked:
        raise fail(Code.FAILED_PRECONDITION, f"Before publishing, sort out or acknowledge: {', '.join(blocked)}.")
    problem, venue = _venue(ctx)
    dry = ctx.data.get("dryRun") is True
    ref, live = seg_event(ctx)
    if live:
        snap = (ctx.plan.get("publishedSnapshot") or {}).get(SEG) or {}
        if dry:
            return {
                "mode": "update",
                "eventId": ref.id,
                "diff": pub.diff(ctx.plan, live, snap),
                "venueProblem": problem,
            }
        fields = [f for f in ctx.data.get("fields") or [] if isinstance(f, str)]
        update = pub.update_for(ctx.plan, live, fields)
        if update:
            ref.update({k: firestore.DELETE_FIELD if v is None else v for k, v in update.items()})
            new_snap = {**snap, **{k: pub.norm(k, v) for k, v in update.items()}}
            ctx.plan_ref.update({f"publishedSnapshot.{SEG}": new_snap, "updatedAt": NOW, **venue})
        write_summary(ctx)
        return {"eventId": ref.id, "updated": sorted(update)}
    event = pub.new_event(ctx.plan_id, ctx.plan)
    if dry:
        return {"mode": "create", "event": event, "venueProblem": problem}
    if ref is not None:  # its event was deleted on the event page; publishing makes a new one
        ctx.plan_ref.update({f"eventIds.{SEG}": firestore.DELETE_FIELD})
    target = ctx.t.collection("events").document(pub.event_id_for(ctx.plan_id, SEG))

    @firestore.transactional
    def claim(tx) -> str:
        current = ctx.plan_ref.get(transaction=tx).to_dict() or {}
        existing = (current.get("eventIds") or {}).get(SEG)
        if existing:
            return existing  # a retry: the first call already made it
        if not target.get(transaction=tx).exists:
            tx.create(target, event)
        tx.update(
            ctx.plan_ref,
            {
                f"eventIds.{SEG}": target.id,
                f"publishedSnapshot.{SEG}": pub.snapshot(event),
                "status": "published",
                "publishedAt": NOW,
                "updatedAt": NOW,
                **venue,
            },
        )
        return target.id

    event_id = claim(db().transaction())
    ctx.plan = {**ctx.plan, "eventIds": {SEG: event_id}}
    write_summary(ctx)
    return {"eventId": event_id, "created": True}

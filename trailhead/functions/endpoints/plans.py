"""Event planning: one callable, plan_action, for everything a plan does that clients may not write directly.

A plan (troops/{t}/eventPlans/{p}) takes a trip from research to a shortlist, a decision and a plan, then publishes
it as an ordinary event. Clients write only a plan's options (research cards); the plan itself, its milestones,
acknowledgements and adult-only panel are written here, so roles, dates and checks are always applied the same way.
Each op names who may call it (see plans_shared.allowed).
"""

from __future__ import annotations

import logging

from firebase_functions import https_fn

from endpoints import plans_edit as edit
from endpoints import plans_events as events
from endpoints import plans_lifecycle as life
from endpoints import plans_milestones as steps
from endpoints import plans_options as cards
from endpoints.plans_shared import EDIT, LEADER, PLANNER, READ, SHARE, Ctx, allowed, refuse_unless_consented
from fb import fail, require_access, troop

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode

# op: (function, who may call it, whether it needs an existing plan)
OPS = {
    "create_from_template": (edit.create_from_template, SHARE, False),
    "create_from_event": (events.create_from_event, LEADER, False),
    "clone_plan": (edit.clone_plan, PLANNER, True),
    "update_core": (edit.update_core, EDIT, True),
    "set_staffing": (edit.set_staffing, EDIT, True),
    "update_brief": (edit.update_brief, SHARE, True),
    "set_trip_lead": (edit.set_trip_lead, PLANNER, True),
    "record_decision": (edit.record_decision, SHARE, True),
    "update_private": (edit.update_private, EDIT, True),
    "upsert_milestone": (steps.upsert_milestone, EDIT, True),
    "delete_milestone": (steps.delete_milestone, EDIT, True),
    "complete_milestone": (steps.complete_milestone, SHARE, True),
    "check_intent": (edit.check_intent, SHARE, True),
    "save_option": (cards.save_option, SHARE, True),
    "set_availability": (cards.set_availability, SHARE, True),
    "like_option": (cards.like_option, SHARE, True),
    "pin_option": (cards.pin_option, SHARE, True),
    "delete_option": (cards.delete_option, SHARE, True),
    "acknowledge": (edit.acknowledge, LEADER, True),
    "publish": (events.publish, LEADER, True),
    "link_event": (events.link_event, LEADER, True),
    "unlink_event": (events.unlink_event, LEADER, True),
    "cancel_plan": (life.cancel_plan, LEADER, True),
    "reconcile": (life.reconcile, READ, True),
    "close": (life.close, PLANNER, True),
    "delete_plan": (life.delete_plan, LEADER, True),
}


@https_fn.on_call()
def plan_action(req: https_fn.CallableRequest) -> dict:
    data = req.data or {}
    troop_id, op = data.get("troopId"), data.get("op")
    access = require_access(req, troop_id)
    if op not in OPS:
        raise fail(Code.INVALID_ARGUMENT, "That isn't something a plan can do.")
    fn, level, needs_plan = OPS[op]
    ctx = Ctx(troop_id=troop_id, uid=req.auth.uid, access=access, t=troop(troop_id), data=data)
    if needs_plan:
        ctx.plan_ref = ctx.t.collection("eventPlans").document(str(data.get("planId") or "-"))
        ctx.plan = ctx.plan_ref.get().to_dict() or {}
        if not ctx.plan:
            raise fail(Code.NOT_FOUND, "That plan was not found.")
    if not allowed(level, access, ctx.plan, ctx.uid):
        who = {LEADER: "troop leaders", PLANNER: "leaders and committee members"}.get(level, "the plan's planners")
        if level == SHARE:
            who = "the troop's planners and Scouts"
        raise fail(Code.PERMISSION_DENIED, f"Only {who} can do that.")
    if level == SHARE:
        refuse_unless_consented(ctx)
    result = fn(ctx)
    log.info("plan_action op=%s", op)
    return result

"""plan_action ops that create and edit a plan before (and after) it is published. See endpoints/plans.py."""

from __future__ import annotations

from firebase_admin import firestore

from endpoints.plans_shared import Ctx, bad, refresh_intent, require_adults, rules, stamp, write_summary
from fb import db
from handlers import plans_brief
from handlers import plans_core as core
from handlers import plans_templates as tpl
from handlers.membership import InvalidInput

NOW = firestore.SERVER_TIMESTAMP


def plan_start(plan: dict) -> str | None:
    return ((plan.get("segments") or [{}])[0]).get("start")


def new_plan(ctx: Ctx, fields: dict, milestones: list[dict], also: tuple = ()) -> str:
    """Write a new plan with its milestones, and run the readiness checks once. `also` is (ref, fields) updates to
    make in the same batch, given the new plan's reference."""
    ref = ctx.t.collection("eventPlans").document()
    plan = {
        **fields,
        "status": fields.get("status", "draft"),
        "staffing": fields.get("staffing") or core.staffing({}),
        "decision": None,
        "eventIds": fields.get("eventIds", {}),
        "publishedSnapshot": fields.get("publishedSnapshot", {}),
        "tripLeadUid": None,
        "tripLeadMemberId": None,
        "createdByMemberId": ctx.member_id,
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    batch = db().batch()
    batch.set(ref, plan)
    start = plan_start(plan)
    for m in milestones:
        batch.set(ref.collection("milestones").document(), {**m, "dueOn": tpl.due_on(m, start), "done": None})
    for other, update in also:
        batch.update(other, update(ref))
    batch.commit()
    ctx.plan_ref, ctx.plan = ref, plan
    refresh_intent(ctx)
    return ref.id


def create_from_template(ctx: Ctx) -> dict:
    kind = ctx.data.get("kind") if ctx.data.get("kind") in core.KINDS else "other"
    log_kind = tpl.TEMPLATES[kind]["logKind"]
    try:
        fields = core.core({"title": ctx.data.get("title"), "kind": kind, "segments": [{"logKind": log_kind}]})
    except InvalidInput as err:
        raise bad(err) from err
    return {"planId": new_plan(ctx, fields, tpl.template_milestones(kind))}


def clone_plan(ctx: Ctx) -> dict:
    """A fresh draft from an earlier plan: same place, fee, notes, options and timeline, with no dates or people."""
    src, src_ref = ctx.plan, ctx.plan_ref
    seg = {**(src.get("segments") or [{}])[0], "start": None, "endDate": None, "healthConfirmed": False}
    title = f"Copy of {src.get('title', '')}"[: core.MAX_TITLE]
    try:
        fields = core.core({**src, "title": title, "segments": [seg], "targetWindow": {}})
        fields["brief"] = plans_brief.brief(src.get("brief")) if src.get("brief") else None
    except InvalidInput as err:
        raise bad(err) from err
    milestones = [
        {k: m.get(k) for k in ("title", "anchor", "offsetDays", "fixedOn", "ownerRole", "order")}
        for m in (d.to_dict() or {} for d in src_ref.collection("milestones").stream())
        if m.get("anchor") == tpl.START
    ]
    plan_id = new_plan(ctx, fields, milestones)
    batch = db().batch()
    for snap in src_ref.collection("options").stream():
        option = {**(snap.to_dict() or {}), "pinned": False, "createdByMemberId": ctx.member_id, "createdAt": NOW}
        option["availability"] = {"state": "unknown", "byMemberId": ctx.member_id, "at": NOW, "note": ""}
        batch.set(ctx.plan_ref.collection("options").document(), option)
    batch.commit()
    return {"planId": plan_id}


def update_core(ctx: Ctx) -> dict:
    try:
        fields = core.core(ctx.data.get("core"))
    except InvalidInput as err:
        raise bad(err) from err
    before = plan_start(ctx.plan)
    batch = db().batch()
    batch.update(ctx.plan_ref, {**fields, "updatedAt": NOW})
    if plan_start(fields) != before:
        for snap in ctx.plan_ref.collection("milestones").stream():
            m = snap.to_dict() or {}
            batch.update(snap.reference, {"dueOn": tpl.due_on(m, plan_start(fields))})
    batch.commit()
    ctx.plan = {**ctx.plan, **fields}
    refresh_intent(ctx)
    write_summary(ctx)
    return {"saved": True}


def set_staffing(ctx: Ctx) -> dict:
    try:
        staff = core.staffing(ctx.data.get("staffing"))
    except InvalidInput as err:
        raise bad(err) from err
    require_adults(ctx.t, core.member_ids_in(staff))
    ctx.plan_ref.update({"staffing": staff, "updatedAt": NOW})
    ctx.plan = {**ctx.plan, "staffing": staff}
    return {"results": refresh_intent(ctx)}


def update_brief(ctx: Ctx) -> dict:
    """What the troop is looking for: longest drive, budget per Scout, tents or cabins, must-haves, notes."""
    try:
        fields = plans_brief.brief(ctx.data.get("brief"))
    except InvalidInput as err:
        raise bad(err) from err
    ctx.plan_ref.update({"brief": fields, "updatedAt": NOW})
    return {"saved": True}


def set_trip_lead(ctx: Ctx) -> dict:
    """Name an adult with a login as the plan's trip lead, or clear it. A trip lead edits this plan only."""
    member_id = ctx.data.get("memberId") or None
    uid = None
    if member_id:
        require_adults(ctx.t, [member_id])
        found = list(ctx.t.collection("access").where("memberId", "==", member_id).limit(1).stream())
        if not found:
            raise bad(InvalidInput("That adult has no Forthright login yet. Invite them from the Roster first."))
        uid = found[0].id
    ctx.plan_ref.update({"tripLeadMemberId": member_id, "tripLeadUid": uid, "updatedAt": NOW})
    return {"saved": True}


def record_decision(ctx: Ctx) -> dict:
    option_ids = {d.id for d in ctx.plan_ref.collection("options").list_documents()}
    try:
        decision = core.decision(ctx.data.get("decision"), option_ids)
    except InvalidInput as err:
        raise bad(err) from err
    update = {"decision": {**decision, **stamp(ctx)}, "updatedAt": NOW}
    if ctx.plan.get("status") == "draft":
        update["status"] = "decided"
    ctx.plan_ref.update(update)
    return {"saved": True}


def update_private(ctx: Ctx) -> dict:
    try:
        fields = core.private(ctx.data.get("private"))
    except InvalidInput as err:
        raise bad(err) from err
    ctx.plan_ref.collection("private").document("adult").set({**fields, "updatedAt": NOW})
    return {"saved": True}


def acknowledge(ctx: Ctx) -> dict:
    """A leader accepts a check that does not pass, with a note saying why. Committee members see every one."""
    rule_id = ctx.data.get("ruleId")
    if rule_id not in rules()["rules"]:
        raise bad(InvalidInput("Choose a check to acknowledge."))
    ref = ctx.plan_ref.collection("acks").document(rule_id)
    if ctx.data.get("remove") is True:
        ref.delete()
    else:
        try:
            note = core.text(ctx.data.get("note"), 300, "note", required=True)
        except InvalidInput as err:
            raise bad(err) from err
        ref.set({"note": note, **stamp(ctx)})
    return {"results": refresh_intent(ctx)}


def check_intent(ctx: Ctx) -> dict:
    return {"results": refresh_intent(ctx)}

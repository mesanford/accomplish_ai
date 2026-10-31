"""plan_action ops for a plan's milestones. The server works out each one's date (see handlers/plans_templates.py)."""

from __future__ import annotations

from endpoints.plans_edit import plan_start
from endpoints.plans_shared import Ctx, bad, stamp
from handlers import plans_templates as tpl
from handlers.membership import InvalidInput


def upsert_milestone(ctx: Ctx) -> dict:
    try:
        m = tpl.milestone(ctx.data.get("milestone"))
    except InvalidInput as err:
        raise bad(err) from err
    col = ctx.plan_ref.collection("milestones")
    milestone_id = ctx.data.get("milestoneId")
    if milestone_id:
        ref = col.document(str(milestone_id))
        if not ref.get().exists:
            raise bad(InvalidInput("That milestone was not found."))
    else:
        if len(list(col.list_documents())) >= tpl.MAX_MILESTONES:
            raise bad(InvalidInput(f"A plan can have up to {tpl.MAX_MILESTONES} milestones."))
        ref = col.document()
        m["done"] = None
    ref.set({**m, "dueOn": tpl.due_on(m, plan_start(ctx.plan))}, merge=True)
    return {"milestoneId": ref.id}


def delete_milestone(ctx: Ctx) -> dict:
    ctx.plan_ref.collection("milestones").document(str(ctx.data.get("milestoneId") or "-")).delete()
    return {"deleted": True}


def complete_milestone(ctx: Ctx) -> dict:
    ref = ctx.plan_ref.collection("milestones").document(str(ctx.data.get("milestoneId") or "-"))
    if not ref.get().exists:
        raise bad(InvalidInput("That milestone was not found."))
    ref.update({"done": stamp(ctx) if ctx.data.get("done") is True else None})
    return {"saved": True}

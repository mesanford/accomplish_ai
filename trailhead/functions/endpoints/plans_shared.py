"""What every plan_action op shares: who may do what, loading the plan and keeping its derived fields current.

Planners are leaders and committee members. A plan's trip lead (an adult a planner names) may edit that one plan
but not publish it. The treasurer reads plans. Only leaders acknowledge checks, publish, cancel or delete.

Planning is Scout-led, so Scouts who sign in (13 and older) share in it: they start plans, answer the questions,
add their own ideas, like and pin options and record the PLC's decision (SHARE). Their name on what they add is
Scout data of the "planning" kind, so a Scout waiting for a parent's consent can read plans but add nothing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cache

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.erase import update_op
from fb import fail, is_leader
from handlers.account import LEADER_ROLES
from handlers.consent_kinds import kind_blocker
from handlers.membership import InvalidInput
from handlers.plans_erase import plan_update, record_update
from trailhead_core.plan_checks import check_intent, load_rules

Code = https_fn.FunctionsErrorCode
PLANNER_ROLES = LEADER_ROLES | {"committee"}
PLANNER, EDIT, SHARE, READ, LEADER = "planner", "edit", "share", "read", "leader"


@cache
def rules() -> dict:
    return load_rules()


@dataclass
class Ctx:
    troop_id: str
    uid: str
    access: dict
    t: object  # the troop's DocumentReference
    data: dict
    plan_ref: object = None
    plan: dict = field(default_factory=dict)

    @property
    def member_id(self) -> str | None:
        return self.access.get("memberId")

    @property
    def plan_id(self) -> str:
        return self.plan_ref.id


def can_plan(access: dict) -> bool:
    return bool(PLANNER_ROLES & set(access.get("roles", [])))


def is_scout(access: dict) -> bool:
    return "scout" in access.get("roles", [])


def allowed(level: str, access: dict, plan: dict, uid: str) -> bool:
    trip_lead = bool(plan) and plan.get("tripLeadUid") == uid
    if level == SHARE:
        return can_plan(access) or trip_lead or is_scout(access)
    if level == LEADER:
        return is_leader(access)
    if level == PLANNER:
        return can_plan(access)
    if level == EDIT:
        return can_plan(access) or trip_lead
    return can_plan(access) or "treasurer" in access.get("roles", []) or trip_lead or is_scout(access)


def bad(err: InvalidInput) -> https_fn.HttpsError:
    return fail(Code.INVALID_ARGUMENT, str(err))


def require_adults(t, member_ids) -> None:
    """Every id must be an adult in the troop: plans never name Scouts."""
    for member_id in member_ids:
        member = t.collection("members").document(member_id).get().to_dict()
        if not member or member.get("kind") != "adult":
            raise bad(InvalidInput("Choose adults from the troop's roster."))


def refresh_intent(ctx: Ctx) -> list[dict]:
    """Re-run the readiness checks and store the results on the plan, so every planner sees the same answer."""
    acks = {d.id: d.to_dict() or {} for d in ctx.plan_ref.collection("acks").stream()}
    results = check_intent(ctx.plan, acks, rules())
    ctx.plan_ref.update(
        {
            "intentReadiness": {
                "results": results,
                "checkedAt": firestore.SERVER_TIMESTAMP,
                "rulesVersion": rules()["version"],
            }
        }
    )
    return results


def write_summary(ctx: Ctx) -> None:
    """What families see on a published event's page: only what the event itself lacks."""
    event_ids = list((ctx.plan.get("eventIds") or {}).values())
    ref = ctx.t.collection("planSummaries").document(ctx.plan_id)
    if not event_ids:
        ref.delete()
        return
    ref.set(
        {
            "title": ctx.plan.get("title", ""),
            "eventIds": event_ids,
            "familyNotes": ctx.plan.get("familyNotes", ""),
            "packingList": ctx.plan.get("packingList", ""),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
    )


def stamp(ctx: Ctx) -> dict:
    """Who did something and when, for decisions, acknowledgements and completed milestones."""
    return {"byMemberId": ctx.member_id, "at": firestore.SERVER_TIMESTAMP}


def refuse_unless_consented(ctx: Ctx) -> None:
    """A Scout adds to a plan only once a parent agreed to the notice that covers planning."""
    if not is_scout(ctx.access) or can_plan(ctx.access):
        return
    member = ctx.t.collection("members").document(ctx.member_id or "-").get().to_dict()
    consent = ctx.t.collection("consents").document(ctx.member_id or "-").get().to_dict()
    reason = kind_blocker(member, consent, "planning")
    if reason:
        raise fail(Code.FAILED_PRECONDITION, reason)


def plan_erase_ops(t, member_id: str) -> list:
    """Writes that take a person off every plan (handlers/plans_erase.py): for account deletion and Scout removal."""
    ops = []
    for plan in t.collection("eventPlans").stream():
        fields = plan_update(plan.to_dict() or {}, member_id)
        if fields:
            ops.append(update_op(plan.reference, fields))
        for sub in ("options", "milestones", "acks"):
            for d in plan.reference.collection(sub).stream():
                record = record_update(d.to_dict() or {}, member_id)
                if record:
                    ops.append(update_op(d.reference, record))
    return ops

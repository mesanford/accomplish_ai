"""Removing an adult from event plans when they delete their account. Pure functions, no network or Firestore.

Plans name adults as planned staff, drivers, the trip lead and the person who recorded a decision. Staff and
drivers are taken off the plan; records of who did something keep only "Former member" (a missing id).
"""

from __future__ import annotations


def plan_update(plan: dict, member_id: str) -> dict | None:
    """The fields to change on a plan so it no longer names `member_id`, or None if it doesn't."""
    out: dict = {}
    staffing = plan.get("staffing") or {}
    adults = staffing.get("adultMemberIds") or []
    drivers = staffing.get("drivers") or []
    if member_id in adults or any(d.get("memberId") == member_id for d in drivers):
        out["staffing"] = {
            **staffing,
            "adultMemberIds": [a for a in adults if a != member_id],
            "drivers": [d for d in drivers if d.get("memberId") != member_id],
        }
    if plan.get("tripLeadMemberId") == member_id:
        out["tripLeadMemberId"] = None
        out["tripLeadUid"] = None
    decision = plan.get("decision") or {}
    if decision.get("byMemberId") == member_id:
        out["decision"] = {**decision, "byMemberId": None}
    if plan.get("createdByMemberId") == member_id:
        out["createdByMemberId"] = None
    return out or None


def record_update(doc: dict, member_id: str) -> dict | None:
    """For an option, milestone or acknowledgement: forget who added, checked or completed it."""
    out: dict = {}
    for key in ("byMemberId", "createdByMemberId"):
        if doc.get(key) == member_id:
            out[key] = None
    for key in ("availability", "done"):
        inner = doc.get(key)
        if isinstance(inner, dict) and inner.get("byMemberId") == member_id:
            out[key] = {**inner, "byMemberId": None}
    return out or None

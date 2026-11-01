"""Removing a person from event plans: an adult who deletes their account, or a Scout a leader removes. Pure
functions, no network or Firestore.

Plans name adults as planned staff, drivers and the trip lead, and anyone as the person who started a plan, added a
card, liked one, recorded a decision or completed a milestone. Staff, drivers and likes are taken off; records of
who did something keep only "Former member" (a missing id).
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
    likes = doc.get("likes")
    if isinstance(likes, list) and member_id in likes:
        out["likes"] = [m for m in likes if m != member_id]
    for key in ("availability", "done"):
        inner = doc.get(key)
        if isinstance(inner, dict) and inner.get("byMemberId") == member_id:
            out[key] = {**inner, "byMemberId": None}
    return out or None

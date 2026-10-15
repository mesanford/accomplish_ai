"""Who gets each email. Pure functions over documents already read from Firestore."""

from __future__ import annotations

from handlers.account import BADGE_MANAGER_ROLES
from handlers.roles import acts_for

MAX_RECIPIENTS = 20  # per event, so one action can never send a flood


def wants_email(user_doc: dict | None) -> bool:
    """Notifications are on unless the person turned them off."""
    return (user_doc or {}).get("emailNotifications") is not False


def badge_manager_uids(access_docs: dict[str, dict]) -> list[str]:
    """Every Scoutmaster and advancement chair, in a steady order. Only they can approve a blue card."""
    return sorted(uid for uid, a in access_docs.items() if BADGE_MANAGER_ROLES & set(a.get("roles", [])))


def parent_uids(scout_id: str, scout: dict, access_docs: dict[str, dict]) -> list[str]:
    """Logins linked as this Scout's parent with the link confirmed. Parents who haven't agreed yet are left out."""
    guardians = set(scout.get("guardianIds", []))
    return sorted(
        uid
        for uid, a in access_docs.items()
        if a.get("memberId") in guardians and "parent" in a.get("roles", []) and acts_for(a, scout_id)
    )


def choose(uids: list[str], users: dict[str, dict | None]) -> list[str]:
    """Drop people who turned notifications off, remove repeats and apply the cap."""
    return [u for u in dict.fromkeys(uids) if wants_email(users.get(u))][:MAX_RECIPIENTS]


STATUS_EVENTS = {"approved": "approved", "counselor_assigned": "assigned", "complete": "completed"}


def card_events(before: dict | None, after: dict | None) -> list[str]:
    """Which emails a blue card change calls for: requested, approved, assigned, completed, counselor.

    Paper cards are entered by a leader after the fact, so they email no one.
    """
    if after is None or after.get("source") == "paper":
        return []
    old, new = (before or {}).get("status"), after.get("status")
    events = []
    if new != old:
        if new == "requested" and before is None:
            events.append("requested")
        elif new in STATUS_EVENTS:
            events.append(STATUS_EVENTS[new])
    counselor = after.get("counselorUid")
    if new == "counselor_assigned" and counselor and counselor != (before or {}).get("counselorUid"):
        events.append("counselor")
    return events

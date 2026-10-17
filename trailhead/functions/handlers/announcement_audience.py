"""Who an announcement is for. Pure functions over documents already read from Firestore.

Event audiences: another feature stores sign-ups at `troops/{t}/events/{e}/signups/{memberId}`. Its exact fields are not
fixed yet, so `signed_up_ids` accepts any shape that names a member (the document id, or a `memberId` field) and drops
anyone marked as not going. The endpoint falls back to the older `rsvps` collection when there are no sign-ups.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES
from handlers.email_recipients import parent_uids

NOT_GOING = {"no", "declined", "cancelled", "canceled", "withdrawn", "not_going", "notgoing"}


@dataclass
class Audience:
    member_ids: set[str] = field(default_factory=set)
    uids: list[str] = field(default_factory=list)  # logins that can read it
    includes_scouts: bool = False
    label: str = ""


def signed_up_ids(docs: list[tuple[str, dict]]) -> set[str]:
    """Member ids from sign-up (or RSVP) documents, as (document id, data) pairs, minus anyone not going."""
    ids = set()
    for doc_id, data in docs:
        data = data or {}
        status = str(data.get("status") or data.get("response") or "").lower()
        if data.get("going") is False or data.get("attending") is False or status in NOT_GOING:
            continue
        ids.add(data["memberId"] if isinstance(data.get("memberId"), str) else doc_id)
    return ids


def _first(name: str | None) -> str:
    parts = (name or "").split()
    return parts[0] if parts else "a Scout"


def _members_with_roles(access: dict[str, dict], wanted: set[str]) -> set[str]:
    return {a["memberId"] for a in access.values() if a.get("memberId") and wanted & set(a.get("roles", []))}


def _parent_members(scout_ids: list[str], members: dict[str, dict], access: dict[str, dict]) -> set[str]:
    found = set()
    for scout_id in scout_ids:
        for uid in parent_uids(scout_id, members[scout_id], access):
            found.add(access[uid]["memberId"])
    return found


def resolve(
    spec: dict,
    members: dict[str, dict],
    access: dict[str, dict],
    signups: set[str] | None = None,
    event_title: str = "",
    patrol_name: str = "",
) -> Audience:
    """The members and logins an audience reaches. Parents of chosen or signed-up Scouts count only once they have
    agreed to the consent notice for that Scout. A Scout under 13 has no login, so their parents are the readers."""
    kind, signups = spec["type"], signups or set()
    if kind == "troop":
        ids, label = set(members), "Whole troop"
    elif kind == "parents":
        ids, label = _members_with_roles(access, {"parent"}), "All parents"
    elif kind == "adults":
        ids, label = {m for m, d in members.items() if d.get("kind") != "scout"}, "All adults"
    elif kind == "leaders":
        ids, label = _members_with_roles(access, LEADER_ROLES), "Leaders only"
    elif kind == "parentsOf":
        chosen = [s for s in spec["scoutIds"] if (members.get(s) or {}).get("kind") == "scout"]
        ids = _parent_members(chosen, members, access)
        names = ", ".join(_first(members[s].get("displayName")) for s in chosen)
        label = f"Parents of {names}" if names else "Parents of chosen Scouts"
    elif kind == "patrolParents":
        in_patrol = [
            m for m, d in members.items() if d.get("kind") == "scout" and d.get("patrolId") == spec["patrolId"]
        ]
        ids = _parent_members(in_patrol, members, access)
        label = f"Parents of {patrol_name}" if patrol_name else "Parents of a patrol"
    else:
        scouts = [m for m in signups if (members.get(m) or {}).get("kind") == "scout"]
        ids = {m for m in signups if m in members} | _parent_members(scouts, members, access)
        label = f"Signed up for {event_title}" if event_title else "Signed up for an event"
    ids &= set(members)
    by_member = _login_of(access)
    return Audience(
        member_ids=ids,
        uids=sorted(by_member[m] for m in ids if m in by_member),
        includes_scouts=any(members[m].get("kind") == "scout" for m in ids),
        label=label,
    )


def _login_of(access: dict[str, dict]) -> dict[str, str]:
    return {a["memberId"]: uid for uid, a in access.items() if a.get("memberId")}


def is_post_manager(access: dict | None) -> bool:
    """A Scoutmaster or advancement chair, who can edit or delete any post and so reads every post."""
    return bool(BADGE_MANAGER_ROLES & set((access or {}).get("roles", [])))


def readers(audience: Audience, poster_uid: str, access: dict[str, dict]) -> list[str]:
    """Logins that can read: the audience, the poster and every Scoutmaster and advancement chair."""
    managers = [u for u, a in access.items() if is_post_manager(a)]
    return sorted({*audience.uids, poster_uid, *managers})


def email_uids(audience: Audience, poster_uid: str, members: dict[str, dict], access: dict[str, dict]) -> list[str]:
    """Adult logins in the audience, never Scouts and never the poster."""
    login = _login_of(access)
    adults = {m for m in audience.member_ids if members[m].get("kind") != "scout"}
    return sorted({login[m] for m in adults if m in login} - {poster_uid})


def wants_announcement_email(user_doc: dict | None) -> bool:
    """On unless the person turned announcement emails off. Separate from `emailNotifications`."""
    return (user_doc or {}).get("emailAnnouncements") is not False


def choose_emails(uids: list[str], users: dict[str, dict | None], cap: int) -> tuple[list[str], int]:
    """(who to email, how many were left out by the cap). Drops people who opted out and repeats."""
    wanted = [u for u in dict.fromkeys(uids) if wants_announcement_email(users.get(u))]
    return wanted[:cap], max(0, len(wanted) - cap)

"""Planning an account deletion. No Firestore calls here."""

from __future__ import annotations

LEADER_ROLES = {"leader", "advancement"}


def is_last_leader(uid: str, access: dict, others: dict[str, dict], other_member_ids: list[str]) -> bool:
    """True if deleting this login would leave a troop that still has people in it with no leader.

    `others`: every other login's access record in the troop. `other_member_ids`: every member but this one.
    """
    if not LEADER_ROLES & set(access.get("roles", [])):
        return False
    another = any(LEADER_ROLES & set(a.get("roles", [])) for u, a in others.items() if u != uid)
    return not another and bool(other_member_ids)


def last_leader_message(troop_name: str) -> str:
    return (
        f"You are the only leader of {troop_name}. Invite another adult as a leader, wait until they have "
        "joined, then delete your account."
    )


def plan_contacts(
    member_id: str, name: str, draft: dict | None, public: dict | None
) -> tuple[list[dict] | None, list[dict] | None]:
    """(new draft contacts, new public contacts), each None when nothing changes.

    The live site lists contacts by name, role and email, so those are matched on the published copy.
    """
    contacts = list((draft or {}).get("contacts") or [])
    mine = [c for c in contacts if c.get("memberId") == member_id]
    if not mine:
        return None, None
    new_draft = [c for c in contacts if c.get("memberId") != member_id]
    listed = {(name, c.get("role"), c.get("email")) for c in mine}
    live = list((public or {}).get("contacts") or [])
    rest = [c for c in live if (c.get("name"), c.get("role"), c.get("email")) not in listed]
    return new_draft, (rest if len(rest) != len(live) else None)

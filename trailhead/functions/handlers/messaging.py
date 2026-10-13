"""Building Youth Protection inputs from roster documents."""

from __future__ import annotations

from datetime import date, datetime

from trailhead_core.ypt import Person


def _as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def person_from_member(member_id: str, member: dict) -> Person:
    """members/{id} → Person. Guardians count only if they have a login (`uid`) to receive messages."""
    return Person(
        id=member_id,
        is_youth=member.get("kind") == "scout",
        guardian_ids=tuple(member.get("guardianIds", [])),
        ypt_expires=_as_date(member.get("yptExpiresAt")),
    )


def people_from_members(members: dict[str, dict]) -> dict[str, Person]:
    reachable = {mid for mid, m in members.items() if m.get("uid")}
    people = {}
    for mid, m in members.items():
        p = person_from_member(mid, m)
        if p.is_youth:
            p = Person(p.id, True, tuple(g for g in p.guardian_ids if g in reachable), p.ypt_expires)
        people[mid] = p
    return people


def participant_uids(member_ids: list[str], members: dict[str, dict]) -> list[str]:
    """Logins that can read the thread. Scouts under 13 have no login; their parents read for them."""
    uids = [members[m]["uid"] for m in member_ids if members.get(m, {}).get("uid")]
    return list(dict.fromkeys(uids))

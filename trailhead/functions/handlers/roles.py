"""Rules for people who hold several roles in one troop. No Firestore calls here."""

from __future__ import annotations

from datetime import date, datetime

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES
from handlers.membership import ROLES, YPT_ROLES, InvalidInput

# The roles a leader can give to an adult. A Scout's role is never edited.
ADULT_ROLES = tuple(r for r in ROLES if r != "scout")
ROLE_WORDS = {
    "leader": "a leader",
    "scoutmaster": "the Scoutmaster",
    "advancement": "an advancement chair",
    "counselor": "a counselor",
    "committee": "a committee member",
    "treasurer": "the treasurer",
    "quartermaster": "the quartermaster",
    "parent": "a parent",
}
NO_LEADER = "A troop needs at least one leader. Make someone else a leader or advancement chair first."
NO_MANAGER = (
    "A troop needs a Scoutmaster or an advancement chair to manage merit badges. "
    "Make someone else the Scoutmaster or advancement chair first."
)


def in_order(roles) -> list[str]:
    """Roles without repeats, in the order the app lists them."""
    wanted = set(roles)
    return [r for r in ROLES if r in wanted]


def parse_roles(value) -> list[str]:
    """The roles a leader picked for an adult: at least one, all of them adult roles."""
    if not isinstance(value, list) or not value or not all(isinstance(r, str) for r in value):
        raise InvalidInput("Pick at least one role.")
    if not set(value) <= set(ADULT_ROLES):
        raise InvalidInput(
            "Pick roles from the list: leader, Scoutmaster, advancement chair, counselor, committee, treasurer, "
            "quartermaster or parent."
        )
    return in_order(value)


def as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    return value if isinstance(value, date) else None


def ypt_blocker(added: set[str], expires, name: str, today: date) -> str | None:
    """Why these new roles can't be given yet, or None. Roles that sign off or message Scouts need current training."""
    needing = sorted(added & YPT_ROLES, key=ROLES.index)
    if not needing:
        return None
    day = as_date(expires)
    if day is not None and day >= today:
        return None
    word = ROLE_WORDS[needing[0]]
    if day is None:
        return f"{name} has no Youth Protection training date. Add a current date before making them {word}."
    return f"{name}'s Youth Protection training has expired. Add a current date before making them {word}."


def loses_all_leaders(target_uid: str, new_roles: list[str], access_docs: dict[str, dict]) -> bool:
    """True if this change would leave a troop that had a leader with none. `access_docs`: every login's access."""
    before = any(LEADER_ROLES & set(a.get("roles", [])) for a in access_docs.values())
    after = any(
        LEADER_ROLES & set(new_roles if uid == target_uid else a.get("roles", [])) for uid, a in access_docs.items()
    )
    return before and not after


def loses_all_badge_managers(target_uid: str, new_roles: list[str], access_docs: dict[str, dict]) -> bool:
    """True if this change would leave a troop that had a Scoutmaster or advancement chair with neither."""
    before = any(BADGE_MANAGER_ROLES & set(a.get("roles", [])) for a in access_docs.values())
    after = any(
        BADGE_MANAGER_ROLES & set(new_roles if uid == target_uid else a.get("roles", []))
        for uid, a in access_docs.items()
    )
    return before and not after


def new_links(access: dict, scout_ids: list[str]) -> list[str]:
    """The Scouts in `scout_ids` that this login is not linked to yet. A Scout already linked keeps its consent."""
    have = set(access.get("scoutIds", []))
    return [s for s in dict.fromkeys(scout_ids) if s not in have]


def pending_ids(access: dict) -> list[str]:
    """Scouts this login is linked to but has not yet agreed to the consent notice for."""
    linked = set(access.get("scoutIds", []))
    return [s for s in access.get("consentPendingScoutIds", []) if s in linked]


def decline_result(access: dict) -> tuple[list[str], list[str]]:
    """(Scouts still linked, roles left) after a parent declines the Scouts they were asked to agree for."""
    pending = set(pending_ids(access))
    kept = [s for s in access.get("scoutIds", []) if s not in pending]
    roles = list(access.get("roles", []))
    if not kept and "parent" in roles and len(roles) > 1:
        roles.remove("parent")
    return kept, roles


def acts_for(access: dict, scout_id: str) -> bool:
    """True if this login is linked to the Scout and has agreed to the consent notice for them."""
    return scout_id in access.get("scoutIds", []) and scout_id not in access.get("consentPendingScoutIds", [])

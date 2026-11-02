"""Finding a troop that is already on Forthright, asking to join it, and deleting a troop nobody uses yet.
Pure functions, no Firestore.

A leader who signs up without an invite would otherwise create a second copy of a troop that is already here. The
create form first looks for troops with the same unit number in the same council and offers "Ask to join" instead.
A leader of that troop approves the request, which adds the person the way an invite does.

Unit numbers are only unique within a council, and a troop for girls can share its number with a troop for boys
(written 1107G, 1107F or 1107B), so a match is "the same number in the same council" and the person decides.
"""

from __future__ import annotations

import re
from datetime import date

from handlers.council_calendar import council_key
from handlers.membership import CREATOR_ROLES, InvalidInput, adult_member, parse_ypt

MAX_MATCHES = 10
MAX_PENDING = 3  # join requests one person can have waiting at once
PUBLIC_FIELDS = ("name", "unitNumber", "council", "district")


def unit_key(unit: str | None) -> str | None:
    """The unit's number without leading zeros or letters: "Troop 0045" and "1107G" give "45" and "1107"."""
    found = re.search(r"\d+", unit or "")
    return str(int(found.group())) if found else None


def match_keys(troop: dict) -> dict:
    """The fields `find_troops` searches on, kept on the troop document and refreshed when its details change."""
    return {"unitKey": unit_key(troop.get("unitNumber")), "councilKey": council_key(troop.get("council"))}


def matching(candidates: dict[str, dict], council: str | None) -> list[dict]:
    """The troops among `candidates` (troop id -> document, all with the searched unit number) that are in `council`.
    A troop with no council saved can't be told apart, so it is offered too. Retired troops never are."""
    key = council_key(council)
    found = [
        {"troopId": troop_id, **{f: doc.get(f) or "" for f in PUBLIC_FIELDS}}
        for troop_id, doc in candidates.items()
        if not doc.get("retiredAt") and (not doc.get("councilKey") or doc.get("councilKey") == key)
    ]
    return sorted(found, key=lambda t: (t["unitNumber"], t["name"], t["troopId"]))[:MAX_MATCHES]


def new_join_request(data: dict, uid: str, email: str | None, today: date) -> dict:
    """Validate a request to join. It holds what the person would have given on an invite: their name, the role they
    hold in the troop (one of the create form's choices) and their Youth Protection training date."""
    choice = data.get("creatorRole")
    if choice not in CREATOR_ROLES:
        raise InvalidInput("Pick your role in the troop from the list.")
    member = adult_member(data, uid, list(CREATOR_ROLES[choice]), today)
    return {
        "uid": uid,
        "displayName": member["displayName"],
        "email": email or "",
        "creatorRole": choice,
        "yptExpiresAt": member["yptExpiresAt"],
    }


def approved_member(request: dict, choice: str | None, today: date) -> dict:
    """The adult member record for an approved request. The leader may pick a different role than the one asked for.
    Training is checked again, since it may have run out while the request waited."""
    choice = choice or request.get("creatorRole")
    if choice not in CREATOR_ROLES:
        raise InvalidInput("Pick a role for this person.")
    roles = list(CREATOR_ROLES[choice])
    ypt = request.get("yptExpiresAt")
    try:
        expires = parse_ypt(ypt.date().isoformat() if ypt else None, roles, today)
    except InvalidInput as err:
        raise InvalidInput(
            "Their Youth Protection training has expired or is missing, so they can't join as a leader. "
            "Ask them to renew it and send a new request, or pick a role that doesn't need it."
        ) from err
    return {
        "kind": "adult",
        "displayName": request["displayName"],
        "uid": request["uid"],
        "roles": roles,
        "yptExpiresAt": expires,
    }


def delete_blocker(uid: str, logins: list[str], members: list[dict], ledger_entries: int) -> str | None:
    """Why this troop can't be deleted from Troop settings, or None. Only a troop that nobody else uses can be: the
    caller is its only login and only member, it has no Scouts, and it has no Scout account entries (those are kept
    for 7 years)."""
    if any(m.get("kind") == "scout" for m in members):
        return "This troop has Scouts on its roster, so it can't be deleted here. Remove them first."
    if [u for u in logins if u != uid] or [m for m in members if m.get("uid") != uid]:
        return "Other people are in this troop, so it can't be deleted here. Only a troop with just you in it can be."
    if ledger_entries:
        return "This troop has Scout account records, which are kept for 7 years, so it can't be deleted here."
    return None

"""Validation and document building for troops, invites and Scouts. No Firestore calls here."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from trailhead_core.catalog import load_catalog

ROLES = ("leader", "scoutmaster", "advancement", "counselor", "committee", "treasurer", "parent", "scout")
# Roles that sign off, counsel or message Scouts need current Youth Protection training. The treasurer keeps Scout
# accounts and is not a leader, so does not need it for that role alone.
YPT_ROLES = {"leader", "scoutmaster", "advancement", "counselor", "committee"}
INVITE_DAYS = 30


class InvalidInput(ValueError):
    """The request can't be processed as sent. The message is shown to the user."""


def _text(data: dict, key: str, label: str, max_len: int = 80) -> str:
    value = (data.get(key) or "").strip()
    if not value:
        raise InvalidInput(f"{label} is required.")
    if len(value) > max_len:
        raise InvalidInput(f"{label} must be {max_len} characters or fewer.")
    return value


def parse_ypt(value, roles: list[str], today: date) -> datetime | None:
    """Training expiry from an ISO date. Required, and in the future, for roles that need it."""
    needs = bool(YPT_ROLES & set(roles))
    if not value:
        if needs:
            raise InvalidInput("Enter the expiry date of your Youth Protection training.")
        return None
    try:
        expires = date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise InvalidInput("Enter the training expiry date as YYYY-MM-DD.") from err
    if needs and expires < today:
        raise InvalidInput("Your Youth Protection training has expired. Renew it before joining as a leader.")
    return datetime.combine(expires, time(23, 59), tzinfo=UTC)


def new_troop(data: dict, uid: str, today: date) -> tuple[dict, dict]:
    """Return (troop doc, leader member doc) for a new troop."""
    troop = {
        "name": _text(data, "name", "Troop name"),
        "unitNumber": _text(data, "unitNumber", "Unit number", 10),
        "council": (data.get("council") or "").strip()[:80],
        "createdBy": uid,
    }
    member = adult_member(data, uid, ["leader", "scoutmaster"], today)
    return troop, member


def adult_member(data: dict, uid: str, roles: list[str], today: date) -> dict:
    return {
        "kind": "adult",
        "displayName": _text(data, "displayName", "Your name"),
        "uid": uid,
        "roles": roles,
        "yptExpiresAt": parse_ypt(data.get("yptExpiresAt"), roles, today),
    }


def new_invite(data: dict, scout_ids: set[str], unlinked_scout_ids: set[str], now: datetime) -> dict:
    """Validate an invite. `scout_ids`: Scouts in the troop. `unlinked_scout_ids`: Scouts with no login yet."""
    role = data.get("role")
    if role not in ROLES:
        raise InvalidInput("Pick a role for this invite.")
    invite = {"role": role, "note": (data.get("note") or "").strip()[:120], "expiresAt": now + timedelta(INVITE_DAYS)}
    if role == "parent":
        chosen = list(dict.fromkeys(data.get("scoutIds") or []))
        # A family from the website has no Scout on the roster yet; they add their own after joining.
        if not (data.get("leadId") and not chosen) and (not chosen or not set(chosen) <= scout_ids):
            raise InvalidInput("Choose which Scouts this parent is linked to.")
        invite["scoutIds"] = chosen
    if role == "scout":
        scout_id = data.get("scoutMemberId")
        if scout_id not in unlinked_scout_ids:
            raise InvalidInput("Choose a Scout on the roster who doesn't have a login yet.")
        invite["scoutMemberId"] = scout_id
    return invite


def check_invite(invite: dict | None, now: datetime) -> dict:
    if invite is None:
        raise InvalidInput("This invite link isn't valid. Ask your leader for a new one.")
    if invite.get("usedBy"):
        raise InvalidInput("This invite has already been used. Ask your leader for a new one.")
    if invite["expiresAt"] < now:
        raise InvalidInput("This invite has expired. Ask your leader for a new one.")
    return invite


def new_scout(data: dict, today: date) -> tuple[dict, dict]:
    """Return (member doc, private scout record) for a Scout added by a leader or parent."""
    name = _text(data, "displayName", "Scout's name")
    try:
        year, month = int(data.get("birthYear")), int(data.get("birthMonth"))
    except (TypeError, ValueError) as err:
        raise InvalidInput("Enter the Scout's birth month and year.") from err
    if not 1 <= month <= 12 or not today.year - 18 <= year <= today.year - 10:
        raise InvalidInput("Scouts BSA members are 10 to 17. Check the birth month and year.")
    ranks = load_catalog().ranks
    rank = data.get("currentRankId") or "scout"
    if rank not in ranks:
        raise InvalidInput("Pick the Scout's current rank.")
    rank_dates = {}
    for rank_id, value in (data.get("rankDates") or {}).items():
        if rank_id in ranks and value:
            rank_dates[rank_id] = str(date.fromisoformat(str(value)[:10]))
    member = {"kind": "scout", "displayName": name, "roles": ["scout"], "guardianIds": []}
    record = {"birthYear": year, "birthMonth": month, "currentRankId": rank, "rankDates": rank_dates}
    return member, record


def scout_login_blocker(record: dict | None, today: date) -> str | None:
    """Why this Scout can't have their own login yet, or None. Fails closed when the birth month or year is missing."""
    if not record or not isinstance(record.get("birthYear"), int) or not isinstance(record.get("birthMonth"), int):
        return "Add the Scout's birth month and year before inviting them to sign in."
    if under_13(record, today):
        return "Scouts under 13 can't have their own login. Invite a parent instead."
    return None


def under_13(record: dict, today: date) -> bool:
    """True if the Scout may still be under 13 (birth day unknown, so assume the latest day)."""
    return (today.year, today.month) < (record["birthYear"] + 13, record["birthMonth"] + 1)

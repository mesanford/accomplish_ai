"""Event sign-ups: who may sign up, capacity, the waitlist, deadlines and parent permission.

Pure functions over documents already read from Firestore. A sign-up document looks like
{memberId, kind, spot: "held" | "waitlist", status, permission: {state, ...}, answers, signedUpAt, signedUpBy}.
`spot` and `permission` are the facts; `status` (going, waiting_permission, waitlist) is worked out from them.
The server writes all of it, so a family can never move itself off a waitlist or approve itself.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from handlers.membership import under_13
from handlers.roles import acts_for
from handlers.signup_config import (  # noqa: F401  (re-exported: callers use `handlers.signups` for everything)
    ANSWER_MAX,
    AUDIENCES,
    DEFAULT_TZ,
    NOTE_MAX,
    SignupError,
    as_date,
    clean_answers,
    clean_note,
    closed_reason,
    parse_clock,
    read_config,
    troop_zone,
)

HELD, WAITLIST = "held", "waitlist"
NOT_NEEDED, PENDING, APPROVED = "not_needed", "pending", "approved"
# How permission was given: a parent in the app, or a leader recording a signed paper slip.
APP, PAPER = "app", "paper"
GOING, WAITING, ON_WAITLIST = "going", "waiting_permission", "waitlist"
LEADER_ROLES = {"leader", "scoutmaster", "advancement"}


def route(access: dict, member_id: str, member: dict, record: dict | None, config: dict, today: date) -> str:
    """How this login may sign this person up: "parent", "leader" or "self". Raises SignupError otherwise."""
    roles = set(access.get("roles", []))
    scout = member.get("kind") == "scout"
    if config["audience"] == ("adults" if scout else "scouts"):
        raise SignupError("This event is open to adults only." if scout else "This event is open to Scouts only.")
    if scout and "parent" in roles and acts_for(access, member_id):
        return "parent"
    if roles & LEADER_ROLES:
        return "leader"
    if access.get("memberId") != member_id:
        raise SignupError("You can only sign up yourself or your own Scout.")
    if not scout:
        return "self"
    if not record or not isinstance(record.get("birthYear"), int) or not isinstance(record.get("birthMonth"), int):
        raise SignupError("A parent needs to sign you up.")
    if under_13(record, today):
        raise SignupError("Scouts under 13 are signed up by a parent.")
    return "self"


def can_cancel(access: dict, member_id: str) -> bool:
    """A leader, the person themselves, or a parent linked to the Scout."""
    roles = set(access.get("roles", []))
    return (
        bool(roles & LEADER_ROLES)
        or access.get("memberId") == member_id
        or ("parent" in roles and acts_for(access, member_id))
    )


def status_of(signup: dict) -> str:
    if signup.get("spot") == WAITLIST:
        return ON_WAITLIST
    return WAITING if (signup.get("permission") or {}).get("state") == PENDING else GOING


def held_count(signups: dict[str, dict]) -> int:
    """Spots in use. A Scout waiting for permission keeps their spot."""
    return sum(1 for s in signups.values() if s.get("spot") == HELD)


def counts(signups: dict[str, dict]) -> dict[str, int]:
    states = [status_of(s) for s in signups.values()]
    return {
        "held": held_count(signups),
        "going": states.count(GOING),
        "waitingPermission": states.count(WAITING),
        "waitlist": states.count(ON_WAITLIST),
    }


def has_room(signups: dict[str, dict], capacity: int | None) -> bool:
    """A new person gets a spot only if there is room and nobody is already waiting ahead of them."""
    waiting = any(s.get("spot") == WAITLIST for s in signups.values())
    return not waiting and (capacity is None or held_count(signups) < capacity)


def new_signup(
    member_id: str,
    member: dict,
    how: str,
    signer: dict,
    config: dict,
    answers: dict,
    room: bool,
    now: datetime,
    gave_permission: bool = False,
) -> dict:
    """The document for a new sign-up. `signer` is {memberId, name}; `how` comes from `route`."""
    scout = member.get("kind") == "scout"
    permission: dict = {"state": NOT_NEEDED}
    if scout and config["needsPermission"]:
        if how == "parent":
            if not gave_permission:
                raise SignupError("Tick the box to give permission for your Scout to go.")
            permission = {
                "state": APPROVED,
                "method": APP,
                "byMemberId": signer["memberId"],
                "byName": signer["name"],
                "at": now,
            }
        else:
            permission = {"state": PENDING}
    doc = {
        "memberId": member_id,
        "kind": "scout" if scout else "adult",
        "spot": HELD if room else WAITLIST,
        "permission": permission,
        "answers": answers,
        "signedUpAt": now,
        "signedUpByMemberId": signer["memberId"],
    }
    return {**doc, "status": status_of(doc)}


def promote(signups: dict[str, dict], capacity: int | None) -> list[str]:
    """Ids to move off the waitlist, first come first served, until the event is full."""
    early = datetime.min.replace(tzinfo=UTC)
    waiting = sorted(
        (s for s in signups.values() if s.get("spot") == WAITLIST),
        key=lambda s: (s.get("signedUpAt") or early, s["memberId"]),
    )
    room = len(waiting) if capacity is None else max(0, capacity - held_count(signups))
    return [s["memberId"] for s in waiting[:room]]


def after_promotion(signup: dict) -> dict:
    moved = {**signup, "spot": HELD}
    return {**moved, "status": status_of(moved)}


def with_permission(signup: dict, signer: dict, now: datetime, method: str = APP) -> dict:
    """The sign-up once permission is given. `method` is "app" for a parent, or "paper" when a leader records a slip."""
    perm = {"state": APPROVED, "method": method, "byMemberId": signer["memberId"], "byName": signer["name"], "at": now}
    changed = {**signup, "permission": perm}
    return {**changed, "status": status_of(changed)}


def paper_blocker(signup: dict | None) -> str | None:
    """Why a leader can't record a paper slip for this sign-up, or None. Only a sign-up waiting for permission."""
    if signup is None:
        return "That sign-up was not found."
    if (signup.get("permission") or {}).get("state") != PENDING:
        return "This sign-up is not waiting for permission."
    return None


def needing_permission(signups: dict[str, dict]) -> list[str]:
    return sorted(i for i, s in signups.items() if status_of(s) == WAITING)


def reminder_day(today: date) -> date:
    return today + timedelta(days=2)

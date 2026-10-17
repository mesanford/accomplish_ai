"""Push notifications: the text of each one and who gets it. Pure functions, no network or Firestore.

A push shows on a lock screen, so it is shorter and plainer than an email. It never carries a Scout's last name, birth
data, health notes, message text or any money amount. A Scout's first name is the most it names. Scouts only get pushes
about broadcasts (an announcement to them) and about their own sign-ups, never about a message or a blue card.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from handlers.email_templates import join_names

MAX_PUSH_USERS = 200  # per event, the same ceiling as emailed announcements
MAX_DEVICES_PER_USER = 10
MAX_TITLE = 60
MAX_BODY = 120
# Dollar signs and "12 dollars" style amounts, which are removed from any text a person typed (such as an event title).
MONEY = re.compile(r"[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:dollars?|usd|cents)\b", re.IGNORECASE)

ANNOUNCEMENT, CARD, EVENT = "announcement", "card", "event"


@dataclass(frozen=True)
class Note:
    """What the person sees (`title`, `body`) and where tapping it goes (`path`, inside the app)."""

    kind: str
    title: str
    body: str
    path: str


@dataclass(frozen=True)
class Target:
    uid: str
    device_id: str
    token: str


def clean(text: str, limit: int) -> str:
    """Text a person typed, made safe for a lock screen: money amounts removed, whitespace tidied and shortened."""
    text = " ".join(MONEY.sub("", text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def note(kind: str, title: str, body: str, path: str) -> Note:
    return Note(kind, clean(title, MAX_TITLE), clean(body, MAX_BODY), path)


def announcement(troop_name: str, troop_id: str) -> Note:
    """Never the post's own words: a leader may have written anything in it."""
    return note(ANNOUNCEMENT, "New announcement", f"{troop_name} posted something new.", f"/t/{troop_id}/announcements")


def card_requested(scout: str, badge: str, troop_id: str) -> Note:
    return note(CARD, "Blue card request", f"{scout} asked for a {badge} blue card.", f"/t/{troop_id}/blue-cards")


def card_update(scout: str, badge: str, what: str, scout_id: str, troop_id: str) -> Note:
    """`what` is a short phrase such as "was approved"."""
    return note(CARD, "Blue card update", f"{scout}'s {badge} blue card {what}.", f"/t/{troop_id}/scouts/{scout_id}")


def counselor_assigned(scout: str, badge: str, troop_id: str) -> Note:
    return note(
        CARD, "New Scout to counsel", f"You are the counselor for {scout}'s {badge}.", f"/t/{troop_id}/counseling"
    )


def waitlist_promoted(names: list[str], title: str, troop_id: str, event_id: str) -> Note:
    body = f"{join_names(names)}: a spot opened at {title}."
    return note(EVENT, "A spot opened up", body, f"/t/{troop_id}/events/{event_id}")


def permission_needed(names: list[str], title: str, troop_id: str, event_id: str) -> Note:
    body = f"{join_names(names)}: a parent needs to give permission for {title}."
    return note(EVENT, "Permission needed", body, f"/t/{troop_id}/events/{event_id}")


def event_reminder(title: str, troop_id: str, event_id: str) -> Note:
    return note(EVENT, "Event reminder", f"{title} is coming up in two days.", f"/t/{troop_id}/events/{event_id}")


def wants_push(user_doc: dict | None, kind: str) -> bool:
    """The same opt-outs as email: announcements follow `emailAnnouncements`, everything else `emailNotifications`."""
    field = "emailAnnouncements" if kind == ANNOUNCEMENT else "emailNotifications"
    return (user_doc or {}).get(field) is not False


def choose(uids: list[str], users: dict[str, dict | None], kind: str, cap: int = MAX_PUSH_USERS) -> list[str]:
    """Logins who want this kind of push, without repeats, up to the cap."""
    return [u for u in dict.fromkeys(uids) if wants_push(users.get(u), kind)][:cap]


def targets(
    uids: list[str],
    users: dict[str, dict | None],
    devices: dict[str, list[tuple[str, str]]],
    kind: str,
    cap: int = MAX_PUSH_USERS,
) -> list[Target]:
    """Every device of each person who wants this kind of push. `devices`: uid -> [(device id, token)].

    People are capped before devices are counted, and each person's devices are capped, so one event can't flood.
    """
    return [
        Target(u, i, t)
        for u in choose(uids, users, kind, cap)
        for i, t in sorted(devices.get(u, []))[:MAX_DEVICES_PER_USER]
        if t
    ]

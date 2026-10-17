"""Announcements and newsletters: who may post, what a post must look like, and the limits. No Firestore calls here.

An announcement is a one-way broadcast. It is not a conversation, so it needs no copied parent. Replies go through
messages, which keep the Youth Protection rules. Only an adult with current training may post to Scouts.
"""

from __future__ import annotations

from datetime import date

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES
from handlers.membership import InvalidInput
from handlers.roles import as_date

POSTER_ROLES = LEADER_ROLES | {"committee"}
AUDIENCES = ("troop", "parents", "adults", "leaders", "parentsOf", "patrolParents", "event")
KINDS = ("announcement", "newsletter")
MAX_EMAILED_PER_DAY = 5  # emailed announcements per troop per day
MAX_EMAIL_RECIPIENTS = 200  # people emailed by one announcement
RETENTION_MONTHS = 24
CATCH_UP_MONTHS = 12  # someone who joins later can read what their audience got in this many months before
MAX_TITLE, MAX_BODY, MAX_SECTIONS, MAX_HEADING, MAX_SECTION_TEXT = 120, 5000, 6, 80, 2000
MAX_EVENTS, MAX_SCOUTS = 10, 60
YPT_REQUIRED = (
    "Only adults with current Youth Protection training can post to an audience that includes Scouts. "
    "Add a current training date first."
)
RATE_LIMITED = (
    f"Your troop has already emailed {MAX_EMAILED_PER_DAY} announcements today. "
    "Post without email, or try again tomorrow."
)


def can_post(access: dict) -> bool:
    return bool(POSTER_ROLES & set(access.get("roles", [])))


def can_manage(access: dict, uid: str, announcement: dict) -> bool:
    """The poster, a Scoutmaster or an advancement chair may edit, pin or delete."""
    return announcement.get("postedByUid") == uid or bool(BADGE_MANAGER_ROLES & set(access.get("roles", [])))


def has_current_ypt(member: dict | None, today: date) -> bool:
    expires = as_date((member or {}).get("yptExpiresAt"))
    return expires is not None and expires >= today


def _clean(value, label: str, max_len: int, required: bool = False) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if required and not text:
        raise InvalidInput(f"{label} is required.")
    if len(text) > max_len:
        raise InvalidInput(f"{label} must be {max_len:,} characters or fewer.")
    return text


def parse_sections(value) -> list[dict]:
    if value in (None, ""):
        return []
    if not isinstance(value, list) or len(value) > MAX_SECTIONS:
        raise InvalidInput(f"A newsletter can have up to {MAX_SECTIONS} sections.")
    sections = []
    for item in value:
        item = item if isinstance(item, dict) else {}
        heading = " ".join(_clean(item.get("heading"), "A section heading", MAX_HEADING).split())
        text = _clean(item.get("text"), "Section text", MAX_SECTION_TEXT)
        if heading or text:
            sections.append({"heading": heading, "text": text})
    return sections


def parse_event_ids(value) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list) or not all(isinstance(i, str) and i for i in value):
        raise InvalidInput("Choose events from the list.")
    ids = list(dict.fromkeys(value))
    if len(ids) > MAX_EVENTS:
        raise InvalidInput(f"You can link up to {MAX_EVENTS} events.")
    return ids


def parse_content(data: dict) -> dict:
    """The parts of a post that can also be edited: title, text, sections, event ids and pinned."""
    kind = data.get("kind", "announcement")
    if kind not in KINDS:
        raise InvalidInput("Choose announcement or newsletter.")
    title = " ".join(_clean(data.get("title"), "A title", MAX_TITLE, required=True).split())
    body = _clean(data.get("body"), "The text", MAX_BODY, required=kind == "announcement")
    sections = parse_sections(data.get("sections")) if kind == "newsletter" else []
    event_ids = parse_event_ids(data.get("eventIds")) if kind == "newsletter" else []
    if kind == "newsletter" and not (body or sections or event_ids):
        raise InvalidInput("Add a section, some text or an event to the newsletter.")
    return {
        "kind": kind,
        "title": title,
        "body": body,
        "sections": sections,
        "eventIds": event_ids,
        "pinned": data.get("pinned") is True,
    }


def parse_audience(value) -> dict:
    value = value if isinstance(value, dict) else {}
    kind = value.get("type")
    if kind not in AUDIENCES:
        raise InvalidInput("Choose who this is for.")
    audience: dict = {"type": kind}
    if kind == "parentsOf":
        ids = value.get("scoutIds")
        if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
            raise InvalidInput("Choose at least one Scout.")
        if len(set(ids)) > MAX_SCOUTS:
            raise InvalidInput(f"Choose up to {MAX_SCOUTS} Scouts.")
        audience["scoutIds"] = list(dict.fromkeys(ids))
    if kind == "patrolParents":
        if not isinstance(value.get("patrolId"), str) or not value["patrolId"]:
            raise InvalidInput("Choose a patrol.")
        audience["patrolId"] = value["patrolId"]
    if kind == "event":
        if not isinstance(value.get("eventId"), str) or not value["eventId"]:
            raise InvalidInput("Choose an event.")
        audience["eventId"] = value["eventId"]
    return audience


def can_take_email_slot(sent_today: int) -> bool:
    return sent_today < MAX_EMAILED_PER_DAY

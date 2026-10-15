"""Troop website drafts: validation and slug rules. Pure: no Firestore or Storage calls here.

A leader edits `troops/{t}/site/draft`; publishing turns it into the public copy in `publicSites/{slug}`.
"""

from __future__ import annotations

import re

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
RESERVED_SLUGS = frozenset(
    {"admin", "api", "s", "t", "join", "signin", "create", "www", "app", "help", "login", "settings", "trailhead"}
)
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DEFAULT_COLOR = "#4f6a2e"

MAX_FAQ, MAX_CONTACTS, MAX_GALLERY = 20, 6, 24
LIMITS = {
    "heading": 80,
    "tagline": 160,
    "about": 4000,
    "schedule": 120,
    "place": 120,
    "address": 200,
    "q": 200,
    "a": 1000,
    "role": 60,
    "email": 120,
    "caption": 200,
    "intro": 1000,
}


class InvalidSite(ValueError):
    """The draft can't be published as it is. The message is shown to the leader."""


def check_slug(slug: object) -> str:
    """The slug if it is a valid, unreserved web address. Raises InvalidSite otherwise."""
    if not isinstance(slug, str) or not slug:
        raise InvalidSite("Choose a web address for your site.")
    if not SLUG_RE.match(slug):
        raise InvalidSite(
            "Web addresses use 3 to 40 lowercase letters, numbers and dashes, and can't start or end with a dash."
        )
    if slug in RESERVED_SLUGS:
        raise InvalidSite(f'"{slug}" is reserved. Choose a different web address.')
    return slug


def _text(value: object, key: str, label: str, required: bool = False) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if required and not text:
        raise InvalidSite(f"{label} is required.")
    limit = LIMITS[key]
    if len(text) > limit:
        raise InvalidSite(f"{label} must be {limit:,} characters or fewer.")
    return text


def _optional(value: object, key: str, label: str) -> str | None:
    return _text(value, key, label) or None


def _draft_path(value: object, troop_id: str) -> str | None:
    """A storage path inside this troop's draft folder, or None. Anything else is refused."""
    if value in (None, ""):
        return None
    prefix = f"sites/{troop_id}/draft/"
    if not isinstance(value, str) or not value.startswith(prefix) or ".." in value or len(value) > 300:
        raise InvalidSite("One of the images isn't in this troop's uploads. Upload it again.")
    if not value[len(prefix) :] or "/" in value[len(prefix) :]:
        raise InvalidSite("One of the images isn't in this troop's uploads. Upload it again.")
    return value


def _tags(item: dict, ids_key: str, none_key: str) -> dict:
    """Which Scouts an image shows (ids), or the leader's confirmation that none can be identified."""
    raw = item.get(ids_key)
    scout_ids = [s for s in raw if isinstance(s, str)] if isinstance(raw, list) else []
    return {"scoutIds": list(dict.fromkeys(scout_ids)), "noScoutsShown": item.get(none_key) is True}


def _items(value: object, limit: int, label: str) -> list[dict]:
    items = [i for i in value if isinstance(i, dict)] if isinstance(value, list) else []
    if len(items) > limit:
        raise InvalidSite(f"Your site can have up to {limit} {label}.")
    return items


def _email(value: object) -> str | None:
    email = _optional(value, "email", "Contact email")
    if email and not EMAIL_RE.match(email):
        raise InvalidSite(f'"{email}" doesn\'t look like an email address.')
    return email


def validate_draft(draft: dict | None, troop_id: str) -> dict:
    """A cleaned copy of the draft with every field checked. Raises InvalidSite with a plain message."""
    if not isinstance(draft, dict):
        raise InvalidSite("Save your website draft first.")
    theme, cover = draft.get("theme") or {}, draft.get("cover") or {}
    meeting, recruiting = draft.get("meeting") or {}, draft.get("recruiting") or {}
    color = theme.get("color") if isinstance(theme.get("color"), str) else DEFAULT_COLOR
    if not COLOR_RE.match(color):
        raise InvalidSite("Choose a theme color like #4f6a2e.")
    faq = []
    for item in _items(draft.get("faq"), MAX_FAQ, "questions"):
        q, a = _text(item.get("q"), "q", "Each question"), _text(item.get("a"), "a", "Each answer")
        if q or a:
            if not (q and a):
                raise InvalidSite("Each question needs an answer, and each answer needs a question.")
            faq.append({"q": q, "a": a})
    contacts = []
    for item in _items(draft.get("contacts"), MAX_CONTACTS, "contacts"):
        if not isinstance(item.get("memberId"), str) or not item["memberId"]:
            raise InvalidSite("Choose a leader for each contact.")
        role = _text(item.get("role"), "role", "Each contact's role", required=True)
        contacts.append({"memberId": item["memberId"], "role": role, "email": _email(item.get("email"))})
    gallery = []
    for item in _items(draft.get("gallery"), MAX_GALLERY, "photos"):
        path = _draft_path(item.get("path"), troop_id)
        if path is None:
            continue
        gallery.append(
            {
                "path": path,
                "caption": _text(item.get("caption"), "caption", "Each photo caption"),
                **_tags(item, "scoutIds", "noScoutsShown"),
            }
        )
    return {
        "slug": check_slug(draft.get("slug")),
        "theme": {
            "color": color.lower(),
            "logoPath": _draft_path(theme.get("logoPath"), troop_id),
            "logoTags": _tags(theme, "logoScoutIds", "logoNoScoutsShown"),
        },
        "cover": {
            "heading": _text(cover.get("heading"), "heading", "The cover heading", required=True),
            "tagline": _text(cover.get("tagline"), "tagline", "The tagline"),
            "photoPath": _draft_path(cover.get("photoPath"), troop_id),
            "photoTags": _tags(cover, "photoScoutIds", "photoNoScoutsShown"),
        },
        "about": _text(draft.get("about"), "about", '"About us"', required=True),
        "meeting": {
            "schedule": _text(meeting.get("schedule"), "schedule", "The meeting schedule", required=True),
            "place": _text(meeting.get("place"), "place", "The meeting place", required=True),
            "address": _optional(meeting.get("address"), "address", "The address"),
        },
        "faq": faq,
        "contacts": contacts,
        "gallery": gallery,
        "recruiting": {
            "open": recruiting.get("open") is True,
            "intro": _text(recruiting.get("intro"), "intro", "The recruiting message"),
        },
    }

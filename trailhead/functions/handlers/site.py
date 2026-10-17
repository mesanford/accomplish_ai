"""Troop website drafts: validation and slug rules. Pure: no Firestore or Storage calls here.

A leader edits `troops/{t}/site/draft`; publishing turns it into the public copy in `publicSites/{slug}`.
"""

from __future__ import annotations

import re
from datetime import date

from .site_common import InvalidSite
from .site_common import draft_path as _draft_path
from .site_common import tags as _tags
from .site_pages import validate_pages

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
    "announcement": 200,
}
COVER_LAYOUTS = ("band", "centered", "split")
DEFAULT_LAYOUT = "band"


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


def _announcement(value: object) -> dict | None:
    """The banner text and the last day to show it (optional). No text means no banner."""
    raw = value if isinstance(value, dict) else {}
    text = _text(raw.get("text"), "announcement", "The announcement")
    if not text:
        return None
    end = raw.get("endDate")
    if end in (None, ""):
        return {"text": text, "endDate": None}
    try:
        return {"text": text, "endDate": date.fromisoformat(str(end)[:10]).isoformat()}
    except ValueError:
        raise InvalidSite("Choose a valid end date for the announcement, or leave it empty.") from None


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
        "coverLayout": draft.get("coverLayout") if draft.get("coverLayout") in COVER_LAYOUTS else DEFAULT_LAYOUT,
        "announcement": _announcement(draft.get("announcement")),
        "pages": validate_pages(draft.get("pages"), troop_id),
    }

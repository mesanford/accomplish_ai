"""Which events go in a calendar feed and how they read. Pure functions; no personal data about any Scout.

A member's feed lists the troop's events: title, dates, place, fee and a link back to the event page. The public
feed lists only what the public website already shows (title, day and place).
"""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date, timedelta

from handlers.signups import as_date, parse_clock

KEEP_DAYS_BACK = 30  # recent past events stay, so a calendar doesn't lose last week's campout
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{16,80}")
SLUG_RE = re.compile(r"[a-z0-9-]{1,60}")
PATH_RE = re.compile(r"(?:^|/)(?:cal/)?(site/)?([A-Za-z0-9_-]+)\.ics$")


def new_token() -> str:
    """43 characters from 256 random bits. Unguessable; the only protection a calendar subscription URL has."""
    return secrets.token_urlsafe(32)


def parse_path(path: str) -> tuple[str, str] | None:
    """("site", slug) or ("member", token) from a request path such as /cal/TOKEN.ics, or None."""
    found = PATH_RE.search(path or "")
    if not found:
        return None
    name = found.group(2)
    if found.group(1):
        return ("site", name) if SLUG_RE.fullmatch(name) else None
    return ("member", name) if TOKEN_RE.fullmatch(name) else None


def money(cents) -> str:
    return f"${cents // 100}.{cents % 100:02d}" if cents % 100 else f"${cents // 100}"


def _description(event: dict, url: str) -> str:
    parts = []
    fee = event.get("feeCents")
    if isinstance(fee, int) and not isinstance(fee, bool) and fee > 0:
        parts.append(f"Fee: {money(fee)}.")
    signups = event.get("signups") if isinstance(event.get("signups"), dict) else {}
    deadline = as_date(signups.get("deadline")) if signups.get("enabled") is True else None
    if deadline:
        parts.append(f"Sign up by {deadline:%b} {deadline.day}.")
    parts.append(f"Details and sign-up: {url}")
    return "\n".join(parts)


def member_entries(events: list[tuple[str, dict]], troop_id: str, app_url: str, today: date) -> list[dict]:
    """Calendar entries for a member's feed, soonest first."""
    cutoff = today - timedelta(days=KEEP_DAYS_BACK)
    entries = []
    for event_id, event in events:
        start = as_date(event.get("start"))
        title = event.get("title")
        if start is None or start < cutoff or not isinstance(title, str) or not title.strip():
            continue
        end = as_date(event.get("endDate"))
        url = f"{app_url}/t/{troop_id}/events/{event_id}"
        place = event.get("place")
        entries.append(
            {
                "uid": f"{troop_id}-{event_id}@forthright",
                "title": title.strip()[:120],
                "start": start,
                "end": end if end and end >= start else None,
                "start_time": parse_clock(event.get("startTime")),
                "end_time": parse_clock(event.get("endTime")),
                "place": place.strip()[:120] if isinstance(place, str) and place.strip() else None,
                "description": _description(event, url),
                "url": url,
            }
        )
    entries.sort(key=lambda e: (e["start"], e["title"]))
    return entries


def public_entries(events: list[dict], slug: str) -> list[dict]:
    """Entries for the public feed from the events already shown on the website: {title, start, place}."""
    entries = []
    for event in events:
        start = as_date(event.get("start"))
        if start is None or not event.get("title"):
            continue
        key = hashlib.sha256(f"{slug}|{start}|{event['title']}".encode()).hexdigest()[:24]
        entries.append(
            {
                "uid": f"{key}@forthright",
                "title": event["title"],
                "start": start,
                "place": event.get("place"),
            }
        )
    return entries

"""Emails about event sign-ups. Only a Scout's first name goes in one. They go to parents and adults, never Scouts."""

from __future__ import annotations

from datetime import date

from handlers.email_templates import Email, _notification, join_names
from trailhead_core.dates import human


def _event_link(troop_id: str, event_id: str, app_url: str) -> tuple[str, str]:
    return ("Open the event", f"{app_url}/t/{troop_id}/events/{event_id}")


def _when(start: date | None, place: str | None) -> str:
    text = f" on {human(start)}" if start else ""
    return f"{text} at {place}" if place else text


def waitlist_promoted(
    names: list[str], pending: list[str], title: str, troop_id: str, event_id: str, app_url: str
) -> Email:
    """`names` are first names, with "you" for an adult who signed up themselves. `pending` still need permission."""
    lines = [f"A spot opened up for {join_names(names)} at {title}."]
    if pending:
        lines.append(f"{join_names(pending)} still needs a parent to give permission in Forthright.")
    return _notification(f"A spot opened up at {title}", lines, _event_link(troop_id, event_id, app_url), app_url)


def permission_needed(
    names: list[str], title: str, start: date | None, troop_id: str, event_id: str, app_url: str
) -> Email:
    verb = "needs" if len(names) == 1 else "need"
    lines = [
        f"{join_names(names)} signed up for {title}{_when(start, None)}.",
        f"A parent {verb} to give permission in Forthright before they can go.",
    ]
    return _notification(f"Permission needed for {title}", lines, _event_link(troop_id, event_id, app_url), app_url)


def event_reminder(
    going: list[str],
    pending: list[str],
    title: str,
    start: date | None,
    place: str | None,
    troop_id: str,
    event_id: str,
    app_url: str,
) -> Email:
    lines = [f"Reminder: {title} is coming up{_when(start, place)}."]
    if going:
        lines.append(f"Signed up: {join_names(going)}.")
    if pending:
        lines.append(f"{join_names(pending)} still needs a parent to give permission in Forthright.")
    return _notification(f"Reminder: {title}", lines, _event_link(troop_id, event_id, app_url), app_url)

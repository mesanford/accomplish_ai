"""Emails about event sign-ups. Only a Scout's first name goes in one. They go to parents and adults, never Scouts."""

from __future__ import annotations

from datetime import date

from handlers import event_changes as changes
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


def event_changed(
    kind: str,
    title: str,
    when: str | None,
    lines: list[str],
    note: str | None,
    troop_id: str,
    event_id: str,
    app_url: str,
) -> Email:
    """An event moved, changed place, was cancelled or is back on. `note` is the leaders' short reason, if any."""
    first = changes.headline(kind, title, when)
    body = [first, *lines]
    if note:
        body.append(f"From the leaders: {note}")
    subject = {changes.CANCELLED: f"Cancelled: {title}", changes.RESTORED: f"Back on: {title}"}.get(
        kind, f"Changed: {title}"
    )
    return _notification(subject, body, _event_link(troop_id, event_id, app_url), app_url)


def series_changed(
    title: str,
    from_day: date,
    count: int,
    lines: list[str],
    cancelled: bool,
    troop_id: str,
    event_id: str,
    app_url: str,
) -> Email:
    """A leader changed or cancelled every upcoming date of a repeating event at once."""
    dates = "date" if count == 1 else f"{count} dates"
    if cancelled:
        body, subject = [f"{title} is cancelled from {human(from_day)} on ({dates})."], f"Cancelled: {title}"
    else:
        body, subject = [f"{title} has changed from {human(from_day)} on ({dates}).", *lines], f"Changed: {title}"
    return _notification(subject, body, _event_link(troop_id, event_id, app_url), app_url)

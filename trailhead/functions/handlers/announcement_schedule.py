"""Announcements a leader schedules to send later. Pure functions, no Firestore.

A scheduled post waits in `troops/{t}/scheduledPosts/{id}` (leaders and the poster can read it; only the server writes
it). Every 15 minutes `send_scheduled_announcements` posts the ones that are due through the same checks and code as
posting now, so the audience, Youth Protection rule and email limit are applied at the time it goes out.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from handlers.membership import InvalidInput

SCHEDULED, SENDING, SENT, FAILED = "scheduled", "sending", "sent", "failed"
MIN_AHEAD = timedelta(minutes=5)
MAX_AHEAD = timedelta(days=60)
# The request fields kept for sending later. troopId comes from the path, sendAt is stored on its own.
POST_FIELDS = ("kind", "title", "body", "sections", "eventIds", "pinned", "audience", "email")


def parse_send_at(value, now: datetime) -> datetime:
    """When to send, from an ISO date and time with its offset (such as the browser's toISOString())."""
    if not isinstance(value, str):
        raise InvalidInput("Choose when to send it.")
    try:
        when = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as err:
        raise InvalidInput("Choose when to send it.") from err
    if when.tzinfo is None:
        raise InvalidInput("Choose when to send it.")
    when = when.astimezone(UTC)
    if when < now + MIN_AHEAD:
        raise InvalidInput("Choose a time at least 5 minutes from now, or post it now.")
    if when > now + MAX_AHEAD:
        raise InvalidInput("You can schedule up to 60 days ahead.")
    return when


def request_of(data: dict) -> dict:
    """The parts of a post request to keep until it is sent."""
    return {key: data[key] for key in POST_FIELDS if key in data}


def due(post: dict, now: datetime) -> bool:
    send_at = post.get("sendAt")
    return post.get("status") == SCHEDULED and isinstance(send_at, datetime) and send_at <= now

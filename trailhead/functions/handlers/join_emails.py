"""Emails and pushes about asking to join a troop (see handlers/troop_match.py). Pure functions."""

from __future__ import annotations

from html import escape

from handlers.email_templates import Email, _notification, _page
from handlers.push import Note, note

MEMBERSHIP = "membership"  # push kind; follows the person's email notifications setting


def join_requested(name: str, troop_name: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"{name} asked to join {troop_name}",
        [
            f"{name} asked to join {troop_name} on Forthright.",
            "If you know them, approve the request on the Roster and they're in. If not, decline it.",
        ],
        ("Open the Roster", f"{app_url}/t/{troop_id}/roster"),
        app_url,
    )


def join_requested_note(name: str, troop_id: str) -> Note:
    return note(MEMBERSHIP, "Request to join", f"{name} asked to join the troop.", f"/t/{troop_id}/roster")


def join_approved(troop_name: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"You're in {troop_name}",
        [f"A leader of {troop_name} approved your request. The troop is on your Forthright home page now."],
        ("Open your troop", f"{app_url}/t/{troop_id}"),
        app_url,
    )


def join_declined(troop_name: str, app_url: str) -> Email:
    """Sent to someone who isn't in the troop, so it has no notification settings footer."""
    subject = f"Your request to join {troop_name}"
    lines = [
        f"A leader of {troop_name} didn't approve your request to join on Forthright.",
        "If you think this is a mistake, contact the troop's leaders directly and ask them for an invite link.",
    ]
    footer = "You get this email because you asked to join a troop on Forthright."
    text = "\n\n".join([*lines, f"Open Forthright: {app_url}", footer])
    html = _page([escape(line) for line in lines], ("Open Forthright", app_url), [footer])
    return Email(subject, text, html)

"""Validation for the public "Ask to join the pilot" form. No Firestore calls here."""

from __future__ import annotations

from datetime import datetime
from html import escape

from handlers.email_templates import PRIVACY_EMAIL, Email
from handlers.membership import InvalidInput
from handlers.recruiting import _EMAIL, Spam, _clean

DAILY_CAP = 30
ROLES = ("Scoutmaster", "Advancement chair", "Other leader or committee member", "Parent or guardian", "Other")


def new_pilot_request(form: dict) -> dict:
    """The pilotRequests document for a submission. `status` and `createdAt` are added by the caller."""
    if not isinstance(form, dict):
        raise InvalidInput("Fill in the form and try again.")
    if str(form.get("website") or "").strip():
        raise Spam
    name = _clean(form.get("name"), 80, "Your name", required=True)
    email = _clean(form.get("email"), 120, "Your email", required=True)
    if not _EMAIL.match(email):
        raise InvalidInput("Enter a valid email address.")
    unit = _clean(form.get("unit"), 40, "Troop or unit number", required=True)
    council = _clean(form.get("council"), 80, "Council")
    role = _clean(form.get("role"), 60, "Your role", required=True)
    if role not in ROLES:
        raise InvalidInput("Choose your role from the list.")
    note = _clean(form.get("note"), 1000, "Note")
    return {"name": name, "email": email, "unit": unit, "council": council, "role": role, "note": note}


def usage_key(now: datetime) -> str:
    return f"pilot_{now.date().isoformat()}"


def operator_notice(request: dict) -> Email:
    """A short notice to the operator. The note stays in Firestore; it is not copied into email."""
    where = request["unit"] + (f", {request['council']}" if request["council"] else "")
    lines = [
        f"{request['name']} ({request['role']}) asked to join the Forthright pilot for {where}.",
        f"Reply to {request['email']}. The full request is in the pilotRequests collection.",
    ]
    text = "\n\n".join(lines)
    html = "".join(f"<p>{escape(line)}</p>" for line in lines)
    return Email("New Forthright pilot request", text, html)


__all__ = ["DAILY_CAP", "PRIVACY_EMAIL", "ROLES", "new_pilot_request", "operator_notice", "usage_key"]

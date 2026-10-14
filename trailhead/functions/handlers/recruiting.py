"""Validation for the public "Join us" form. No Firestore calls here."""

from __future__ import annotations

import re
from datetime import datetime

from handlers.membership import InvalidInput

DAILY_CAP = 30
LEAD_STATUSES = ("new", "contacted", "invited", "joined", "not_interested")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Spam(Exception):
    """A bot filled the hidden field. The caller is told it worked, and nothing is saved."""


def _clean(value, max_len: int, label: str, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise InvalidInput(f"{label} is required.")
    if len(text) > max_len:
        raise InvalidInput(f"{label} must be {max_len} characters or fewer.")
    return text


def new_lead(form: dict) -> dict:
    """The lead document for a Join us submission. `createdAt` is added by the caller."""
    if not isinstance(form, dict):
        raise InvalidInput("Fill in the form and try again.")
    if str(form.get("website") or "").strip():
        raise Spam
    name = _clean(form.get("name"), 80, "Your name", required=True)
    email = _clean(form.get("email"), 120, "Your email", required=True)
    if not _EMAIL.match(email):
        raise InvalidInput("Enter a valid email address.")
    phone = _clean(form.get("phone"), 30, "Phone")
    message = _clean(form.get("message"), 1000, "Message")
    age, grade = _scout_age_or_grade(form.get("scoutAge"))
    return {
        "name": name,
        "email": email,
        "phone": phone or None,
        "scoutAge": age,
        "grade": grade,
        "message": message,
        "status": "new",
        "notes": "",
        "source": "website",
    }


def _scout_age_or_grade(value) -> tuple[int | None, str | None]:
    """A number is an age (10 to 17); anything else is kept as grade text such as "6th grade"."""
    text = _clean(value, 30, "Scout's age or grade")
    if not text:
        return None, None
    if re.fullmatch(r"\d{1,2}", text):
        age = int(text)
        if not 10 <= age <= 17:
            raise InvalidInput("Scouts BSA is for ages 10 to 17. Enter an age in that range, or a grade.")
        return age, None
    return None, text


def usage_key(now: datetime) -> str:
    return f"leads_{now.date().isoformat()}"

"""The emails and pushes about Youth Protection training. Pure functions, no network or Firestore.

An email to an adult names only that adult's own date. The weekly list for the Scoutmaster names adults (never
Scouts). A push shows on a lock screen, so it never names anyone or gives a date.
"""

from __future__ import annotations

from datetime import date

from handlers.email_templates import Email, _notification
from handlers.push import Note, note
from handlers.ypt_reminders import LAPSED, LAPSED_STATUS, MAX_LISTED, MISSING, WEEK
from trailhead_core.dates import human

KIND = "ypt"
UPDATE = "Update your date in Forthright"


def _days(expires: date, today: date) -> str:
    left = (expires - today).days
    if left == 0:
        return "today"
    return "tomorrow" if left == 1 else f"in {left} days"


def adult_email(stage: str, expires: date, today: date, troop_id: str, app_url: str) -> Email:
    """Every email links to the Account page, where the adult enters their new date themselves."""
    link = (UPDATE, f"{app_url}/account")
    renew = "Take the Youth Protection course again at my.scouting.org. Then update your date in Forthright."
    if stage == LAPSED and expires >= today:
        lines = [
            f"Your Youth Protection training expires today, {human(expires)}.",
            "After today you can't message Scouts or sign off requirements in Forthright until you renew it.",
            renew,
        ]
        return _notification("Your Youth Protection training expires today", lines, link, app_url)
    if stage == LAPSED:
        lines = [
            f"Your Youth Protection training expired on {human(expires)}.",
            "Until you renew it you can't message Scouts or sign off requirements in Forthright.",
            renew,
        ]
        return _notification("Your Youth Protection training has expired", lines, link, app_url)
    lines = [f"Your Youth Protection training expires on {human(expires)}, {_days(expires, today)}.", renew]
    subject = "Your Youth Protection training expires soon"
    if stage == WEEK:
        subject = "Your Youth Protection training expires in a week"
    return _notification(subject, lines, link, app_url)


def adult_push(stage: str, troop_id: str) -> Note:
    path = "/account"
    if stage == LAPSED:
        return note(KIND, "Training needs renewing", "Your Youth Protection training needs renewing now.", path)
    when = "in a week" if stage == WEEK else "soon"
    return note(KIND, "Training expires soon", f"Your Youth Protection training expires {when}.", path)


def _row(row: dict) -> str:
    if row["status"] == MISSING:
        return f"{row['name']}: no date on file"
    verb = "lapsed" if row["status"] == LAPSED_STATUS else "expires"
    return f"{row['name']}: {verb} {human(row['expires'])}"


def weekly_email(rows: list[dict], troop_id: str, app_url: str) -> Email:
    shown = [_row(r) for r in rows[:MAX_LISTED]]
    more = len(rows) - len(shown)
    lines = [
        "These adults need to renew their Youth Protection training, or have none on file:",
        *shown,
        *([f"And {more} more. Open the Roster to see everyone."] if more > 0 else []),
    ]
    subject = f"{len(rows)} adults need Youth Protection training"
    if len(rows) == 1:
        subject = "1 adult needs Youth Protection training"
    return _notification(subject, lines, ("Open the Roster", f"{app_url}/t/{troop_id}/roster"), app_url)


def weekly_push(count: int, troop_id: str) -> Note:
    body = "1 adult needs to renew training." if count == 1 else f"{count} adults need to renew training."
    return note(KIND, "Youth Protection training", body, f"/t/{troop_id}/roster")

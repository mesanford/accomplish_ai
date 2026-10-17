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
RENEW = "Take the Youth Protection course again at my.scouting.org. Then ask a troop leader to enter your new date."


def _days(expires: date, today: date) -> str:
    left = (expires - today).days
    if left == 0:
        return "today"
    return "tomorrow" if left == 1 else f"in {left} days"


def adult_email(stage: str, expires: date, today: date, troop_id: str, app_url: str) -> Email:
    link = ("Open Forthright", f"{app_url}/t/{troop_id}")
    if stage == LAPSED:
        lines = [
            f"Your Youth Protection training lapsed on {human(expires)}.",
            "Until you renew it you can't message Scouts or sign off requirements in Forthright.",
            RENEW,
        ]
        return _notification("Your Youth Protection training has lapsed", lines, link, app_url)
    lines = [f"Your Youth Protection training expires on {human(expires)}, {_days(expires, today)}.", RENEW]
    subject = "Your Youth Protection training expires soon"
    if stage == WEEK:
        subject = "Your Youth Protection training expires in a week"
    return _notification(subject, lines, link, app_url)


def adult_push(stage: str, troop_id: str) -> Note:
    path = f"/t/{troop_id}"
    if stage == LAPSED:
        return note(KIND, "Training lapsed", "Your Youth Protection training has lapsed.", path)
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

"""Who agreed to an older version of the parent notice, and when a reminder may go out. No Firestore calls here.

A consent record (troops/{t}/consents/{scoutId}) holds `parentConsents`, one entry per time a parent agreed, each with
the notice version they saw. Entries are only ever added. A parent's latest entry is their highest version.
"""

from __future__ import annotations

from datetime import datetime

from handlers.consent import CONSENT_NOTICE_VERSION

MAX_REMINDERS = 40  # parents emailed by one "send a reminder" click


def version_key(version: str | None) -> tuple[str, int]:
    """Sort key for versions like "2026-10-17.1" (date, then the number of that day's change). Missing is oldest."""
    day, _, number = (version or "").partition(".")
    return (day, int(number) if number.isdigit() else 0)


def is_older(version: str | None, current: str = CONSENT_NOTICE_VERSION) -> bool:
    return version_key(version) < version_key(current)


def latest_versions(entries: list[dict] | None) -> dict[str, str | None]:
    """Each parent's (member id) newest notice version."""
    latest: dict[str, str | None] = {}
    for entry in entries or []:
        member_id = entry.get("memberId")
        if not member_id:
            continue
        version = entry.get("version")
        if member_id not in latest or version_key(version) > version_key(latest[member_id]):
            latest[member_id] = version
    return latest


def out_of_date_parents(
    consent: dict | None, guardian_ids: list[str], current: str = CONSENT_NOTICE_VERSION
) -> list[str]:
    """Member ids of this Scout's parents whose latest consent is for an older notice. Parents who never agreed are
    not listed (the join flow handles them), nor is anyone once a parent withdrew consent for the Scout."""
    if not consent or consent.get("withdrawal"):
        return []
    latest = latest_versions(consent.get("parentConsents"))
    return sorted(m for m in dict.fromkeys(guardian_ids) if m in latest and is_older(latest[m], current))


def reminder_due(record: dict | None, version: str, now: datetime) -> bool:
    """May this parent be emailed about the notice change? `record` is consentReminders/{uid}:
    {version, count, firstAt, lastAt}. The first email goes at once, then one every 7 days, at most four per
    version; counting starts again when the version changes. The leader's button and the daily job share it."""
    from handlers.consent_requests import email_due

    if not record or record.get("version") != version:
        return True
    return email_due(record.get("count", 0), record.get("lastAt"), now)


def next_reminder_record(record: dict | None, version: str, now: datetime) -> dict:
    """The record to save after one email went out."""
    same = bool(record) and record.get("version") == version
    return {
        "version": version,
        "count": (record.get("count", 0) if same else 0) + 1,
        "firstAt": record.get("firstAt", now) if same else now,
        "lastAt": now,
    }

"""Parental notice and consent (COPPA): what a parent agrees to, and what a leader confirms. No Firestore calls here."""

from __future__ import annotations

from datetime import date, datetime

from handlers.membership import InvalidInput, under_13

# Bump this whenever the notice shown on the Join page changes in substance. Each consent records the version
# the parent saw, so we can tell who agreed to which wording. Keep it equal to CONSENT_NOTICE_VERSION in the app.
CONSENT_NOTICE_VERSION = "2026-10-16.1"


def check_parent_consent(data: dict) -> None:
    """A parent must have ticked the box, for the notice version we currently show."""
    if data.get("consent") is not True:
        raise InvalidInput("Read the notice and tick the box to agree before you continue.")
    if data.get("consentVersion") != CONSENT_NOTICE_VERSION:
        raise InvalidInput("The notice has changed. Reload this page and read it again.")


def parent_consent_entry(uid: str, member_id: str, now: datetime) -> dict:
    """The record that one parent agreed. `member_id` is the parent's member id in the troop."""
    return {"uid": uid, "memberId": member_id, "at": now, "version": CONSENT_NOTICE_VERSION}


def check_leader_confirmation(data: dict, record: dict, today: date) -> bool:
    """Leaders adding a Scout who may be under 13 must confirm the family's permission. True if one is needed."""
    if not under_13(record, today):
        return False
    if data.get("leaderConfirmed") is not True:
        raise InvalidInput("Confirm that this Scout's parent or guardian has given the troop permission.")
    return True


def leader_confirmation_entry(uid: str, member_id: str, now: datetime) -> dict:
    return {"uid": uid, "memberId": member_id, "at": now}

"""Emailing an announcement: who is asked, the daily limit and the send. Sending never raises (see `mailer`)."""

from __future__ import annotations

import logging
from datetime import date

from firebase_admin import firestore

from endpoints.mailer import address_of, app_url, send_all
from fb import db, troop
from handlers import announcement_email
from handlers.announcement_audience import choose_emails
from handlers.announcements import MAX_EMAIL_RECIPIENTS, MAX_EMAILED_PER_DAY

log = logging.getLogger(__name__)


def recipients(uids: list[str]) -> tuple[list[str], int]:
    """(logins to email, how many the 200-person cap left out), after honoring `emailAnnouncements`."""
    unique = list(dict.fromkeys(uids))
    refs = [db().collection("users").document(u) for u in unique]
    users = {snap.id: snap.to_dict() for snap in db().get_all(refs)} if refs else {}
    return choose_emails(unique, users, MAX_EMAIL_RECIPIENTS)


def take_slot(troop_id: str, today: date) -> bool:
    """Count one emailed announcement for the troop today. False when the day's limit is used up.

    The counter is `usage/announcements_{day}`; the retention job clears old `usage` documents by that suffix.
    """
    ref = troop(troop_id).collection("usage").document(f"announcements_{today.isoformat()}")

    @firestore.transactional
    def take(tx) -> bool:
        used = (ref.get(transaction=tx).to_dict() or {}).get("count", 0)
        if used >= MAX_EMAILED_PER_DAY:
            return False
        tx.set(ref, {"count": used + 1})
        return True

    return take(db().transaction())


def send(post: dict, uids: list[str], sender: str, troop_name: str, troop_id: str, post_id: str) -> int:
    """Email each login separately. Returns how many went out (in log mode, how many would have)."""
    addresses = [a for a in (address_of(u) for u in uids) if a]
    email = announcement_email.render(post, sender, troop_name, troop_id, post_id, app_url())
    sent = send_all("announcement", addresses, email, cap=MAX_EMAIL_RECIPIENTS)
    log.info("announcement email troop=%s sent=%d of=%d", troop_id, sent, len(uids))  # counts only
    return sent

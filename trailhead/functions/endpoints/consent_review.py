"""Parents who agreed to an older version of the notice: they review the current one, and leaders can remind them.

Nothing here emails anyone on its own. When the notice changes, a leader chooses to send a reminder.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime

from firebase_functions import https_fn

from endpoints.consent import consent_ref, send_consent_confirmation, stage_parent_consent
from endpoints.mailer import address_of, app_url, send_all
from fb import db, fail, require_access, require_leader
from fb import troop as troop_ref
from handlers import email_templates as tpl
from handlers.consent import CONSENT_NOTICE_VERSION, check_parent_consent, parent_consent_entry
from handlers.consent_review import MAX_REMINDERS, next_reminder_record, out_of_date_parents, reminder_due
from handlers.email_recipients import parent_uids, wants_email
from handlers.membership import InvalidInput
from handlers.roles import acts_for

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def review_consent_notice(req: https_fn.CallableRequest) -> dict:
    """A parent who agreed to an older notice agrees to the current one, for each of their Scouts that is out of date.

    Adds a new entry to each Scout's consent record. Earlier entries stay. A parent who doesn't agree calls nothing:
    their consent stays as it was, and they can withdraw it from the Scout's page.
    """
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    if "parent" not in access.get("roles", []):
        raise fail(Code.PERMISSION_DENIED, "Only a parent or guardian can agree to the notice.")
    try:
        check_parent_consent(data)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    uid, member_id, t = req.auth.uid, access["memberId"], troop_ref(troop_id)
    stale = [
        scout_id
        for scout_id in access.get("scoutIds", [])
        if acts_for(access, scout_id) and out_of_date_parents(consent_ref(t, scout_id).get().to_dict(), [member_id])
    ]
    if not stale:
        return {"ok": True, "reviewed": []}
    entry = parent_consent_entry(uid, member_id, datetime.now(UTC))
    batch = db().batch()
    stage_parent_consent(batch, t, stale, entry)
    batch.commit()
    send_consent_confirmation(troop_id, stale, entry)
    return {"ok": True, "reviewed": stale}


def waiting_parents(t) -> dict[str, list[str]]:
    """Login uid -> first names of the Scouts whose notice that parent has not reviewed. Left Scouts are skipped."""
    consents = {d.id: d.to_dict() for d in t.collection("consents").stream()}
    access_docs = {d.id: d.to_dict() for d in t.collection("access").stream()}
    waiting: dict[str, list[str]] = defaultdict(list)
    for snap in t.collection("members").where("kind", "==", "scout").stream():
        scout = snap.to_dict() or {}
        if scout.get("leftAt"):
            continue
        behind = set(out_of_date_parents(consents.get(snap.id), scout.get("guardianIds", [])))
        for uid in parent_uids(snap.id, scout, access_docs):
            if access_docs[uid].get("memberId") in behind:
                waiting[uid].append(tpl.first_name(scout.get("displayName")))
    return dict(sorted(waiting.items()))


def remind_parents(t, troop_id: str, now: datetime, cap: int = MAX_REMINDERS) -> dict:
    """Email each parent who has not reviewed the current notice, on the schedule: at once, then every 7 days, at most
    four per notice version. Sent whatever the parent's notification choice (with a note if they turned it off).
    The leader's button and the daily job both run this, so they share the limits."""
    waiting = waiting_parents(t)
    troop_name = (t.get().to_dict() or {}).get("name", "Your troop")
    result = {"sent": 0, "recentlyReminded": 0, "noAddress": 0, "remaining": 0}
    for position, (uid, names) in enumerate(waiting.items()):
        if position >= cap:
            result["remaining"] = len(waiting) - cap
            break
        reminder = t.collection("consentReminders").document(uid)
        record = reminder.get().to_dict()
        if not reminder_due(record, CONSENT_NOTICE_VERSION, now):
            result["recentlyReminded"] += 1
            continue
        address = address_of(uid)
        if not address:
            result["noAddress"] += 1
            continue
        off = not wants_email(db().collection("users").document(uid).get().to_dict())
        email = tpl.consent_review_reminder(names, troop_name, troop_id, app_url(), opted_out=off)
        if send_all("consent_review_reminder", [address], email):
            reminder.set(next_reminder_record(record, CONSENT_NOTICE_VERSION, now))
            result["sent"] += 1
    return result


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def send_consent_reminders(req: https_fn.CallableRequest) -> dict:
    """A leader emails the parents who have not reviewed the current notice. Parents only, never Scouts. The daily job
    does this by itself; this button sends sooner, within the same limits (one email a week, four per version)."""
    troop_id = req.data.get("troopId") if isinstance(req.data, dict) else None
    require_leader(req, troop_id)
    result = remind_parents(troop_ref(troop_id), troop_id, datetime.now(UTC))
    log.info("consent reminders troop=%s %s", troop_id, result)
    return result

"""Repeating events: a leader makes a series of dates at once, and later changes or cancels every upcoming one.

Each date is an ordinary event sharing a `seriesId` (see handlers/recurrence.py). A series change writes each date's
`alertedFor` in the same update, so the per-event alert trigger stays quiet, and families get one email for the whole
change instead of one per date.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.event_alerts import audience, send, troop_today
from endpoints.mailer import app_url
from fb import db, fail, require_leader, troop
from handlers import event_changes as changes
from handlers import event_emails as mail
from handlers import push as push_text
from handlers import recurrence
from handlers.membership import InvalidInput
from handlers.signup_config import as_date

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
EMPTY_LOG = {"nights": 0, "miles": 0, "serviceHours": 0}


def _bad(err: InvalidInput) -> https_fn.HttpsError:
    return fail(Code.INVALID_ARGUMENT, str(err))


def _clean(fields: dict) -> dict:
    """None means "no value": stored as a missing field."""
    return {k: v for k, v in fields.items() if v not in (None, "")}


@https_fn.on_call()
def create_event_series(req: https_fn.CallableRequest) -> dict:
    """Make one event per date: weekly, every other week or monthly on the same weekday, up to a year."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_leader(req, troop_id)
    try:
        pattern, first, until = recurrence.request(data)
        shared = recurrence.details(data)
        dates = recurrence.dates_for(pattern, first, until)
    except InvalidInput as err:
        raise _bad(err) from err
    t = troop(troop_id)
    series = t.collection("eventSeries").document()
    batch = db().batch()
    batch.set(
        series,
        {
            "title": shared["title"],
            "pattern": pattern,
            "label": recurrence.label(pattern, first),
            "start": first.isoformat(),
            "until": until.isoformat(),
            "count": len(dates),
            "createdByMemberId": access.get("memberId"),
            "createdAt": firestore.SERVER_TIMESTAMP,
        },
    )
    first_id = None
    for d in dates:
        ref = t.collection("events").document()
        first_id = first_id or ref.id
        event = {**_clean(shared), "public": shared["public"], "start": d.isoformat(), "seriesId": series.id}
        batch.set(ref, {**event, "logValues": dict(EMPTY_LOG), "linkedRequirements": []})
    batch.commit()
    log.info("event series created dates=%d", len(dates))
    return {"seriesId": series.id, "count": len(dates), "firstEventId": first_id}


def _merged(event: dict, changes_in: dict, cancel: bool) -> dict:
    after = {**event}
    for key, value in changes_in.items():
        if value in (None, ""):
            after.pop(key, None)
        else:
            after[key] = value
    if cancel:
        after["cancelled"] = True
    return after


def _update_for(event: dict, after: dict) -> dict:
    """The Firestore update turning `event` into `after`, with the alert already marked as sent."""
    update = {"alertedFor": changes.signature(after)}
    for key in ("title", "place", "startTime", "endTime", "cancelled"):
        if key in after and after[key] != event.get(key):
            update[key] = after[key]
        elif key not in after and key in event:
            update[key] = firestore.DELETE_FIELD
    return update


@https_fn.on_call()
def update_event_series(req: https_fn.CallableRequest) -> dict:
    """Change the name, place or times of this date and every later one, or cancel them, telling families once."""
    data = req.data or {}
    troop_id, series_id, from_id = data.get("troopId"), data.get("seriesId"), data.get("fromEventId")
    require_leader(req, troop_id)
    cancel = data.get("cancel") is True
    try:
        changes_in = recurrence.details(data.get("changes") or {}, partial=True)
    except InvalidInput as err:
        raise _bad(err) from err
    if not changes_in and not cancel:
        raise fail(Code.INVALID_ARGUMENT, "Choose what to change.")
    t = troop(troop_id)
    start = t.collection("events").document(str(from_id or "-")).get().to_dict()
    if not start or not series_id or start.get("seriesId") != series_id:
        raise fail(Code.NOT_FOUND, "That date is not part of this repeating event.")
    today = troop_today(troop_id)
    floor = max(as_date(start.get("start")) or today, today)
    dates = []
    for snap in t.collection("events").where("seriesId", "==", series_id).stream():
        event = snap.to_dict() or {}
        day = as_date(event.get("start"))
        if day and day >= floor and not (cancel and event.get("cancelled") is True):
            dates.append((snap, event, _merged(event, changes_in, cancel)))
    for *_, after in dates:
        st, en = after.get("startTime"), after.get("endTime")
        if st and en and en <= st:
            raise fail(Code.INVALID_ARGUMENT, "The end time needs to be after the start time.")
    batch = db().batch()
    for snap, event, after in dates:
        batch.update(snap.reference, _update_for(event, after))
    if "title" in changes_in:
        batch.update(t.collection("eventSeries").document(series_id), {"title": changes_in["title"]})
    batch.commit()
    notified = _tell(troop_id, dates, cancel, today) if dates else 0
    return {"updated": len(dates), "notified": notified}


def _tell(troop_id: str, dates: list, cancel: bool, today) -> int:
    """One email per family for the whole change, listing what changed on the first date."""
    first_snap, first_before, first_after = min(dates, key=lambda d: str(d[1].get("start")))
    lines = [] if cancel else changes.describe(first_before, first_after)
    if not cancel and not lines:
        return 0  # a new name alone is not worth an email
    families: dict[str, list[str]] = {}
    scouts: list[str] = []
    for snap, _, after in dates:
        fam, sc = audience(troop_id, snap.id, after, today)
        for uid, names in fam.items():
            families.setdefault(uid, [])
            families[uid] += [n for n in names if n not in families[uid]]
        scouts += sc
    title, url = first_after.get("title", "The event"), app_url()
    kind = changes.CANCELLED if cancel else changes.CHANGED
    note = push_text.event_changed(kind, title, troop_id, first_snap.id)
    day = as_date(first_after.get("start"))

    def email_for(_names):
        return mail.series_changed(title, day, len(dates), lines, cancel, troop_id, first_snap.id, url)

    return send("series_changed", troop_id, families, scouts, email_for, note)

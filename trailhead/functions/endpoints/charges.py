"""Charges for activities and dues: one charge posted to many Scouts at once.

`post_charges` is the shared entry point. Other server code (event sign-ups, for example) calls it after checking
the caller may post charges; the `post_charge` and `charge_attendees` callables check the treasurer role first.
"""

from __future__ import annotations

import logging
from datetime import date

from firebase_functions import https_fn

from endpoints.money import bad, clean_ids, post, require_treasurer, roster_scouts
from fb import fail, troop
from handlers.ledger import (
    DESCRIPTION_LEN,
    already_charged,
    charge_entry,
    charge_from_credit,
    compute_account,
    parse_cents,
    parse_day,
    parse_text,
)
from handlers.membership import InvalidInput
from handlers.retention import today_local

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def post_charges(
    troop_id: str,
    scout_ids: list[str],
    amount_cents: int,
    description: str,
    event_id: str | None = None,
    created_by: str | None = None,
    pay_from: str = "credit",
    day: date | None = None,
) -> dict:
    """Charge each Scout `amount_cents` in one transaction. The caller has checked the role.

    `pay_from`: "credit" pays from account credit where there is enough (always, if the troop lets balances go below
    zero) and leaves the rest open; "open" leaves every charge open for the family to pay. With `event_id`, a Scout
    already charged for that event with the same description is skipped, so a repeated call never charges twice.
    `created_by` is the uid recorded as who posted it (None records "Forthright").
    Returns {"posted", "paidFromCredit", "open", "skipped": [scout ids], "entryIds": [...]}.
    Raises `InvalidInput` (message for the user) for a bad amount, description or Scout list.
    """
    amount = parse_cents(amount_cents)
    words = parse_text(description, "Description", DESCRIPTION_LEN)
    if pay_from not in ("credit", "open"):
        raise InvalidInput("Choose to pay from account credit or leave the charge open.")
    ids = clean_ids(scout_ids)
    t = troop(troop_id)
    skipped: list[str] = []

    def build(tx, settings, entries):
        roster_scouts(tx, t, ids)
        skipped.clear()
        out = []
        for scout_id in ids:
            if event_id and already_charged(entries[scout_id], event_id, words):
                skipped.append(scout_id)
                continue
            state = compute_account(entries[scout_id])
            paid = charge_from_credit(state, amount, pay_from, settings["allowNegative"])
            out.append(charge_entry(scout_id, amount, words, paid, event_id))
        return out

    written = post(troop_id, ids, build, created_by, day)
    paid = sum(1 for _, e in written if e["fromCredit"])
    log.info("charges posted troop=%s posted=%d from_credit=%d skipped=%d", troop_id, len(written), paid, len(skipped))
    return {
        "posted": len(written),
        "paidFromCredit": paid,
        "open": len(written) - paid,
        "skipped": skipped,
        "entryIds": [i for i, _ in written],
    }


def _charge(req: https_fn.CallableRequest, scout_ids: list[str], event_id: str | None) -> dict:
    data = req.data or {}
    try:
        day = parse_day(data.get("date"), today_local())
        return post_charges(
            data["troopId"],
            scout_ids,
            data.get("amountCents"),
            data.get("description"),
            event_id,
            req.auth.uid,
            data.get("payFrom") or "credit",
            day,
        )
    except InvalidInput as err:
        raise bad(err) from err


@https_fn.on_call()
def post_charge(req: https_fn.CallableRequest) -> dict:
    """The treasurer charges a list of Scouts (`scoutIds`), or every Scout on the roster (`everyone: true`)."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    if data.get("everyone") is True:
        scouts = troop(troop_id).collection("members").where("kind", "==", "scout").stream()
        ids = [s.id for s in scouts if not (s.to_dict() or {}).get("leftAt")]
    else:
        ids = clean_ids(data.get("scoutIds"))
    return _charge(req, ids, data.get("eventId") if isinstance(data.get("eventId"), str) else None)


@https_fn.on_call()
def charge_attendees(req: https_fn.CallableRequest) -> dict:
    """The treasurer charges every Scout marked present at an event (`eventId`)."""
    data = req.data or {}
    troop_id, event_id = data.get("troopId"), data.get("eventId")
    require_treasurer(req, troop_id)
    if not isinstance(event_id, str) or not event_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose an event.")
    event = troop(troop_id).collection("events").document(event_id)
    if not event.get().exists:
        raise fail(Code.NOT_FOUND, "That event isn't on the calendar.")
    present = [a.id for a in event.collection("attendance").stream() if (a.to_dict() or {}).get("present")]
    members = troop(troop_id).collection("members")
    scouts = [i for i in present if (members.document(i).get().to_dict() or {}).get("kind") == "scout"]
    if not scouts:
        raise fail(Code.FAILED_PRECONDITION, "Nobody is marked present at this event yet.")
    return _charge(req, scouts, event_id)

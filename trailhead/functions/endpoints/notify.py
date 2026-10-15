"""Email notifications about blue cards. A failure here is logged and never touches the card itself."""

from __future__ import annotations

import logging

from firebase_functions import firestore_fn

from endpoints.advancement import Written, _before_after
from endpoints.mailer import address_of, app_url, send_all
from fb import db, troop
from handlers import email_templates as tpl
from handlers.email_recipients import badge_manager_uids, card_events, choose, parent_uids
from trailhead_core.catalog import load_catalog

log = logging.getLogger(__name__)


def badge_name(award_id: str) -> str:
    badge = load_catalog().badges.get(award_id)
    return badge.name if badge else award_id.replace("-", " ").replace("_", " ").title()


def deliver(template: str, uids: list[str], email: tpl.Email) -> None:
    """Email these logins, skipping anyone who turned notifications off."""
    users = {u: db().collection("users").document(u).get().to_dict() for u in uids}
    addresses = [a for a in (address_of(u) for u in choose(uids, users)) if a]
    send_all(template, addresses, email)


def notify_card(troop_id: str, card_id: str, before: dict | None, after: dict | None) -> None:
    events = card_events(before, after)
    if not events or after is None:
        return
    t, url = troop(troop_id), app_url()
    access = {d.id: d.to_dict() for d in t.collection("access").stream()}
    scout_id = after["scoutId"]
    scout = t.collection("members").document(scout_id).get().to_dict() or {}
    name, badge = tpl.first_name(scout.get("displayName")), badge_name(after["awardId"])
    parents = parent_uids(scout_id, scout, access)
    for event in events:
        if event == "requested":
            deliver("card_requested", badge_manager_uids(access), tpl.card_requested(name, badge, troop_id, url))
        elif event == "counselor":
            email = tpl.counselor_assigned(name, badge, troop_id, url)
            deliver("counselor_assigned", [after["counselorUid"]], email)
        else:
            make = {
                "approved": tpl.card_approved,
                "assigned": tpl.card_counselor_assigned,
                "completed": tpl.card_completed,
            }[event]
            deliver(f"card_{event}", parents, make(name, badge, scout_id, troop_id, url))


@firestore_fn.on_document_written(document="troops/{troopId}/blueCards/{cardId}", secrets=["RESEND_API_KEY"])
def on_blue_card_notify(event: Written) -> None:
    """Tell the right people when a blue card is requested, approved, given a counselor or completed."""
    before, after = _before_after(event)
    try:
        notify_card(event.params["troopId"], event.params["cardId"], before, after)
    except Exception:
        log.error("blue card email failed")

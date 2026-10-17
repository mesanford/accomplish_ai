"""Fundraiser campaigns and the troop's account settings. Treasurer only; every write is server-side."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.money import bad, post, require_treasurer
from fb import db, fail, troop
from handlers.account_settings import parse_settings, settings_of
from handlers.campaigns import campaign_totals, parse_campaign, sale_entries
from handlers.membership import InvalidInput

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
OPEN, POSTED = "open", "posted"


def _scout_ids(t) -> set[str]:
    return {d.id for d in t.collection("members").where("kind", "==", "scout").stream()}


@https_fn.on_call()
def save_campaign(req: https_fn.CallableRequest) -> dict:
    """Create a campaign (no `campaignId`) or change an open one: its name, credit rule and each Scout's sales.
    A new campaign without a rule gets the troop's default rule."""
    data = req.data or {}
    troop_id, campaign_id = data.get("troopId"), data.get("campaignId")
    access = require_treasurer(req, troop_id)
    t = troop(troop_id)
    if not campaign_id and not data.get("rule"):
        data = {**data, "rule": settings_of(t.get().to_dict())["defaultRule"]}
    try:
        campaign = parse_campaign(data, _scout_ids(t))
    except InvalidInput as err:
        raise bad(err) from err
    totals = campaign_totals(campaign["rule"], campaign["sales"])
    fields = {**campaign, "totals": totals, "updatedAt": firestore.SERVER_TIMESTAMP}
    if not campaign_id:
        ref = t.collection("campaigns").document()
        ref.set({**fields, "status": OPEN, "createdBy": req.auth.uid, "createdByMemberId": access["memberId"]})
        return {"campaignId": ref.id, "totals": totals}
    ref = t.collection("campaigns").document(str(campaign_id))

    @firestore.transactional
    def change(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists:
            raise InvalidInput("That campaign isn't in this troop.")
        if snap.to_dict().get("status") != OPEN:
            raise InvalidInput("This campaign has been posted. Fix a credit by reversing it on the Scout's account.")
        tx.update(ref, fields)

    try:
        change(db().transaction())
    except InvalidInput as err:
        raise fail(Code.FAILED_PRECONDITION, str(err)) from err
    return {"campaignId": ref.id, "totals": totals}


@https_fn.on_call()
def post_sales(req: https_fn.CallableRequest) -> dict:
    """Post an open campaign: credit each Scout's account by the rule, in one transaction, and close it."""
    data = req.data or {}
    troop_id, campaign_id = data.get("troopId"), data.get("campaignId")
    require_treasurer(req, troop_id)
    if not isinstance(campaign_id, str) or not campaign_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a campaign.")
    t = troop(troop_id)
    ref = t.collection("campaigns").document(campaign_id)
    first = ref.get().to_dict()
    if first is None:
        raise fail(Code.NOT_FOUND, "That campaign isn't in this troop.")

    def build(tx, settings, entries):
        campaign = ref.get(transaction=tx).to_dict() or {}
        if campaign.get("status") != OPEN:
            raise InvalidInput("This campaign has already been posted.")
        if sorted((campaign.get("sales") or {}).keys()) != scouts:
            raise InvalidInput("The sales changed while posting. Reload the page and post again.")
        members = t.collection("members")
        on_roster = {s for s in scouts if (members.document(s).get(transaction=tx).to_dict() or {}).get("kind")}
        # Every write in a transaction comes after its reads; `post` appends the entries after this returns.
        tx.update(ref, {"status": POSTED, "postedAt": firestore.SERVER_TIMESTAMP, "postedBy": req.auth.uid})
        return [e for e in sale_entries(campaign_id, campaign) if e["scoutId"] in on_roster]

    scouts = sorted((first.get("sales") or {}).keys())
    try:
        written = post(troop_id, scouts, build, req.auth.uid)
    except InvalidInput as err:
        raise fail(Code.FAILED_PRECONDITION, str(err)) from err
    credited = sum(e["amountCents"] for _, e in written)
    log.info("campaign posted troop=%s credits=%d", troop_id, len(written))
    return {"credited": len(written), "creditCents": credited}


@https_fn.on_call()
def save_account_settings(req: https_fn.CallableRequest) -> dict:
    """The treasurer sets the troop's account rules (see `handlers/account_settings.py`)."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    try:
        settings = parse_settings(data)
    except InvalidInput as err:
        raise bad(err) from err
    troop(troop_id).update({"accounts": {**settings, "updatedBy": req.auth.uid}})
    return settings

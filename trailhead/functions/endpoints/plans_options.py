"""plan_action ops for research cards (eventPlans/{p}/options/{o}). See endpoints/plans.py and
handlers/plans_options.py. Planners and the trip lead change any card; a Scout changes the cards they added, and
anyone who shares in the plan can like a card or put it on the shortlist.
"""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.plans_shared import EDIT, Ctx, allowed, bad
from fb import fail
from handlers import plans_options as opts
from handlers.membership import InvalidInput

Code = https_fn.FunctionsErrorCode
NOW = firestore.SERVER_TIMESTAMP


def _stamp(ctx: Ctx, state: str, note: str) -> dict:
    return {"state": state, "byMemberId": ctx.member_id, "at": NOW, "note": note}


def _card(ctx: Ctx, mine_only: bool):
    """(ref, card) for the request's option; with `mine_only`, a Scout may touch only a card they added."""
    ref = ctx.plan_ref.collection("options").document(str(ctx.data.get("optionId") or "-"))
    card = ref.get().to_dict()
    if not card:
        raise fail(Code.NOT_FOUND, "That option was not found.")
    adult = allowed(EDIT, ctx.access, ctx.plan, ctx.uid)
    if mine_only and not opts.may_edit(card, ctx.member_id, adult):
        raise fail(Code.PERMISSION_DENIED, "You can change the options you added. Ask a leader about this one.")
    return ref, card


def save_option(ctx: Ctx) -> dict:
    """Add a card, or change one. Availability is stamped again only when its status or note changed."""
    try:
        fields = opts.option(ctx.data.get("option"))
        state, note = opts.availability((ctx.data.get("option") or {}).get("availability"))
    except InvalidInput as err:
        raise bad(err) from err
    if ctx.data.get("optionId"):
        ref, card = _card(ctx, mine_only=True)
        update = dict(fields)
        if opts.availability_changed(card.get("availability"), state, note):
            update["availability"] = _stamp(ctx, state, note)
        ref.update(update)
        return {"optionId": ref.id}
    col = ctx.plan_ref.collection("options")
    if len(list(col.list_documents())) >= opts.MAX_OPTIONS:
        raise bad(InvalidInput(f"A plan can have up to {opts.MAX_OPTIONS} options. Remove some first."))
    ref = col.document()
    ref.set(
        {
            **fields,
            "availability": _stamp(ctx, state, note),
            "pinned": False,
            "likes": [],
            "createdByMemberId": ctx.member_id,
            "createdAt": NOW,
        }
    )
    return {"optionId": ref.id}


def set_availability(ctx: Ctx) -> dict:
    """The quick status change on a card."""
    ref, card = _card(ctx, mine_only=True)
    try:
        note = (card.get("availability") or {}).get("note")
        state, note = opts.availability({"state": ctx.data.get("state"), "note": note})
    except InvalidInput as err:
        raise bad(err) from err
    if opts.availability_changed(card.get("availability"), state, note):
        ref.update({"availability": _stamp(ctx, state, note)})
    return {"saved": True}


def like_option(ctx: Ctx) -> dict:
    """Like a card, or take the like back. Each person counts once."""
    ref, _ = _card(ctx, mine_only=False)
    change = firestore.ArrayUnion if ctx.data.get("like") is True else firestore.ArrayRemove
    ref.update({"likes": change([ctx.member_id])})
    return {"saved": True}


def pin_option(ctx: Ctx) -> dict:
    """Put a card on the shortlist, or take it off."""
    ref, _ = _card(ctx, mine_only=False)
    ref.update({"pinned": ctx.data.get("pinned") is True})
    return {"saved": True}


def delete_option(ctx: Ctx) -> dict:
    ref, _ = _card(ctx, mine_only=True)
    ref.delete()
    return {"deleted": True}

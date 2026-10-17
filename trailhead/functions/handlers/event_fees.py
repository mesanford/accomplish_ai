"""Event fees: who is charged, and the integration seam to Scout accounts. Pure except for the guarded import.

The seam: `post_fees` calls `post_charges(troop_id, scout_ids, amount_cents, description, event_id, created_by)` from
the Scout accounts work when that module exists. Until then it records the charge as pending so nothing is lost and
nothing is charged twice. Wiring it up is a one-line change to `POST_CHARGES_MODULES` (or a delete of the fallback).
"""

from __future__ import annotations

import importlib
import logging
from collections.abc import Callable

from handlers.signups import GOING, status_of

log = logging.getLogger(__name__)

# INTEGRATION SEAM: where the Scout accounts helper may live. The first module that imports and has `post_charges` wins.
POST_CHARGES_MODULES = ("endpoints.charges",)
WHO = ("going", "attendees")


class FeeError(Exception):
    """A problem a leader can fix. The message is safe to show."""


def fee_cents(event: dict) -> int:
    fee = event.get("feeCents")
    return fee if isinstance(fee, int) and not isinstance(fee, bool) and fee > 0 else 0


def find_post_charges() -> Callable | None:
    """The accounts helper if it exists. A missing module is fine; a broken one is logged and treated as missing."""
    for name in POST_CHARGES_MODULES:
        try:
            func = getattr(importlib.import_module(name), "post_charges", None)
        except ModuleNotFoundError as err:
            if err.name != name:
                log.exception("fees: %s failed to import", name)
            continue
        except Exception:
            log.exception("fees: %s failed to import", name)
            continue
        if callable(func):
            return func
    return None


def scouts_to_charge(
    who: str, signups: dict[str, dict], attendance: dict[str, bool], members: dict[str, dict]
) -> list[str]:
    """Scout ids to charge. "going": signed up with a spot and permission. "attendees": marked present."""
    if who not in WHO:
        raise FeeError("Choose who to charge.")
    if who == "going":
        ids = [i for i, s in signups.items() if s.get("kind") == "scout" and status_of(s) == GOING]
    else:
        ids = [i for i, present in attendance.items() if present]
    return sorted(i for i in ids if (members.get(i) or {}).get("kind") == "scout")


def post_fees(
    troop_id: str,
    scout_ids: list[str],
    amount_cents: int,
    description: str,
    event_id: str,
    created_by: str,
    finder: Callable[[], Callable | None] = find_post_charges,
) -> str:
    """Charge these Scouts. Returns "posted", or "pending" when the accounts helper is not available yet."""
    post = finder()
    if post is None:
        return "pending"
    post(troop_id, scout_ids, amount_cents, description, event_id, created_by)
    return "posted"

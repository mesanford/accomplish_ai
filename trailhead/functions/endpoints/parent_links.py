"""Writes shared by every way a login gets a role or becomes a Scout's parent. `write` is a transaction or a batch."""

from __future__ import annotations

from firebase_admin import firestore

from fb import db


def stage_roles(write, t, troop_id: str, uid: str, member_id: str, roles: list[str], extra: dict | None = None) -> None:
    """Set a person's roles in the three places the app reads them: the member, the access record and the user.

    `extra` (for example a new Youth Protection date) is written to the member and the access record too.
    """
    extra = extra or {}
    write.update(t.collection("members").document(member_id), {"roles": roles, **extra})
    write.update(t.collection("access").document(uid), {"roles": roles, **extra})
    write.set(db().collection("users").document(uid), {"troops": {troop_id: {"roles": roles}}}, merge=True)


def stage_link(write, t, uid: str, member_id: str, scout_ids: list[str], pending: bool = False) -> None:
    """Link a parent to Scouts. `pending`: the parent has not yet agreed to the consent notice for them."""
    if not scout_ids:
        return
    for scout_id in scout_ids:
        write.update(t.collection("members").document(scout_id), {"guardianIds": firestore.ArrayUnion([member_id])})
    fields = {"scoutIds": firestore.ArrayUnion(scout_ids)}
    if pending:
        fields["consentPendingScoutIds"] = firestore.ArrayUnion(scout_ids)
    write.update(t.collection("access").document(uid), fields)


def stage_unlink(write, t, uid: str, member_id: str, scout_ids: list[str], keep: list[str]) -> None:
    """Take a parent off Scouts. `keep`: the Scouts they stay linked to."""
    for scout_id in scout_ids:
        write.update(t.collection("members").document(scout_id), {"guardianIds": firestore.ArrayRemove([member_id])})
    write.update(
        t.collection("access").document(uid), {"scoutIds": keep, "consentPendingScoutIds": firestore.DELETE_FIELD}
    )

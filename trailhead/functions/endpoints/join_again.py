"""Accepting an invite as someone who is already in the troop: the invite's role is added to their membership."""

from __future__ import annotations

from datetime import UTC, date, datetime

from firebase_admin import firestore

from endpoints.consent import stage_parent_consent
from endpoints.parent_links import stage_link, stage_roles
from handlers.consent import check_parent_consent, parent_consent_entry
from handlers.membership import YPT_ROLES, InvalidInput, parse_ypt
from handlers.roles import acts_for, as_date, in_order, new_links


def add_invite_role(
    tx, t, troop_id: str, uid: str, access: dict, invite: dict, data: dict
) -> tuple[list[str], dict | None]:
    """Give an existing member the invite's role. Returns (Scouts consent was recorded for, the consent entry).

    A parent invite also links the Scouts it names and needs the parent's agreement to the notice, as for a new member.
    """
    role, roles = invite["role"], access.get("roles", [])
    if role == "scout":
        raise InvalidInput("You're already a member of this troop. A Scout invite is for the Scout's own login.")
    if "scout" in roles:
        raise InvalidInput("This login belongs to a Scout, so it can't take an adult role. Use your own account.")
    if role in roles and role != "parent":
        raise InvalidInput("You already have this role in the troop.")
    member_id = access["memberId"]
    member = t.collection("members").document(member_id).get(transaction=tx).to_dict() or {}
    today = date.today()
    expires, extra = member.get("yptExpiresAt"), {}
    if data.get("yptExpiresAt"):
        expires = parse_ypt(data["yptExpiresAt"], [role], today)
        extra = {"yptExpiresAt": expires}
    day = as_date(expires)
    if role in YPT_ROLES and (day is None or day < today):
        raise InvalidInput("Enter the expiry date of your Youth Protection training. It must not have passed.")
    consent, consented = None, []
    if role == "parent":
        check_parent_consent(data)
        scout_ids = invite.get("scoutIds", [])
        consented = [s for s in scout_ids if not acts_for(access, s)]
        stage_link(tx, t, uid, member_id, new_links(access, scout_ids))
        waiting = [s for s in consented if s in access.get("consentPendingScoutIds", [])]
        if waiting:
            tx.update(t.collection("access").document(uid), {"consentPendingScoutIds": firestore.ArrayRemove(waiting)})
        if consented:
            consent = parent_consent_entry(uid, member_id, datetime.now(UTC))
            stage_parent_consent(tx, t, consented, consent)
    stage_roles(tx, t, troop_id, uid, member_id, in_order([*roles, role]), extra)
    return consented, consent

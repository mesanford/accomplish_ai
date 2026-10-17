"""Small pieces shared by the troop website checks. Pure."""

from __future__ import annotations


class InvalidSite(ValueError):
    """The draft can't be published as it is. The message is shown to the leader."""


def draft_path(value: object, troop_id: str) -> str | None:
    """A storage path inside this troop's draft folder, or None. Anything else is refused."""
    if value in (None, ""):
        return None
    prefix = f"sites/{troop_id}/draft/"
    if not isinstance(value, str) or not value.startswith(prefix) or ".." in value or len(value) > 300:
        raise InvalidSite("One of the images isn't in this troop's uploads. Upload it again.")
    if not value[len(prefix) :] or "/" in value[len(prefix) :]:
        raise InvalidSite("One of the images isn't in this troop's uploads. Upload it again.")
    return value


def tags(item: dict, ids_key: str, none_key: str) -> dict:
    """Which Scouts an image shows (ids), or the leader's confirmation that none can be identified."""
    raw = item.get(ids_key)
    scout_ids = [s for s in raw if isinstance(s, str)] if isinstance(raw, list) else []
    return {"scoutIds": list(dict.fromkeys(scout_ids)), "noScoutsShown": item.get(none_key) is True}

"""Turning a checked draft into the public site. Pure: callers pass in members, events and file URLs.

Youth Protection: the public copy never names a Scout. Photos that show Scouts go up only when every tagged
Scout has a parent's (or a leader-recorded) media consent, and contacts are adults only.
"""

from __future__ import annotations

from datetime import date
from urllib.parse import quote, quote_plus

from .site import InvalidSite

MAX_EVENTS = 12
DEFAULT_STORAGE_HOST = "https://firebasestorage.googleapis.com"


def has_consent(member: dict | None) -> bool:
    consent = (member or {}).get("mediaConsent") or {}
    return consent.get("granted") is True


def _scout_label(scout_id: str, members: dict[str, dict]) -> str:
    member = members.get(scout_id)
    return (member.get("displayName") or "A Scout") if member else "a Scout no longer on the roster"


def filter_gallery(gallery: list[dict], members: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    """(photos to publish, photos left out with a reason for the leader). Reasons may name Scouts; they are
    only shown to the leader, never published."""
    kept: list[dict] = []
    left_out: list[dict] = []
    for item in gallery:
        reason = None
        if item["noScoutsShown"]:
            reason = None
        elif not item["scoutIds"]:
            reason = "Tag the Scouts in this photo, or check that no Scouts can be identified."
        else:
            missing = [s for s in item["scoutIds"] if not has_consent(members.get(s))]
            if missing:
                names = ", ".join(_scout_label(s, members) for s in missing)
                reason = f"No media consent recorded for {names}."
        if reason:
            left_out.append({"path": item["path"], "caption": item["caption"], "reason": reason})
        else:
            kept.append(item)
    return kept, left_out


def resolve_contacts(contacts: list[dict], members: dict[str, dict]) -> list[dict]:
    """Public contacts with names. Only adults may be listed; a Scout is refused outright."""
    resolved = []
    for contact in contacts:
        member = members.get(contact["memberId"])
        if member is None:
            raise InvalidSite("One of the contacts is no longer on the roster. Choose another leader.")
        if member.get("kind") != "adult":
            raise InvalidSite("Only adult leaders can be listed as contacts. Remove the Scout from the contacts.")
        name = (member.get("displayName") or "").strip()
        if not name:
            raise InvalidSite("One of the contacts has no name on the roster yet.")
        resolved.append({"name": name, "role": contact["role"], "email": contact["email"]})
    return resolved


def _event_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def public_events(events: list[dict], today: date) -> list[dict]:
    """Upcoming events marked public, soonest first. Only the title, date and place are shared."""
    upcoming = []
    for event in events:
        start = _event_date(event.get("start"))
        title = (event.get("title") or "").strip() if isinstance(event.get("title"), str) else ""
        if event.get("public") is not True or start is None or start < today or not title:
            continue
        place = event.get("place")
        place = (place.strip()[:120] or None) if isinstance(place, str) else None
        upcoming.append({"title": title[:120], "start": start.isoformat(), "place": place})
    upcoming.sort(key=lambda e: (e["start"], e["title"]))
    return upcoming[:MAX_EVENTS]


def public_path(troop_id: str, draft_path: str) -> str:
    return f"sites/{troop_id}/public/{draft_path.rsplit('/', 1)[-1]}"


def download_url(bucket: str, path: str, host: str = DEFAULT_STORAGE_HOST) -> str:
    """A tokenless download URL. It works because storage rules allow public reads of sites/*/public."""
    return f"{host}/v0/b/{bucket}/o/{quote(path, safe='')}?alt=media"


def map_url(address: str | None) -> str | None:
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(address)}" if address else None


def draft_files(clean: dict, gallery: list[dict]) -> list[str]:
    """Every draft file the public site needs, once each."""
    paths = [clean["theme"]["logoPath"], clean["cover"]["photoPath"], *(g["path"] for g in gallery)]
    return list(dict.fromkeys(p for p in paths if p))


def build_public_site(
    clean: dict,
    troop_id: str,
    troop_doc: dict,
    urls: dict[str, str],
    contacts: list[dict],
    gallery: list[dict],
    events: list[dict],
) -> dict:
    """The publicSites document, without its publishedAt timestamp. `urls` maps draft paths to public URLs."""
    meeting = clean["meeting"]
    return {
        "slug": clean["slug"],
        "troopId": troop_id,
        "troopName": troop_doc.get("name") or "",
        "unitNumber": troop_doc.get("unitNumber") or "",
        "council": troop_doc.get("council") or "",
        "theme": {"color": clean["theme"]["color"], "logoUrl": urls.get(clean["theme"]["logoPath"] or "")},
        "cover": {
            "heading": clean["cover"]["heading"],
            "tagline": clean["cover"]["tagline"],
            "photoUrl": urls.get(clean["cover"]["photoPath"] or ""),
        },
        "about": clean["about"],
        "meeting": {
            "schedule": meeting["schedule"],
            "place": meeting["place"],
            "address": meeting["address"],
            "mapUrl": map_url(meeting["address"]),
        },
        "faq": clean["faq"],
        "contacts": contacts,
        "gallery": [{"url": urls[g["path"]], "caption": g["caption"]} for g in gallery if g["path"] in urls],
        "events": events,
        "recruiting": clean["recruiting"],
    }

"""Media consent: a parent (or a leader recording a paper form) allows or withdraws photos of a Scout."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.site import site_urls
from endpoints.site_files import delete_public_files
from fb import db, fail, is_leader, require_access, require_uid, troop

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def _shows(item: dict | None, scout_id: str) -> bool:
    return bool(item) and scout_id in item.get("scoutIds", []) and not item.get("noScoutsShown")


def _take_down_photos(troop_id: str, scout_id: str) -> int:
    """Remove every image showing a Scout (gallery photos, the cover photo and the logo) from the live site at
    once, without waiting for the next publish. Returns how many images came down."""
    t = troop(troop_id)
    record_ref = t.collection("site").document("published")
    record = record_ref.get().to_dict()
    if not record or not record.get("slug"):
        return 0
    showing = {g["url"] for g in record.get("gallery", []) if _shows(g, scout_id)}
    cover_down, logo_down = _shows(record.get("cover"), scout_id), _shows(record.get("logo"), scout_id)
    if not (showing or cover_down or logo_down):
        return 0
    site_ref = db().collection("publicSites").document(record["slug"])
    public = site_ref.get().to_dict()
    if public is None:
        return 0
    gallery = [g for g in public.get("gallery", []) if g.get("url") not in showing]
    cover, theme = dict(public.get("cover") or {}), dict(public.get("theme") or {})
    changes: dict = {"gallery": gallery}
    kept: dict = {"gallery": [g for g in record["gallery"] if g["url"] not in showing]}
    if cover_down:
        cover["photoUrl"], changes["cover"], kept["cover"] = None, cover, None
    if logo_down:
        theme["logoUrl"], changes["theme"], kept["logo"] = None, theme, None
    site_ref.update(changes)
    record_ref.update(kept)
    delete_public_files(troop_id, keep_urls=site_urls({**public, "gallery": gallery, "cover": cover, "theme": theme}))
    return len(showing) + int(cover_down) + int(logo_down)


@https_fn.on_call()
def set_media_consent(req: https_fn.CallableRequest) -> dict:
    """Record whether photos showing this Scout may appear on the troop's public website."""
    require_uid(req)  # sign-in comes before any other check, as in every function
    data = req.data or {}
    troop_id, scout_id, granted = data.get("troopId"), data.get("scoutId"), data.get("granted")
    if not isinstance(granted, bool) or not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout and whether you give consent.")
    access = require_access(req, troop_id, scout_id=scout_id)
    is_parent = "parent" in access.get("roles", []) and scout_id in access.get("scoutIds", [])
    if not (is_leader(access) or is_parent):
        raise fail(Code.PERMISSION_DENIED, "Only a parent or guardian, or a troop leader, can record media consent.")
    member_ref = troop(troop_id).collection("members").document(scout_id)
    member = member_ref.get().to_dict()
    if member is None or member.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    member_ref.update(
        {"mediaConsent": {"granted": granted, "byMemberId": access["memberId"], "at": firestore.SERVER_TIMESTAMP}}
    )
    removed = 0 if granted else _take_down_photos(troop_id, scout_id)
    log.info("media consent troop=%s granted=%s photos_removed=%d", troop_id, granted, removed)
    return {"granted": granted, "photosRemoved": removed}

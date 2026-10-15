"""The troop website: publish a leader's draft as a safe public copy, unpublish it, keep its events fresh."""

from __future__ import annotations

import logging
from datetime import date

from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn

from endpoints.site_files import MissingFile, delete_public_files, publish_files
from fb import db, fail, require_leader, troop
from handlers.images import UnreadableImage
from handlers.site import InvalidSite, validate_draft
from handlers.site_build import (
    build_public_site,
    draft_files,
    filter_branding,
    filter_gallery,
    public_events,
    resolve_contacts,
)

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
TAKEN = "That web address is already used by another troop. Choose a different one."


def site_urls(public: dict) -> set[str]:
    """Every file URL a published site uses."""
    urls = {(public.get("theme") or {}).get("logoUrl"), (public.get("cover") or {}).get("photoUrl")}
    urls.update(g.get("url") for g in public.get("gallery") or [])
    return {u for u in urls if u}


def _upcoming(t) -> list[dict]:
    events = [d.to_dict() for d in t.collection("events").where("public", "==", True).stream()]
    return public_events(events, date.today())


def _record(path: str | None, tags: dict, urls: dict[str, str]) -> dict | None:
    """What the published record keeps about a cover photo or logo: its URL and the Scouts it shows."""
    if not path:
        return None
    return {"url": urls[path], "scoutIds": tags["scoutIds"], "noScoutsShown": tags["noScoutsShown"]}


def _owner(slug_snap) -> str | None:
    return (slug_snap.to_dict() or {}).get("troopId") if slug_snap.exists else None


@https_fn.on_call(timeout_sec=120, memory=512)
def publish_site(req: https_fn.CallableRequest) -> dict:
    """Check the draft, copy its images to the public folder and write publicSites/{slug}. Leaders only."""
    troop_id = (req.data or {}).get("troopId")
    require_leader(req, troop_id)
    t = troop(troop_id)
    try:
        clean = validate_draft(t.collection("site").document("draft").get().to_dict(), troop_id)
        members = {d.id: d.to_dict() for d in t.collection("members").stream()}
        contacts = resolve_contacts(clean["contacts"], members)
    except InvalidSite as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from None
    slug = clean["slug"]
    slug_ref = db().collection("slugs").document(slug)
    if _owner(slug_ref.get()) not in (None, troop_id):
        raise fail(Code.ALREADY_EXISTS, TAKEN)

    gallery, left_out = filter_gallery(clean["gallery"], members)
    clean, branding_left_out = filter_branding(clean, members)  # a cover photo or logo follows the gallery's rule
    left_out = [*branding_left_out, *left_out]
    try:
        urls = publish_files(troop_id, draft_files(clean, gallery))
    except MissingFile:
        raise fail(Code.FAILED_PRECONDITION, "One of your images is missing. Upload it again, then publish.") from None
    except UnreadableImage:
        raise fail(
            Code.FAILED_PRECONDITION, "One of your images can't be read. Upload it again, then publish."
        ) from None
    troop_doc = t.get().to_dict() or {}
    public = build_public_site(clean, troop_id, troop_doc, urls, contacts, gallery, _upcoming(t))
    site_ref = db().collection("publicSites")

    @firestore.transactional
    def claim(tx) -> None:
        owner = _owner(slug_ref.get(transaction=tx))
        old = ((t.get(transaction=tx).to_dict() or {}).get("site") or {}).get("slug")
        if owner not in (None, troop_id):
            raise fail(Code.ALREADY_EXISTS, TAKEN)
        if old and old != slug:
            old_ref = db().collection("slugs").document(old)
            if _owner(old_ref.get(transaction=tx)) == troop_id:
                tx.delete(old_ref)
            tx.delete(site_ref.document(old))
        tx.set(slug_ref, {"troopId": troop_id})
        tx.set(site_ref.document(slug), {**public, "publishedAt": firestore.SERVER_TIMESTAMP})
        tx.set(t, {"site": {"slug": slug, "published": True, "publishedAt": firestore.SERVER_TIMESTAMP}}, merge=True)
        # Which Scouts each public photo shows, so a withdrawn consent can take the photo down.
        tx.set(
            t.collection("site").document("published"),
            {
                "slug": slug,
                "cover": _record(clean["cover"]["photoPath"], clean["cover"]["photoTags"], urls),
                "logo": _record(clean["theme"]["logoPath"], clean["theme"]["logoTags"], urls),
                "gallery": [
                    {"url": urls[g["path"]], "scoutIds": g["scoutIds"], "noScoutsShown": g["noScoutsShown"]}
                    for g in gallery
                ],
            },
        )

    claim(db().transaction())
    delete_public_files(troop_id, keep_urls=site_urls(public))
    log.info("site published troop=%s slug=%s photos=%d left_out=%d", troop_id, slug, len(gallery), len(left_out))
    return {"url": f"/s/{slug}", "slug": slug, "leftOut": left_out}


@https_fn.on_call()
def unpublish_site(req: https_fn.CallableRequest) -> dict:
    """Take the public site down. The draft stays, so it can be published again."""
    troop_id = (req.data or {}).get("troopId")
    require_leader(req, troop_id)
    t = troop(troop_id)

    @firestore.transactional
    def take_down(tx) -> None:
        site = (t.get(transaction=tx).to_dict() or {}).get("site") or {}
        slug = site.get("slug")
        if slug:
            slug_ref = db().collection("slugs").document(slug)
            if _owner(slug_ref.get(transaction=tx)) == troop_id:
                tx.delete(slug_ref)
            tx.delete(db().collection("publicSites").document(slug))
        tx.set(t, {"site": {"slug": slug, "published": False, "publishedAt": None}}, merge=True)
        tx.delete(t.collection("site").document("published"))

    take_down(db().transaction())
    delete_public_files(troop_id)
    return {"published": False}


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}")
def on_event_written_site(event: firestore_fn.Event) -> None:
    """Keep a published site's upcoming events in step with the troop calendar."""
    t = troop(event.params["troopId"])
    site = (t.get().to_dict() or {}).get("site") or {}
    if not site.get("published") or not site.get("slug"):
        return
    ref = db().collection("publicSites").document(site["slug"])
    if not ref.get().exists:
        return
    ref.update({"events": _upcoming(t)})

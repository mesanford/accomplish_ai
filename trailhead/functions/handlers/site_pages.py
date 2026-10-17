"""Custom pages for the troop website. Pure: no Firestore or Storage calls here.

A page is stored as structured data, never as HTML, so nothing a leader types can run as script:

    page   = {id, title, slug, blocks: [block]}            (the order of the list is the order in the menu)
    block  = {type: "heading", text}
           | {type: "paragraph", inline: [span]}
           | {type: "list", items: [{inline: [span]}]}   (Firestore cannot store a list directly inside a list)
           | {type: "image", path, alt, scoutIds, noScoutsShown}   (path is a draft upload; published as url)
    span   = {text} | {text, href}                          (href is http, https or mailto, nothing else)
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from .site_common import InvalidSite, draft_path, tags

MAX_PAGES, MAX_BLOCKS, MAX_PAGE_IMAGES = 10, 40, 12
MAX_SPANS, MAX_LIST_ITEMS = 30, 20
LIMITS = {"title": 60, "heading": 120, "paragraph": 1500, "item": 300, "alt": 200, "href": 500}
PAGE_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
PAGE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,24}$")
RESERVED_PAGE_SLUGS = frozenset({"calendar", "documents", "home", "index"})
LINK_SCHEMES = frozenset({"http", "https", "mailto"})
BLOCK_TYPES = frozenset({"heading", "paragraph", "list", "image"})


def safe_href(value: object) -> str | None:
    """The link if it is an http, https or mailto address, else None. Anything else, such as javascript: or data:,
    is refused, as are links with spaces or control characters."""
    if not isinstance(value, str):
        return None
    href = value.strip()
    if not href or len(href) > LIMITS["href"] or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in href):
        return None
    try:
        parsed = urlparse(href)
    except ValueError:
        return None
    scheme = parsed.scheme.lower()
    if scheme not in LINK_SCHEMES:
        return None
    if scheme == "mailto":
        return href if parsed.path and "@" in parsed.path else None
    return href if parsed.netloc else None


def check_page_slug(slug: object) -> str:
    if not isinstance(slug, str) or not slug:
        raise InvalidSite("Each page needs a web address.")
    if not PAGE_SLUG_RE.match(slug):
        raise InvalidSite(
            "Page addresses use 1 to 40 lowercase letters, numbers and dashes, and can't start or end with a dash."
        )
    if slug in RESERVED_PAGE_SLUGS:
        raise InvalidSite(f'"{slug}" is used by the site already. Choose a different page address.')
    return slug


def _text(value: object, limit: int, label: str) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if len(text) > limit:
        raise InvalidSite(f"{label} must be {limit:,} characters or fewer.")
    return text


def clean_inline(value: object, limit: int, label: str) -> list[dict]:
    """A list of spans with trimmed text and only safe links. Empty spans are dropped."""
    if not isinstance(value, list) or len(value) > MAX_SPANS:
        if isinstance(value, list):
            raise InvalidSite(f"{label} has too many links or styles. Shorten it.")
        return []
    spans, total = [], 0
    for item in value:
        if not isinstance(item, dict):
            continue
        text = item.get("text") if isinstance(item.get("text"), str) else ""
        if not text:
            continue
        total += len(text)
        span: dict = {"text": text}
        if item.get("href") not in (None, ""):
            href = safe_href(item.get("href"))
            if href is None:
                raise InvalidSite(f'The link "{text[:40]}" must start with https://, http:// or mailto:.')
            span["href"] = href
        spans.append(span)
    if total > limit:
        raise InvalidSite(f"{label} must be {limit:,} characters or fewer.")
    if spans:
        spans[0]["text"] = spans[0]["text"].lstrip()
        spans[-1]["text"] = spans[-1]["text"].rstrip()
    return [s for s in spans if s["text"]]


def _block(block: dict, troop_id: str, title: str) -> dict | None:
    kind = block.get("type")
    if kind not in BLOCK_TYPES:
        raise InvalidSite(f'A block on the page "{title}" is not a known kind.')
    if kind == "heading":
        text = _text(block.get("text"), LIMITS["heading"], "A heading")
        return {"type": "heading", "text": text} if text else None
    if kind == "paragraph":
        inline = clean_inline(block.get("inline"), LIMITS["paragraph"], "A paragraph")
        return {"type": "paragraph", "inline": inline} if inline else None
    if kind == "list":
        raw = block.get("items")
        if isinstance(raw, list) and len(raw) > MAX_LIST_ITEMS:
            raise InvalidSite(f"A list can have up to {MAX_LIST_ITEMS} items.")
        items = [
            clean_inline(i.get("inline") if isinstance(i, dict) else None, LIMITS["item"], "A list item")
            for i in (raw if isinstance(raw, list) else [])
        ]
        items = [{"inline": i} for i in items if i]
        return {"type": "list", "items": items} if items else None
    path = draft_path(block.get("path"), troop_id)
    if path is None:
        return None
    return {
        "type": "image",
        "path": path,
        "alt": _text(block.get("alt"), LIMITS["alt"], "An image description"),
        **tags(block, "scoutIds", "noScoutsShown"),
    }


def validate_pages(pages: object, troop_id: str) -> list[dict]:
    """Cleaned pages in order. Raises InvalidSite with a plain message."""
    raw = [p for p in pages if isinstance(p, dict)] if isinstance(pages, list) else []
    if len(raw) > MAX_PAGES:
        raise InvalidSite(f"Your site can have up to {MAX_PAGES} extra pages.")
    clean: list[dict] = []
    seen_slugs: set[str] = set()
    for index, page in enumerate(raw, start=1):
        title = _text(page.get("title"), LIMITS["title"], "A page title")
        if not title:
            raise InvalidSite(f"Page {index} needs a title.")
        slug = check_page_slug(page.get("slug"))
        if slug in seen_slugs:
            raise InvalidSite(f'Two pages use the address "{slug}". Give each page its own address.')
        seen_slugs.add(slug)
        page_id = page.get("id") if isinstance(page.get("id"), str) and PAGE_ID_RE.match(page["id"]) else slug
        raw_blocks = page.get("blocks")
        blocks_raw = [b for b in raw_blocks if isinstance(b, dict)] if isinstance(raw_blocks, list) else []
        if len(blocks_raw) > MAX_BLOCKS:
            raise InvalidSite(f'The page "{title}" can have up to {MAX_BLOCKS} blocks.')
        blocks = [b for b in (_block(b, troop_id, title) for b in blocks_raw) if b]
        if sum(b["type"] == "image" for b in blocks) > MAX_PAGE_IMAGES:
            raise InvalidSite(f'The page "{title}" can have up to {MAX_PAGE_IMAGES} images.')
        clean.append({"id": page_id, "title": title, "slug": slug, "blocks": blocks})
    return clean


def page_image_paths(pages: list[dict]) -> list[str]:
    return [b["path"] for p in pages for b in p["blocks"] if b["type"] == "image"]


def filter_page_images(pages: list[dict], problem) -> tuple[list[dict], list[dict]]:
    """Pages without the images that can't be published, and the leader-facing list of what was left out.
    `problem(item)` returns the reason an image can't go up, or None (see site_build.image_problem)."""
    left_out: list[dict] = []
    kept_pages = []
    for page in pages:
        blocks = []
        for block in page["blocks"]:
            reason = problem(block) if block["type"] == "image" else None
            if reason:
                caption = block["alt"] or "An image"
                label = f'{caption} (page "{page["title"]}")'
                left_out.append({"path": block["path"], "caption": label, "reason": reason, "kind": "page"})
            else:
                blocks.append(block)
        kept_pages.append({**page, "blocks": blocks})
    return kept_pages, left_out


def public_pages(pages: list[dict], urls: dict[str, str]) -> list[dict]:
    """The pages as published: images carry a public url instead of a draft path."""
    result = []
    for page in pages:
        blocks = []
        for block in page["blocks"]:
            if block["type"] != "image":
                blocks.append(block)
            elif block["path"] in urls:
                blocks.append({"type": "image", "url": urls[block["path"]], "alt": block["alt"]})
        result.append({"id": page["id"], "title": page["title"], "slug": page["slug"], "blocks": blocks})
    return result


def page_image_records(pages: list[dict], urls: dict[str, str]) -> list[dict]:
    """Which Scouts each published page image shows, so a withdrawn consent can take it down."""
    return [
        {"url": urls[b["path"]], "scoutIds": b["scoutIds"], "noScoutsShown": b["noScoutsShown"]}
        for p in pages
        for b in p["blocks"]
        if b["type"] == "image" and b["path"] in urls
    ]


def page_urls(public_pages_: list[dict]) -> set[str]:
    blocks = (b for p in public_pages_ or [] for b in p.get("blocks", []))
    return {b["url"] for b in blocks if b.get("type") == "image" and b.get("url")}


def drop_image_urls(public_pages_: list[dict], urls: set[str]) -> list[dict]:
    return [
        {**p, "blocks": [b for b in p.get("blocks", []) if not (b.get("type") == "image" and b.get("url") in urls)]}
        for p in public_pages_ or []
    ]

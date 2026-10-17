"""Link previews for a troop site. Pure: given the page shell (the app's index.html) and a published site, return the
shell with that site's title, description and image in its head, so chat apps and search engines that don't run
JavaScript show the troop's details instead of Forthright's.
"""

from __future__ import annotations

import re
from html import escape
from urllib.parse import urlparse

HOST_RE = re.compile(r"^[A-Za-z0-9.-]{1,253}(?::\d{1,5})?$")
# Tags in the shell that describe Forthright's home page and must not leak into a troop page.
_STRIP = re.compile(r"<title>.*?</title>|<link\s+rel=\"canonical\"[^>]*>", re.IGNORECASE | re.DOTALL)
_STRIP_META = re.compile(r"<meta\s+(?:name|property)=\"(?:description|og:[^\"]+|twitter:[^\"]+)\"[^>]*>", re.I | re.S)


def parse_path(path: str) -> tuple[str, str | None] | None:
    """(slug, page) from /s/{slug} or /s/{slug}/{page}, else None."""
    parts = [p for p in path.split("/") if p]
    if len(parts) not in (2, 3) or parts[0] != "s":
        return None
    return parts[1].lower(), (parts[2].lower() if len(parts) == 3 else None)


def _first_paragraph(text: str) -> str:
    for part in re.split(r"\n\s*\n", text or ""):
        if part.strip():
            return part.strip()
    return ""


def describe(site: dict) -> str:
    """The same short description the page sets for itself: tagline, else the start of 'about', else a default."""
    base = (
        (site.get("cover") or {}).get("tagline")
        or _first_paragraph(site.get("about", ""))
        or (f"Scouts BSA Troop {site.get('unitNumber', '')}.")
    )
    return re.sub(r"\s+", " ", base).strip()[:160]


def page_title(site: dict, page: str | None) -> str:
    troop = f"{site.get('troopName', '')} · Scouts BSA Troop {site.get('unitNumber', '')}"
    if page == "calendar":
        return f"Calendar · {troop}"
    for p in site.get("pages") or []:
        if p.get("slug") == page and page:
            return f"{p.get('title', '')} · {troop}"
    return troop


def has_page(site: dict, page: str | None) -> bool:
    return page is None or page == "calendar" or any(p.get("slug") == page for p in site.get("pages") or [])


def _web_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme in ("http", "https") and parsed.netloc else None


def clean_host(host: str | None) -> str | None:
    return host if host and HOST_RE.match(host) else None


def meta_tags(
    site: dict, slug: str, page: str | None, host: str | None, scheme: str = "https", custom: bool = False
) -> str:
    """The head tags for a troop page. On a troop's own domain (`custom`) the address has no /s/{slug} part, and a
    marker tells the app which troop it is showing."""
    image = _web_url((site.get("cover") or {}).get("photoUrl")) or _web_url((site.get("theme") or {}).get("logoUrl"))
    title, description = page_title(site, page), describe(site)
    tags = [
        f"<title>{escape(title)}</title>",
        f'<meta name="description" content="{escape(description, quote=True)}" />',
        '<meta property="og:type" content="website" />',
        f'<meta property="og:site_name" content="{escape(site.get("troopName", ""), quote=True)}" />',
        f'<meta property="og:title" content="{escape(title, quote=True)}" />',
        f'<meta property="og:description" content="{escape(description, quote=True)}" />',
        f'<meta name="twitter:card" content="{"summary_large_image" if image else "summary"}" />',
    ]
    if host:
        path = ("" if custom else f"/s/{slug}") + (f"/{page}" if page else "") or "/"
        url = escape(f"{scheme}://{host}{path}", quote=True)
        tags += [f'<link rel="canonical" href="{url}" />', f'<meta property="og:url" content="{url}" />']
    if custom:
        tags += [f'<meta name="forthright-site" content="{escape(slug, quote=True)}" />']
    if image:
        tags += [f'<meta property="og:image" content="{escape(image, quote=True)}" />']
    return "\n    ".join(tags)


def inject_meta(shell: str, tags: str) -> str:
    """The shell with Forthright's own title and share tags replaced by `tags`."""
    stripped = _STRIP_META.sub("", _STRIP.sub("", shell))
    marker = re.search(r"</head>", stripped, re.IGNORECASE)
    if not marker:
        return stripped
    return f"{stripped[: marker.start()]}    {tags}\n  {stripped[marker.start() :]}"

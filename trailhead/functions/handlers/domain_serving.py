"""Which troop site a request for a custom domain should show. Pure: the caller passes in how to look things up."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from .site_meta import has_page

APP_HOSTS = ("forthrightapp.com", "www.forthrightapp.com", "localhost", "127.0.0.1")
APP_SUFFIXES = (".web.app", ".firebaseapp.com")
_HOST_RE = re.compile(r"^[a-z0-9.-]{1,253}$")


def request_host(forwarded: str | None, host: str | None) -> str | None:
    """The host the visitor typed: lowercase, no port, no trailing dot. Hosting passes it in X-Forwarded-Host."""
    raw = (forwarded or host or "").split(",")[0].strip().lower()
    raw = re.sub(r":\d+$", "", raw).rstrip(".")
    return raw if _HOST_RE.match(raw) else None


def is_app_host(host: str | None, extra: tuple[str, ...] = ()) -> bool:
    """True for Forthright's own addresses, which serve /s/{slug}; anything else is a troop's own domain."""
    if not host:
        return True
    return host in APP_HOSTS or host in extra or host.endswith(APP_SUFFIXES)


@dataclass(frozen=True)
class Served:
    slug: str
    page: str | None
    site: dict


@dataclass(frozen=True)
class Refused:
    """Not served: "unknown" (host not set up), "asset" (a missing file) or "page" (a page the site doesn't have)."""

    reason: str
    slug: str | None = None


@dataclass(frozen=True)
class Redirect:
    """The www twin: send the visitor to the main domain."""

    host: str


def page_of(path: str) -> tuple[str | None, bool]:
    """(page, ok) for a path on a troop's domain: "/" is the home page, "/{page}" a page. Deeper paths are not ok."""
    parts = [p for p in path.split("/") if p]
    if len(parts) > 1:
        return None, False
    return (parts[0].lower() if parts else None), True


def resolve(
    host: str,
    path: str,
    get_domain: Callable[[str], dict | None],
    get_site: Callable[[str], dict | None],
) -> Served | Refused | Redirect:
    """Map a custom-domain request to the troop's published site."""
    domain = get_domain(host)
    if not domain or not domain.get("slug") or domain.get("status") == "failed" or domain.get("pendingRemoval"):
        return Refused("unknown")
    if domain.get("redirectTo"):
        return Redirect(domain["redirectTo"])
    site = get_site(domain["slug"])
    if site is None:
        return Refused("unknown")
    page, ok = page_of(path)
    if page and "." in page:
        return Refused("asset", domain["slug"])
    if not ok or not has_page(site, page):
        return Refused("page", domain["slug"])
    return Served(domain["slug"], page, site)

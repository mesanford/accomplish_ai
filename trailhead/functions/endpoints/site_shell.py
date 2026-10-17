"""Serves /s/{slug} and /s/{slug}/{page} through Hosting so link previews show the troop's own details.

The app is a single-page app, so every address returns the same index.html and chat apps would show Forthright's
title. Hosting rewrites /s/** to this function, which reads the published site, fetches the app's own index.html
and puts the troop's title, description and cover image in its head. Browsers then load the app as usual.
"""

from __future__ import annotations

import logging
import os
import time
import urllib.request

from firebase_functions import https_fn

from fb import db
from handlers.site_meta import clean_host, has_page, inject_meta, meta_tags, parse_path

log = logging.getLogger(__name__)
CACHE_SECONDS = 300
_shell: dict = {"html": None, "at": 0.0}


def app_origin() -> str:
    """Where the built app lives. Fixed by configuration, never taken from the request, so a forged Host header
    can't make this function fetch from another site."""
    configured = os.environ.get("TRAILHEAD_SITE_ORIGIN")
    if configured:
        return configured.rstrip("/")
    if os.environ.get("FUNCTIONS_EMULATOR") == "true":
        return "http://127.0.0.1:5000"
    project = os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT") or ""
    return f"https://{project}.web.app"


def load_shell() -> str | None:
    """The app's index.html, kept for a few minutes."""
    if _shell["html"] and time.time() - _shell["at"] < CACHE_SECONDS:
        return _shell["html"]
    try:
        with urllib.request.urlopen(f"{app_origin()}/index.html", timeout=5) as res:  # noqa: S310 (fixed https origin)
            html = res.read().decode("utf-8")
    except (OSError, ValueError):
        return _shell["html"]
    if '<div id="root">' not in html:
        return _shell["html"]
    _shell.update(html=html, at=time.time())
    return html


@https_fn.on_request(memory=256, timeout_sec=15)
def site_shell(req: https_fn.Request) -> https_fn.Response:
    """The app shell with a troop's link-preview tags. If the site isn't published, the plain shell with a 404."""
    shell = load_shell()
    if shell is None:
        log.warning("site shell unavailable")
        return https_fn.Response("Try again in a moment.", status=503, headers={"Retry-After": "30"})
    parsed = parse_path(req.path)
    site = None
    if parsed:
        snap = db().collection("publicSites").document(parsed[0]).get()
        site = snap.to_dict() if snap.exists else None
    if not parsed or site is None or not has_page(site, parsed[1]):
        return https_fn.Response(shell, status=404, headers={"Content-Type": "text/html; charset=utf-8"})
    host = clean_host(req.headers.get("X-Forwarded-Host") or req.headers.get("Host"))
    scheme = "http" if (host or "").startswith(("127.0.0.1", "localhost")) else "https"
    html = inject_meta(shell, meta_tags(site, parsed[0], parsed[1], host, scheme))
    headers = {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=300"}
    return https_fn.Response(html, status=200, headers=headers)

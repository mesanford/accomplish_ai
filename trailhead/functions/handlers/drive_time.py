"""Drive time from the troop's meeting place to a place on a Google Maps link. Pure functions; the network calls are
passed in, so tests never reach Google or OpenRouteService.

A planner pastes a Google Maps link on a research card. We read the place's location from the link itself (a
phone's short link is followed, but only to Google's own addresses), or look up the place's name if the link has
no coordinates. OpenRouteService, built on OpenStreetMap, then gives the driving time from the troop's meeting
place, whose address is turned into a location once and kept. The result is a typical-conditions estimate with no
live traffic, and the planner can change it.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from urllib.parse import parse_qs, unquote_plus, urlparse

from handlers.membership import InvalidInput

MAPS_HOSTS = {"google.com", "www.google.com", "maps.google.com"}
SHORT_HOSTS = {"maps.app.goo.gl", "goo.gl"}
MAX_URL = 500
MAX_REDIRECTS = 5
METERS_PER_MILE = 1609.344
NOT_A_MAPS_LINK = "Paste a Google Maps link, such as one from Share in Google Maps."

Coords = tuple[float, float]  # (latitude, longitude)


def _coords(lat: str, lng: str) -> Coords | None:
    la, ln = float(lat), float(lng)
    return (la, ln) if -90 <= la <= 90 and -180 <= ln <= 180 else None


def is_google(url: str) -> bool:
    """A Google Maps page or short link, over https. The only addresses we ever fetch when following a link."""
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        return False
    return host in SHORT_HOSTS or (host in MAPS_HOSTS and parts.path.startswith("/maps"))


def read_link(url: str) -> tuple[str, object]:
    """What a Google Maps link tells us: ("coords", (lat, lng)), ("short", url) to follow, or ("query", name)."""
    url = url.strip() if isinstance(url, str) else ""
    if not url or len(url) > MAX_URL or not is_google(url):
        raise InvalidInput(NOT_A_MAPS_LINK)
    parts = urlparse(url)
    if (parts.hostname or "").lower() in SHORT_HOSTS:
        return "short", url
    # A place's own pin (!3d lat !4d lng) is more exact than the map's center (@lat,lng).
    for pattern in (r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", r"@(-?\d+\.\d+),(-?\d+\.\d+)"):
        match = re.search(pattern, url)
        if match and (found := _coords(*match.groups())):
            return "coords", found
    params = parse_qs(parts.query)
    for key in ("q", "query", "destination", "ll"):
        value = (params.get(key) or [""])[0].strip()
        match = re.fullmatch(r"(-?\d+\.\d+),\s*(-?\d+\.\d+)", value)
        if match and (found := _coords(*match.groups())):
            return "coords", found
        if value and key != "ll":
            return "query", value[:200]
    place = re.search(r"/maps/place/([^/]+)", parts.path)
    if place:
        return "query", unquote_plus(place.group(1))[:200]
    raise InvalidInput("That link doesn't point at a place. Open the place in Google Maps and share it.")


def home_address(meeting_place: dict | None) -> str | None:
    """The troop's meeting place as one line for lookup, or None if it lacks a street with a city and state, or a
    ZIP code."""
    mp = meeting_place or {}
    street, city, state, zip_code = (str(mp.get(k) or "").strip() for k in ("street", "city", "state", "zip"))
    if not ((street and city and state) or zip_code):
        return None
    return ", ".join(p for p in (street, city, f"{state} {zip_code}".strip()) if p)


def geocoded(doc: dict) -> Coords | None:
    """The first match from OpenRouteService's geocoder (GeoJSON, coordinates are [lng, lat])."""
    try:
        lng, lat = doc["features"][0]["geometry"]["coordinates"][:2]
        return _coords(str(lat), str(lng))
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def route_summary(doc: dict) -> tuple[int, float] | None:
    """(whole minutes, miles to one decimal) from OpenRouteService's driving directions."""
    try:
        summary = doc["routes"][0]["summary"]
        return round(float(summary["duration"]) / 60), round(float(summary["distance"]) / METERS_PER_MILE, 1)
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def destination(url: str, follow: Callable[[str], str | None], geocode: Callable[[str], Coords | None]) -> Coords:
    """Where the link points. `follow` returns a short link's next address (or None); `geocode` looks up a name."""
    kind, value = read_link(url)
    for _ in range(MAX_REDIRECTS):
        if kind != "short":
            break
        nxt = follow(value)
        if not nxt or not is_google(nxt):
            raise InvalidInput("That short link didn't lead to a Google Maps place. Try the full link instead.")
        kind, value = read_link(nxt)
    if kind == "short":
        raise InvalidInput("That short link didn't lead to a Google Maps place. Try the full link instead.")
    if kind == "coords":
        return value  # type: ignore[return-value]
    found = geocode(str(value))
    if found is None:
        raise InvalidInput("We couldn't find that place. Try a link with the place's pin on it.")
    return found

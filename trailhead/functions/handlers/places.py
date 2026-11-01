"""The place catalog: campgrounds and parks troops can research, from public sources. Pure functions, no network.

Every place (top-level `places/{id}`) has a name, a kind, a state, a location, a link to its own page, whether it
is known to have camping, and where the record came from with the credit that source asks for. Availability is
never read: troops follow the link and record what they learn on a research card.
"""

from __future__ import annotations

import html
import math
import re

FEDERAL, STATE_PARK, HIGH_ADVENTURE = "federal", "statePark", "highAdventure"
CAMP_YES, CAMP_NEARBY, CAMP_CHECK = "yes", "nearby", "check"  # nearby: a campground is mapped close by
RIDB_CREDIT = "Recreation.gov"
OSM_CREDIT = "© OpenStreetMap contributors"
NEAREST_STATE_KM = 25.0  # a campground with no state on record takes the nearest one's within this distance
CAMP_NEAR_KM = 5.0  # a mapped campground this close to a park's center counts as nearby
TWIN_KM = 10.0  # an OpenStreetMap park this close to an official one with the same name before "State" is it
STATE_PARK_NAME = re.compile(r" State (Park|Forest|Recreation Area)$")


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance along the earth's surface between two (lat, lng) points."""
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def plain(raw: str | None, limit: int = 300) -> str:
    """Text without HTML, cut at a word near `limit`."""
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def _coord(raw) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value != 0 else None


def federal_places(facilities: list[dict], addresses: list[dict], rec_area_addresses: list[dict]) -> dict:
    """Recreation.gov campgrounds (enabled, with a location and a state) by place id."""
    state_of = {a["FacilityID"]: a["AddressStateCode"] for a in addresses if a.get("AddressStateCode")}
    area_state = {a["RecAreaID"]: a["AddressStateCode"] for a in rec_area_addresses if a.get("AddressStateCode")}
    out, unplaced = {}, []
    for f in facilities:
        if f.get("FacilityTypeDescription") != "Campground" or f.get("Enabled") != "true":
            continue
        lat, lng = _coord(f.get("FacilityLatitude")), _coord(f.get("FacilityLongitude"))
        state = state_of.get(f["FacilityID"]) or area_state.get(f.get("ParentRecAreaID") or "")
        if lat is None or lng is None:
            continue
        if not state:
            unplaced.append((f, lat, lng))
            continue
        out[f"ridb_{f['FacilityID']}"] = _federal(f, state, lat, lng)
    known = [(p["lat"], p["lng"], p["state"]) for p in out.values()]
    for f, lat, lng in unplaced:  # no state on record: the nearest campground's, if it is close enough
        nearest = min(((km((lat, lng), (a, b)), st) for a, b, st in known), default=None)
        if nearest and nearest[0] <= NEAREST_STATE_KM:
            out[f"ridb_{f['FacilityID']}"] = _federal(f, nearest[1], lat, lng)
    return out


def _federal(f: dict, state: str, lat: float, lng: float) -> dict:
    reservable = f.get("Reservable") == "true"
    page = f"https://www.recreation.gov/camping/campgrounds/{f['FacilityID']}" if reservable else None
    return {
        "name": plain(f.get("FacilityName"), 120),
        "kind": FEDERAL,
        "state": state.upper()[:2],
        "lat": round(lat, 5),
        "lng": round(lng, 5),
        "url": (f.get("FacilityReservationURL") or "").strip() or page,
        "bookingUrl": page,
        "camping": CAMP_YES,
        "description": plain(f.get("FacilityDescription")),
        "source": "recreation.gov",
        "credit": RIDB_CREDIT,
    }


def osm_parks(state: str, elements: list[dict], booking: str | None) -> dict:
    """State parks, forests and recreation areas from an Overpass answer. Campgrounds come in the same answer;
    a park with one mapped near its center is marked "nearby" (it may be the park's own, or a private one next door)."""

    def where(e):
        center = e.get("center") or {}
        return e.get("lat", center.get("lat")), e.get("lon", center.get("lon"))

    camps = [where(e) for e in elements if not e.get("tags") or e["tags"].get("tourism") == "camp_site"]
    camps = [c for c in camps if c[0] is not None and c[1] is not None]
    out, seen = {}, set()
    for e in elements:
        tags, center = e.get("tags") or {}, e.get("center") or {}
        name = (tags.get("name") or "").strip()
        if tags.get("tourism") == "camp_site" or not STATE_PARK_NAME.search(name) or center.get("lat") is None:
            continue
        if _key(name) in seen:  # the same park mapped twice (its outline and its relation)
            continue
        seen.add(_key(name))
        here = (center["lat"], center["lon"])
        out[f"osm_{e['type'][0]}{e['id']}"] = {
            "name": name[:120],
            "kind": STATE_PARK,
            "state": state,
            "lat": round(here[0], 5),
            "lng": round(here[1], 5),
            "url": tags.get("website") or tags.get("url") or None,
            "bookingUrl": booking,
            "camping": CAMP_NEARBY if any(km(here, c) <= CAMP_NEAR_KM for c in camps) else CAMP_CHECK,
            "description": "",
            "source": "openstreetmap",
            "credit": OSM_CREDIT,
        }
    return out


def layer_parks(state: str, features: list[dict], source: dict) -> dict:
    """Parks from a state's own GIS layer (see places_states.STATE_SOURCES)."""
    fields, out = source["fields"], {}
    for f in features:
        attrs, center = f.get("attributes") or {}, f.get("centroid") or _box_center(f.get("geometry"))
        name = (attrs.get(fields["name"]) or "").strip()
        if not name or center.get("y") is None:
            continue
        key = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        out[f"{state.lower()}_{key}"] = {
            "name": name[:120],
            "kind": STATE_PARK,
            "state": state,
            "lat": round(center["y"], 5),
            "lng": round(center["x"], 5),
            "url": attrs.get(fields["url"]) or None,
            "bookingUrl": source.get("booking"),
            "camping": CAMP_CHECK,
            "description": "",
            "source": "state",
            "credit": source["credit"],
        }
    return out


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _stem(name: str) -> str:
    """The part of a name before " State ...", such as "devilslake" for Devil's Lake State Park."""
    return _key(re.split(r" State ", name, maxsplit=1)[0])


def _twin(park: dict, official: dict) -> str | None:
    """The official park that is this one: the same name, or the same name before "State" close by."""
    for pid, other in official.items():
        if _key(other["name"]) == _key(park["name"]):
            return pid
    here = (park["lat"], park["lng"])
    for pid, other in official.items():
        if _stem(other["name"]) == _stem(park["name"]) and km(here, (other["lat"], other["lng"])) <= TWIN_KM:
            return pid
    return None


def merge_state(official: dict, mapped: dict) -> dict:
    """A state's official list is the list. OpenStreetMap only adds what it knows about those parks (camping): its
    extra entries are mostly parks across the border or the same park under another name."""
    out = dict(official)
    for park in mapped.values():
        twin = _twin(park, official)
        if twin and park["camping"] == CAMP_NEARBY:
            out[twin] = {**out[twin], "camping": CAMP_NEARBY}
    return out


def _box_center(geometry: dict | None) -> dict:
    """The middle of a polygon's bounding box, for a park whose layer gave no center point."""
    points = [pt for ring in (geometry or {}).get("rings") or [] for pt in ring]
    if not points:
        return {}
    xs, ys = [pt[0] for pt in points], [pt[1] for pt in points]
    return {"x": (min(xs) + max(xs)) / 2, "y": (min(ys) + max(ys)) / 2}

"""Finding places near the troop for a plan's research step. Pure functions, no network or Firestore.

Places in the troop's state and the states next to it are ranked by distance from the meeting place. Before real
drive times are asked for, a rough one (straight-line miles, a little longer by road, at highway speed) leaves out
what is clearly beyond the plan's longest drive.
"""

from __future__ import annotations

from handlers.places import HIGH_ADVENTURE, km

KM_PER_MILE = 1.609344
ROAD_FACTOR = 1.3  # roads are longer than a straight line
MPH = 50
SHOWN = ("name", "kind", "state", "url", "bookingUrl", "camping", "description", "credit", "facts", "checkedOn")


def rough_minutes(miles: float) -> int:
    return round(miles * ROAD_FACTOR / MPH * 60)


def rank(places: dict[str, dict], home: tuple[float, float] | None, max_drive: int | None, limit: int) -> list[dict]:
    """Nearest first, as the app shows them. Without a known meeting place, by name."""
    out = []
    for pid, p in places.items():
        miles = round(km(home, (p["lat"], p["lng"])) / KM_PER_MILE) if home else None
        if max_drive and miles is not None and rough_minutes(miles) > max_drive * 1.25:
            continue
        out.append({"id": pid, **{k: p.get(k) for k in SHOWN}, "lat": p["lat"], "lng": p["lng"], "miles": miles})
    out.sort(key=lambda r: (r["miles"] is None, r["miles"] or 0, r["name"]))
    return out[:limit]


def nearby_kinds(places: dict[str, dict]) -> dict[str, dict]:
    """Everything but the high adventure bases, which are listed on their own."""
    return {pid: p for pid, p in places.items() if p.get("kind") != HIGH_ADVENTURE}


def with_drive_times(rows: list[dict], seconds: list[float | None]) -> list[dict]:
    """Rows with the drive minutes OpenRouteService gave (None where it found no route), in the same order."""
    return [
        {**r, "driveMinutes": round(s / 60) if isinstance(s, int | float) else None}
        for r, s in zip(rows, seconds, strict=False)
    ]

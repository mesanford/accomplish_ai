"""US states for the place catalog: names, which states border which, and official state sources. Pure data.

`STATE_SOURCES` lists official state park data (GIS layers a state publishes for reuse) and booking sites, added by
hand once checked. A state without an entry uses OpenStreetMap alone, and its parks link to their own pages.
"""

from __future__ import annotations

NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}  # fmt: skip

# States that share a land border (Alaska and Hawaii have none; the Four Corners touch at a point, which doesn't count).
# Kept symmetric; a test checks it.
NEIGHBORS = {
    "AL": "FL GA MS TN", "AK": "", "AZ": "CA NM NV UT", "AR": "LA MO MS OK TN TX", "CA": "AZ NV OR",
    "CO": "KS NE NM OK UT WY", "CT": "MA NY RI", "DE": "MD NJ PA", "DC": "MD VA", "FL": "AL GA",
    "GA": "AL FL NC SC TN", "HI": "", "ID": "MT NV OR UT WA WY", "IL": "IA IN KY MO WI", "IN": "IL KY MI OH",
    "IA": "IL MN MO NE SD WI", "KS": "CO MO NE OK", "KY": "IL IN MO OH TN VA WV", "LA": "AR MS TX",
    "ME": "NH", "MD": "DC DE PA VA WV", "MA": "CT NH NY RI VT", "MI": "IN OH WI", "MN": "IA ND SD WI",
    "MS": "AL AR LA TN", "MO": "AR IA IL KS KY NE OK TN", "MT": "ID ND SD WY", "NE": "CO IA KS MO SD WY",
    "NV": "AZ CA ID OR UT", "NH": "MA ME VT", "NJ": "DE NY PA", "NM": "AZ CO OK TX",
    "NY": "CT MA NJ PA VT", "NC": "GA SC TN VA", "ND": "MN MT SD", "OH": "IN KY MI PA WV",
    "OK": "AR CO KS MO NM TX", "OR": "CA ID NV WA", "PA": "DE MD NJ NY OH WV", "RI": "CT MA",
    "SC": "GA NC", "SD": "IA MN MT ND NE WY", "TN": "AL AR GA KY MO MS NC VA", "TX": "AR LA NM OK",
    "UT": "AZ CO ID NV WY", "VT": "MA NH NY", "VA": "DC KY MD NC TN WV", "WA": "ID OR",
    "WV": "KY MD OH PA VA", "WI": "IA IL MI MN", "WY": "CO ID MT NE SD UT",
}  # fmt: skip

STATE_SOURCES = {
    "WI": {
        "booking": "https://wisconsin.goingtocamp.com/",
        "layer": "https://services5.arcgis.com/Ul9AyFFeFTjf08DW/ArcGIS/rest/services/PR_WSPS_Properties_AR/FeatureServer/0",
        "fields": {"name": "PROP_NAME", "type": "PROP_TYPE", "url": "INFO_URL"},
        "credit": "Wisconsin DNR",
    },
}


def neighbors(state: str) -> list[str]:
    return NEIGHBORS.get(state, "").split()


def region(state: str) -> list[str]:
    """The troop's state first, then the states next to it."""
    return [state, *neighbors(state)] if state in NAMES else []


def booking_site(state: str) -> str | None:
    return (STATE_SOURCES.get(state) or {}).get("booking")

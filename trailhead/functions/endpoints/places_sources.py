"""Reading the place catalog's public sources. Each function returns the source's raw rows; handlers/places*.py turn
them into places. Only the refresh job calls these, a few times a year, one request at a time.
"""

from __future__ import annotations

import csv
import io
import json
import os
import urllib.parse
import urllib.request
import zipfile

from handlers.places_ha import FACTS_SCHEMA, SYSTEM
from handlers.places_states import STATE_SOURCES

RIDB_EXPORT = "https://ridb.recreation.gov/downloads/RIDBFullExport_V1_CSV.zip"
RIDB_FILES = ("Facilities_API_v1.csv", "FacilityAddresses_API_v1.csv", "RecAreaAddresses_API_v1.csv")
OVERPASS = "https://overpass-api.de/api/interpreter"
AGENT = {"User-Agent": "Forthright/1.0 (+https://forthrightapp.com)"}
HA_MODEL = "claude-haiku-5-5"  # reading facts off one page: the small model does it well


class _Ranged(io.RawIOBase):
    """A remote file read with HTTP range requests, so one file inside a large zip is fetched without the rest.
    The Recreation.gov export stores its files uncompressed, which makes this cheap."""

    def __init__(self, url: str):
        self.url, self.pos = url, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers=AGENT), timeout=60) as r:
            self.size = int(r.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = {0: offset, 1: self.pos + offset, 2: self.size + offset}[whence]
        return self.pos

    def readinto(self, buffer):
        if self.pos >= self.size or not len(buffer):
            return 0
        end = min(self.pos + len(buffer), self.size) - 1
        headers = {**AGENT, "Range": f"bytes={self.pos}-{end}"}
        with urllib.request.urlopen(urllib.request.Request(self.url, headers=headers), timeout=120) as r:
            data = r.read()
        buffer[: len(data)] = data
        self.pos += len(data)
        return len(data)


def ridb_tables() -> list[list[dict]]:
    """Facilities, their addresses and their recreation areas' addresses, as rows."""
    archive = zipfile.ZipFile(io.BufferedReader(_Ranged(RIDB_EXPORT), buffer_size=1 << 20))
    out = []
    for name in RIDB_FILES:
        with archive.open(name) as f:
            out.append(list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))))
    return out


def overpass_state(state: str) -> list[dict]:
    """A state's parks, forests and recreation areas (with tags) and its campgrounds (location only)."""
    query = f"""[out:json][timeout:180];
area["ISO3166-2"="US-{state}"][admin_level=4]->.st;
(
  way["name"~" State (Park|Forest|Recreation Area)$"]["boundary"~"protected_area|national_park"](area.st);
  relation["name"~" State (Park|Forest|Recreation Area)$"]["boundary"~"protected_area|national_park"](area.st);
  way["name"~" State (Park|Forest|Recreation Area)$"]["leisure"~"park|nature_reserve"](area.st);
  relation["name"~" State (Park|Forest|Recreation Area)$"]["leisure"~"park|nature_reserve"](area.st);
);
out tags center;
nwr["tourism"="camp_site"](area.st);
out center;"""
    body = urllib.parse.urlencode({"data": query}).encode()
    with urllib.request.urlopen(urllib.request.Request(OVERPASS, body, AGENT), timeout=240) as r:
        return json.loads(r.read()).get("elements") or []


def state_layer(state: str) -> list[dict]:
    """A state's official park layer (see places_states.STATE_SOURCES): each park's fields and center point."""
    source = STATE_SOURCES[state]
    fields = ",".join(source["fields"].values())
    # A simplified outline too, for the few parks the layer gives no center point.
    params = {"where": "1=1", "outFields": fields, "returnGeometry": "true", "returnCentroid": "true"}
    params |= {"maxAllowableOffset": 0.01, "geometryPrecision": 3}
    url = f"{source['layer']}/query?{urllib.parse.urlencode({**params, 'outSR': 4326, 'f': 'json'})}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=120) as r:
        return json.loads(r.read()).get("features") or []


def fetch_page(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=60) as r:
        return r.read(3_000_000).decode("utf-8", "replace")


def ask_claude(prompt: str) -> dict:
    """Facts from one program page, as FACTS_SCHEMA JSON. The key is the ANTHROPIC_API_KEY secret."""
    from handlers.claude_model import real_client

    response = real_client(os.environ).messages.create(
        model=HA_MODEL,
        max_tokens=1500,
        system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": FACTS_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", None) == "text")
    return json.loads(text) if text.strip() else {}

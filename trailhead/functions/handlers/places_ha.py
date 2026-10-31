"""High adventure programs in the place catalog. Pure functions; the page fetch and the Claude call are passed in.

The four national high adventure bases are listed here by hand with their official sites. Each refresh reads the
site's own page and asks Claude for a few facts (ages, crew size, season, cost, booking), each with the exact words
it came from. A fact is kept only when those words really are on the page, so nothing is stated that the program's
own page doesn't say. Troops are always told to confirm on the program's site.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from handlers.places import HIGH_ADVENTURE, plain

# Locations are approximate (near each base), for distance only.
BASES = {
    "ha_philmont": {"name": "Philmont Scout Ranch", "state": "NM", "lat": 36.51, "lng": -104.92,
                    "url": "https://www.philmontscoutranch.org/"},
    "ha_northern_tier": {"name": "Northern Tier High Adventure", "state": "MN", "lat": 47.95, "lng": -91.56,
                         "url": "https://www.ntier.org/"},
    "ha_sea_base": {"name": "Florida National High Adventure Sea Base", "state": "FL", "lat": 24.85, "lng": -80.73,
                    "url": "https://www.bsaseabase.org/"},
    "ha_summit": {"name": "Summit Bechtel Reserve", "state": "WV", "lat": 37.93, "lng": -81.15,
                  "url": "https://www.summitbsa.org/"},
}  # fmt: skip
LABELS = ("ages", "crewSize", "season", "cost", "booking", "requirements")
MAX_PAGE_CHARS = 30_000
CREDIT = "The program's own website"
FACTS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "enum": list(LABELS)},
                    "value": {"type": "string"},
                    "quote": {"type": "string"},
                },
                "required": ["label", "value", "quote"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "facts"],
    "additionalProperties": False,
}
SYSTEM = (
    "You read one web page from a Scouting high adventure program and pull out facts a troop needs when choosing a "
    "trip. Use only what the page says. For every fact, copy the exact words from the page that support it into "
    "`quote`. Leave a fact out if the page does not state it. The summary is one plain sentence about what the "
    "program offers, using only the page's information."
)


def page_text(raw_html: str) -> str:
    """Readable text of a page, without scripts, styles or tags, cut to what Claude reads."""
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw_html or "")
    return plain(text, MAX_PAGE_CHARS)


def _squash(text: str) -> str:
    return re.sub(r"\W+", " ", text.lower()).strip()


def supported(facts: list[dict], text: str) -> list[dict]:
    """Only facts whose quote is really on the page (ignoring case, spacing and punctuation), one per label."""
    page, out, seen = _squash(text), [], set()
    for f in facts if isinstance(facts, list) else []:
        quote = _squash(str(f.get("quote") or ""))
        label = f.get("label")
        if label in LABELS and label not in seen and len(quote) >= 12 and quote in page:
            seen.add(label)
            out.append({"label": label, "value": plain(str(f.get("value") or ""), 200), "quote": f["quote"][:300]})
    return out


def base_place(pid: str, facts: list[dict], summary: str, checked_on: str | None) -> dict:
    base = BASES[pid]
    return {
        "name": base["name"],
        "kind": HIGH_ADVENTURE,
        "state": base["state"],
        "lat": base["lat"],
        "lng": base["lng"],
        "url": base["url"],
        "bookingUrl": base["url"],
        "camping": "yes",
        "description": plain(summary),
        "facts": facts,
        "checkedOn": checked_on,
        "source": "program",
        "credit": CREDIT,
    }


def read_base(pid: str, fetch: Callable[[str], str], ask: Callable[[str], dict], today: str) -> dict:
    """The base's place, with whatever facts its page supports. A page or model failure leaves it without facts."""
    try:
        text = page_text(fetch(BASES[pid]["url"]))
        answer = ask(f"Program: {BASES[pid]['name']}\nPage: {BASES[pid]['url']}\n\n{text}") if text else {}
    except Exception:
        return base_place(pid, [], "", None)
    facts = supported(answer.get("facts") or [], text)
    summary = answer.get("summary") or ""
    # The summary is also held to the page: only kept if most of its words are on it.
    words = [w for w in _squash(summary).split() if len(w) > 3]
    page = set(_squash(text).split())
    if not words or sum(w in page for w in words) < 0.8 * len(words):
        summary = ""
    return base_place(pid, facts, summary, today)

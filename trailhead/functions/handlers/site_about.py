"""The "About us" writing helper: prompt building, name scrubbing and the local stand-in. Pure.

Youth Protection: Scout names never reach the model. Any roster Scout's name in the leader's notes is
replaced before the prompt is built.
"""

from __future__ import annotations

import re

MAX_NOTES_CHARS = 1500
MAX_ABOUT_CHARS = 4000

SYSTEM_PROMPT = """You write the "About us" section of a Scouts BSA troop's public website.
Write 2 or 3 short, friendly paragraphs in plain language for families who are new to Scouting.
Use only facts from the leader's notes and the troop details; never invent dates, places, numbers or awards.
Never name or describe an individual young person. Refer to youth only as "Scouts" or "our Scouts".
Separate paragraphs with one blank line. No headings, lists, emoji or markdown. Reply with the text only."""


def validate_notes(notes: object) -> str:
    if not isinstance(notes, str) or not notes.strip():
        raise ValueError("Write a few notes about your troop first.")
    if len(notes.strip()) > MAX_NOTES_CHARS:
        raise ValueError(f"Keep your notes under {MAX_NOTES_CHARS:,} characters.")
    return notes.strip()


def scrub_names(text: str, scout_names: list[str]) -> str:
    """Replace each Scout's full name, then each part of it, with "a Scout"."""
    parts: list[str] = []
    for name in scout_names:
        name = (name or "").strip()
        if not name:
            continue
        parts.append(name)
        parts.extend(p for p in re.split(r"\s+", name) if len(p) >= 2)
    for part in sorted(set(parts), key=len, reverse=True):
        text = re.sub(rf"(?<!\w){re.escape(part)}(?!\w)", "a Scout", text, flags=re.IGNORECASE)
    return text


def build_prompt(troop_doc: dict, notes: str) -> str:
    council = troop_doc.get("council") or "not given"
    return (
        f"Troop name: {troop_doc.get('name') or 'not given'}\n"
        f"Unit number: {troop_doc.get('unitNumber') or 'not given'}\n"
        f"Council: {council}\n\n"
        f"The leader's notes:\n{notes}\n\n"
        "Write the About us text now."
    )


def clean_about(text: object) -> str:
    """Trim model output to plain paragraphs that fit the draft's limit."""
    if not isinstance(text, str):
        return ""
    lines = [line.strip().lstrip("#*-• ").strip() for line in text.strip().splitlines()]
    paragraphs, current = [], []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs)[:MAX_ABOUT_CHARS].strip()


def fake_about(troop_doc: dict, notes: str) -> str:
    """The emulator's stand-in for Claude: a predictable draft built from the notes, never a network call."""
    name = troop_doc.get("name") or "Our troop"
    unit = troop_doc.get("unitNumber")
    council = troop_doc.get("council")
    where = f" in the {council}" if council else ""
    first = f"{name}{f' (Troop {unit})' if unit else ''} is a Scouts BSA troop{where}. We welcome new families."
    detail = " ".join(line.strip() for line in notes.splitlines() if line.strip())
    second = f"Here's what we're about: {detail}"
    third = "Come visit a meeting. Scouts lead the way, and adults are there to guide and keep everyone safe."
    return "\n\n".join([first, second, third])

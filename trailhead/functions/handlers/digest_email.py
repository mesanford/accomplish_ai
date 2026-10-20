"""The weekly digest email. Pure functions, no network or Firestore.

Only first names go in it, and only announcement titles, never their text (the reader opens the app for that).
"""

from __future__ import annotations

from datetime import date
from html import escape

from handlers.digest import Digest
from handlers.email_templates import Email, _link, _page, join_names
from trailhead_core.dates import human


def _day(d: date) -> str:
    return f"{d:%a}, {d:%b} {d.day}"


def _event_line(e: dict) -> str:
    parts = [_day(e["day"]), *([e["time"]] if e["time"] else []), e["title"], *([e["place"]] if e["place"] else [])]
    line = " · ".join(parts)
    if e["cancelled"]:
        return f"CANCELLED: {line}"
    return f"{line} (signed up: {join_names(e['names'])})" if e["names"] else line


def sections(d: Digest) -> list[tuple[str, list[str]]]:
    """(heading, lines) for each part that has something in it."""
    out = []
    if d.events:
        out.append(("This week", [_event_line(e) for e in d.events]))
    if d.waiting:
        out.append(("Waiting for your permission", [f"{join_names(w['names'])}: {w['title']}" for w in d.waiting]))
    if d.deadlines:
        out.append(("Sign-ups closing soon", [f"{x['title']}: sign up by {human(x['deadline'])}" for x in d.deadlines]))
    if d.posts:
        out.append(("New announcements", d.posts))
    return out


def weekly_digest(troop_name: str, d: Digest, first: date, troop_id: str, app_url: str) -> Email:
    subject = f"{troop_name}: the week of {first:%b} {first.day}"
    parts = sections(d)
    home, account, privacy = f"{app_url}/t/{troop_id}/events", f"{app_url}/account", f"{app_url}/privacy"
    text_blocks = [f"{heading}\n" + "\n".join(f"- {line}" for line in lines) for heading, lines in parts]
    footer_text = [
        "You get this weekly email because you are in a troop on Forthright.",
        f"To stop it, open your Account page: {account}",
        f"Privacy policy: {privacy}",
    ]
    text = "\n\n".join([subject, *text_blocks, f"Open Forthright: {home}", *footer_text])
    html_blocks = [
        f"<strong>{escape(heading)}</strong><br>" + "<br>".join(escape(line) for line in lines)
        for heading, lines in parts
    ]
    footer_html = [
        "You get this weekly email because you are in a troop on Forthright. "
        f"To stop it, open your {_link('Account page', account)}. Read the {_link('privacy policy', privacy)}."
    ]
    return Email(subject, text, _page(html_blocks, ("Open Forthright", home), footer_html))

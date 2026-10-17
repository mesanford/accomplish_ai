"""The email for an announcement or newsletter: plain text and simple HTML. Pure functions.

Every line a person typed is escaped before it goes into the HTML. Every email names the sender and the troop, links
to the post in the app, and says how to turn these emails off.
"""

from __future__ import annotations

from datetime import date
from html import escape

from handlers.email_templates import FONT, Email, _link, _page


def event_line(event: dict) -> str:
    """ "Sat Oct 17, 2026 · Camp Bell" from a stored event snapshot (`start` is an ISO date or date and time)."""
    when = str(event.get("start") or "")
    try:
        day = date.fromisoformat(when[:10])
        when = f"{day:%a %b} {day.day}, {day.year}"
    except ValueError:
        pass
    place = event.get("place")
    return " · ".join(p for p in (event.get("title"), when, place) if p)


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in text.replace("\r", "").split("\n\n") if p.strip()]


def _html_text(text: str) -> list[str]:
    return [escape(p).replace("\n", "<br>") for p in _paragraphs(text)]


def _heading(text: str) -> str:
    return f'<strong style="font-size:17px;font-family:{FONT}">{escape(text)}</strong>'


def render(post: dict, sender: str, troop_name: str, troop_id: str, post_id: str, app_url: str) -> Email:
    """`post` has title, body, sections ([{heading, text}]) and events ([{title, start, place}])."""
    read_url = f"{app_url}/t/{troop_id}/announcements#{post_id}"
    account = f"{app_url}/account"
    who = f"From {sender}, {troop_name}"
    text_parts, html_parts = [who], [escape(who)]
    for chunk in _paragraphs(post.get("body", "")):
        text_parts.append(chunk)
    html_parts += _html_text(post.get("body", ""))
    for section in post.get("sections", []):
        if section.get("heading"):
            text_parts.append(section["heading"].upper())
            html_parts.append(_heading(section["heading"]))
        text_parts += _paragraphs(section.get("text", ""))
        html_parts += _html_text(section.get("text", ""))
    events = post.get("events", [])
    if events:
        text_parts.append("UPCOMING EVENTS\n" + "\n".join(f"- {event_line(e)}" for e in events))
        html_parts.append(_heading("Upcoming events"))
        html_parts.append("<br>".join(escape(event_line(e)) for e in events))
    text_footer = [
        f"You get this email because you are in {troop_name} on Forthright.",
        f"To turn announcement emails off, open your Account page: {account}",
    ]
    html_footer = [
        f"You get this email because you are in {escape(troop_name)} on Forthright. "
        f"To turn announcement emails off, open your {_link('Account page', account)}."
    ]
    text = "\n\n".join([post["title"], *text_parts, f"Read it in Forthright: {read_url}", *text_footer])
    html = _page([_heading(post["title"]), *html_parts], ("Read it in Forthright", read_url), html_footer)
    return Email(f"{troop_name}: {post['title']}", text, html)

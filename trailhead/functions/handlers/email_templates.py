"""The emails Forthright sends: subject, plain text and simple HTML. Pure functions, no network or Firestore.

Only a Scout's first name goes in an email. Never put birth dates, rank dates or message text in one.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

GREEN = "#4f6a2e"
FONT = "Arial, Helvetica, sans-serif"
PRIVACY_EMAIL = "privacy@msanford.com"  # keep equal to PRIVACY_EMAIL in app/src/lib/privacy.ts


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


def first_name(display_name: str | None) -> str:
    parts = (display_name or "").split()
    return parts[0] if parts else "A Scout"


def join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} and {names[-1]}"


def _link(label: str, url: str) -> str:
    return f'<a href="{escape(url, quote=True)}">{escape(label)}</a>'


def _button(label: str, url: str) -> str:
    return (
        f'<p><a href="{escape(url, quote=True)}" style="background:{GREEN};color:#ffffff;text-decoration:none;'
        f'padding:10px 18px;border-radius:6px;display:inline-block;font-weight:bold">{escape(label)}</a></p>'
    )


def _page(paragraphs: list[str], button: tuple[str, str], footer: list[str]) -> str:
    """`paragraphs` and `footer` are HTML already; escape any name before it goes in."""
    body = "".join(f"<p>{p}</p>" for p in paragraphs) + _button(*button)
    small = "".join(f'<p style="font-size:12px;color:#555555">{p}</p>' for p in footer)
    return (
        f'<div style="font-family:{FONT};font-size:15px;line-height:1.5;color:#222222;max-width:560px">'
        f"{body}{small}</div>"
    )


def _notification(subject: str, lines: list[str], button: tuple[str, str], app_url: str) -> Email:
    account, privacy = f"{app_url}/account", f"{app_url}/privacy"
    text_footer = [
        "You get this email because you are in a troop on Forthright.",
        f"To turn these emails off, open your Account page: {account}",
        f"Privacy policy: {privacy}",
    ]
    html_footer = [
        "You get this email because you are in a troop on Forthright. "
        f"To turn these emails off, open your {_link('Account page', account)}. "
        f"Read the {_link('privacy policy', privacy)}."
    ]
    text = "\n\n".join([*lines, f"{button[0]}: {button[1]}", *text_footer])
    html = _page([escape(line) for line in lines], button, html_footer)
    return Email(subject, text, html)


def card_requested(scout: str, badge: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"{scout} asked to start {badge}",
        [
            f"{scout} asked to start the {badge} merit badge.",
            "The Scoutmaster or advancement chair needs to approve the blue card.",
        ],
        ("Open blue cards", f"{app_url}/t/{troop_id}/blue-cards"),
        app_url,
    )


def _scout_link(scout_id: str, troop_id: str, app_url: str) -> tuple[str, str]:
    return ("Open Forthright", f"{app_url}/t/{troop_id}/scouts/{scout_id}")


def card_approved(scout: str, badge: str, scout_id: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"{scout}'s {badge} blue card was approved",
        [
            f"The Scoutmaster or advancement chair approved {scout}'s blue card for {badge}.",
            "A counselor will be assigned next.",
        ],
        _scout_link(scout_id, troop_id, app_url),
        app_url,
    )


def card_counselor_assigned(scout: str, badge: str, scout_id: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"{scout} has a counselor for {badge}",
        [f"A counselor was assigned for {scout}'s {badge} merit badge.", f"{scout} can now work with them."],
        _scout_link(scout_id, troop_id, app_url),
        app_url,
    )


def card_completed(scout: str, badge: str, scout_id: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"{scout} completed {badge}",
        [f"{scout}'s {badge} blue card is complete.", f"Congratulations to {scout}."],
        _scout_link(scout_id, troop_id, app_url),
        app_url,
    )


def counselor_assigned(scout: str, badge: str, troop_id: str, app_url: str) -> Email:
    return _notification(
        f"You've been assigned as {badge} counselor for {scout}",
        [f"The Scoutmaster or advancement chair assigned you as the {badge} merit badge counselor for {scout}."],
        ("Open counseling", f"{app_url}/t/{troop_id}/counseling"),
        app_url,
    )


def consent_confirmation(scouts: list[str], troop: str, when: str, version: str, app_url: str) -> Email:
    names, privacy = join_names(scouts), f"{app_url}/privacy"
    lines = [
        f"You agreed to the Forthright notice to parents and guardians for {names} on {when}.",
        f"Notice version: {version}. {troop} uses Forthright, run by MM Sanford, to track advancement. "
        "In short: we keep your Scout's name, birth month and year, rank and advancement, sign-offs, blue cards, "
        "plans, patrol, camping nights, service hours and hiking miles, gear they borrow, event sign-ups and "
        "attendance, health notes you add, health form dates (never medical details), Scout account entries, and "
        "troop messages. Leaders, you, your Scout if 13 or older, and their assigned counselors see their records. "
        "We use it only to run Forthright for the troop. We do not sell it or use it for ads.",
        "To withdraw your consent, open your Scout's page in Forthright and choose to withdraw consent. That asks the "
        f"troop to delete your Scout's records. You can also email {PRIVACY_EMAIL}.",
    ]
    text = "\n\n".join([*lines, f"Read the full notice and privacy policy: {privacy}"])
    html = _page(
        [escape(line) for line in lines],
        ("Read the privacy policy", privacy),
        ["You get this email because you agreed to the notice. We always send it, as a record of your choice."],
    )
    return Email(f"You agreed to Forthright's notice for {names}", text, html)


def opt_out_note(names: str) -> str:
    return (
        "You're getting this even though you turned off notification emails, because it's about your consent for "
        f"{names}'s information."
    )


def _consent_mail(
    subject: str, lines: list[str], button: tuple[str, str], app_url: str, names: str, opted_out: bool
) -> Email:
    """Emails about a parent's consent. They go out whatever the parent's notification choice, so the footer says so
    instead of offering an opt-out; a parent who turned notifications off is told why they still got this."""
    privacy = f"{app_url}/privacy"
    note = [opt_out_note(names)] if opted_out else []
    footer = [
        *note,
        "We send emails about your consent whatever your notification choice, so there is a record of what you were "
        "asked. If you didn't expect this, you can ignore it; nothing is agreed unless you agree.",
    ]
    text = "\n\n".join([*lines, *note, f"{button[0]}: {button[1]}", f"Privacy policy: {privacy}", footer[-1]])
    html = _page([escape(line) for line in [*lines, *note]], button, [escape(footer[-1])])
    return Email(subject, text, html)


def consent_review_reminder(
    scouts: list[str], troop: str, troop_id: str, app_url: str, opted_out: bool = False
) -> Email:
    """Asks a parent who agreed to an older notice to read the current one (daily job, or a leader asks)."""
    names = join_names(scouts)
    return _consent_mail(
        f"Forthright's notice for {names} changed",
        [
            f"{troop} uses Forthright, and the notice to parents and guardians for {names} has changed since you "
            "agreed to it.",
            "Please read what changed and tell us if you agree. You can keep using Forthright either way. Until you "
            "agree, the troop can't add the new kinds of information the notice now covers for "
            f"{names}. If you don't agree, you can withdraw your consent from your Scout's page.",
        ],
        ("Review the notice", f"{app_url}/t/{troop_id}"),
        app_url,
        names,
        opted_out,
    )


def consent_request(
    scout: str, parent: str, troop: str, link: str, app_url: str, reminder: bool = False, opted_out: bool = False
) -> Email:
    """Sent straight to a parent: the troop wants to keep their Scout's records and needs this parent to agree."""
    subject = f"{troop} needs your permission for {scout} on Forthright"
    if reminder:
        subject = f"Reminder: {subject}"
    return _consent_mail(
        subject,
        [
            f"Hello {parent},",
            f"{troop} uses Forthright, run by MM Sanford, to track advancement. {scout} is under 13, so only a "
            "parent or guardian can give permission. Until a parent agrees, the troop keeps nothing about "
            f"{scout} in Forthright except {scout}'s name and birth month and year.",
            "If you agree, the troop will keep their name, birth month and year, rank and advancement, sign-offs, "
            "blue cards, plans, patrol, activity, gear they borrow, event sign-ups and attendance, health notes you "
            "add, Scout account entries and troop messages. Open the link to sign in with this email address, read "
            "the full notice, and agree or decline.",
            f"If nobody answers within 30 days, the troop deletes {scout} and your contact details from Forthright.",
        ],
        ("Read the notice and answer", link),
        app_url,
        scout,
        opted_out,
    )

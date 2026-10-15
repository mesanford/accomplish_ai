"""Sends email through Resend. Sending never raises: a failed email must not fail the action that caused it.

`EMAIL_MODE=send` posts to Resend. Anything else (the default) only logs the template name and how many people it
would go to, never addresses or content. The Functions emulator always logs, and also writes each email to
`emailOutbox` so integration tests can see who would have been emailed. That collection is closed to every client.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Callable

from firebase_admin import auth

from handlers.email_recipients import MAX_RECIPIENTS
from handlers.email_templates import Email

log = logging.getLogger(__name__)
RESEND_URL = "https://api.resend.com/emails"
Post = Callable[[str, dict, dict], int]  # (url, headers, json body) -> HTTP status


def in_emulator() -> bool:
    return os.environ.get("FUNCTIONS_EMULATOR") == "true"


def email_mode(env=os.environ) -> str:
    if env.get("FUNCTIONS_EMULATOR") == "true":
        return "log"
    return "send" if env.get("EMAIL_MODE") == "send" else "log"


def app_url(env=os.environ) -> str:
    return (env.get("APP_URL") or "http://localhost:5173").rstrip("/")


def http_post(url: str, headers: dict, body: dict) -> int:
    """POST JSON and return the status code, or 0 if the request never got an answer."""
    request = urllib.request.Request(url, json.dumps(body).encode(), headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as err:
        return err.code
    except Exception:
        return 0


def address_of(uid: str) -> str | None:
    """The email address a login signed in with, or None if it can't be found."""
    try:
        return auth.get_user(uid).email
    except Exception:
        return None


def _record_in_outbox(template: str, to: str, email: Email) -> None:
    from fb import db

    db().collection("emailOutbox").add({"template": template, "to": to, "subject": email.subject, "text": email.text})


def send_all(
    template: str,
    addresses: list[str],
    email: Email,
    post: Post = http_post,
    env=os.environ,
    record: Callable[[str, str, Email], None] | None = None,
) -> int:
    """Send `email` to each address as its own message. Returns how many went out (or would have, in log mode)."""
    try:
        recipients = list(dict.fromkeys(a for a in addresses if a))[:MAX_RECIPIENTS]
        if not recipients:
            return 0
        if email_mode(env) != "send":
            log.info("email template=%s mode=log recipients=%d", template, len(recipients))
            if in_emulator():
                for to in recipients:
                    (record or _record_in_outbox)(template, to, email)
            return len(recipients)
        key = env.get("RESEND_API_KEY")
        if not key:
            log.error("email template=%s not sent: RESEND_API_KEY is not set", template)
            return 0
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "Forthright/1.0"}
        sent = 0
        for to in recipients:
            body = {
                "from": env.get("EMAIL_FROM") or "Forthright <onboarding@resend.dev>",
                "to": [to],
                "subject": email.subject,
                "text": email.text,
                "html": email.html,
            }
            status = post(RESEND_URL, headers, body)
            if 200 <= status < 300:
                sent += 1
            else:
                log.error("email template=%s failed status=%s", template, status)
        log.info("email template=%s mode=send sent=%d of=%d", template, sent, len(recipients))
        return sent
    except Exception:
        log.error("email template=%s failed before sending", template)
        return 0

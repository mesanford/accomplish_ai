"""A troop's own web address (for example troop101springfield.org). Pure: no Firestore or network calls here.

`validate_domain` cleans what a leader typed. `read_resource` turns what the Firebase Hosting API says about a
custom domain into a plain status, the DNS records the leader must add, and words a non-technical person can follow.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

PENDING_DAYS = 7
# What a troop domain goes through, in order. "failed" ends the wait.
STATUSES = ("waiting_dns", "verifying", "issuing_certificate", "live", "failed")
PENDING = ("waiting_dns", "verifying", "issuing_certificate")

LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
TLD_RE = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$")
# Addresses that belong to Forthright, to Firebase and Google, or that can never be a real public site.
BLOCKED_SUFFIXES = (
    "forthrightapp.com",
    "web.app",
    "firebaseapp.com",
    "firebaseio.com",
    "cloudfunctions.net",
    "appspot.com",
    "run.app",
    "googleapis.com",
    "googleusercontent.com",
    "localhost",
    "local",
    "internal",
    "invalid",
    "test",
    "onion",
)
SHAPE = "That doesn't look like a domain. Use letters, numbers, dots and dashes, like troop101.org."


class InvalidDomain(ValueError):
    """The address can't be used. The message says why, in plain words."""


def validate_domain(raw: object) -> str:
    """The domain in lowercase, or InvalidDomain. Takes a bare domain such as `troop101.org` or `www.troop101.org`."""
    if not isinstance(raw, str) or not raw.strip():
        raise InvalidDomain("Enter the domain you own, like troop101springfield.org.")
    text = raw.strip().lower()
    if "://" in text or "/" in text or "?" in text or "#" in text:
        raise InvalidDomain("Enter just the domain, like troop101springfield.org, without https:// or a page.")
    if "@" in text or " " in text or ":" in text or "*" in text:
        raise InvalidDomain(SHAPE)
    text = text.rstrip(".")
    try:
        host = text.encode("idna").decode("ascii")  # accents and other scripts become their xn-- form
    except UnicodeError:
        raise InvalidDomain(SHAPE) from None
    labels = host.split(".")
    if len(host) > 253 or len(labels) < 2 or not all(LABEL_RE.match(x) for x in labels):
        raise InvalidDomain(SHAPE)
    if not TLD_RE.match(labels[-1]):
        raise InvalidDomain("That doesn't look like a domain. It should end in .org, .com or similar.")
    if any(host == s or host.endswith("." + s) for s in BLOCKED_SUFFIXES):
        raise InvalidDomain("That address belongs to Forthright or Google, so you can't use it. Use a domain you own.")
    return host


def www_host(host: str) -> str | None:
    """The `www.` twin of a domain, or None when the domain already starts with www."""
    return None if host.startswith("www.") else f"www.{host}"


def deadline(created_at: datetime) -> datetime:
    return created_at + timedelta(days=PENDING_DAYS)


# ---- What the Hosting API says --------------------------------------------------------------------------------


def _state(resource: dict, key: str) -> str:
    return str(resource.get(key) or "")


def map_status(resource: dict | None) -> str:
    """One of PENDING, "live" or "failed" for a CustomDomain resource (None = Hosting doesn't know it yet)."""
    if not resource:
        return "waiting_dns"
    host_state, owner = _state(resource, "hostState"), _state(resource, "ownershipState")
    if "CONFLICT" in host_state or "CONFLICT" in owner or resource.get("deleteTime"):
        return "failed"
    host_ok, owner_ok = host_state == "HOST_ACTIVE", owner == "OWNERSHIP_ACTIVE"
    if host_ok and owner_ok:
        cert = str((resource.get("cert") or {}).get("state") or "")
        return "live" if cert in ("CERT_ACTIVE", "CERT_EXPIRING_SOON") else "issuing_certificate"
    if host_ok or owner_ok:
        return "verifying"
    return "waiting_dns"


def _short(name: str, host: str) -> str:
    """The name as registrars ask for it: "@" for the domain itself, else the part before it."""
    if name == host:
        return "@"
    return name[: -len(host) - 1] if name.endswith("." + host) else name


def _from_set(rs: dict, purpose: str, host: str) -> list[dict]:
    out = []
    for r in rs.get("records") or []:
        action = str(r.get("requiredAction") or "ADD").upper()
        if action in ("NONE", "KEEP") or not r.get("type"):
            continue
        name = (r.get("domainName") or rs.get("domainName") or host).lower().rstrip(".")
        kind = str(r["type"]).upper()
        out.append(
            {
                "type": kind,
                "name": name,
                "label": _short(name, host),
                "value": str(r.get("rdata") or ""),
                "action": "remove" if action == "REMOVE" else "add",
                "purpose": "ownership" if kind == "TXT" and purpose == "traffic" else purpose,
            }
        )
    return out


def dns_records(resource: dict | None, host: str) -> list[dict]:
    """What to remove and add at the registrar, without repeats."""
    resource = resource or {}
    sets = [(rs, "traffic") for rs in (resource.get("requiredDnsUpdates") or {}).get("desired") or []]
    verify = ((resource.get("cert") or {}).get("verification") or {}).get("dns") or {}
    sets += [(rs, "certificate") for rs in verify.get("desired") or []]
    seen, out = set(), []
    for rs, purpose in sets:
        for rec in _from_set(rs, purpose, host):
            key = (rec["type"], rec["name"], rec["value"], rec["action"])
            if key not in seen:
                seen.add(key)
                out.append(rec)
    return sorted(out, key=lambda r: (r["action"] != "remove", r["purpose"] != "ownership", r["type"], r["value"]))


def read_resource(resource: dict | None, host: str) -> dict:
    """{"status", "records"} for a CustomDomain resource."""
    status = map_status(resource)
    return {"status": status, "records": [] if status == "live" else dns_records(resource, host)}


# ---- Words for the leader --------------------------------------------------------------------------------------


def explain(status: str, host: str) -> tuple[str, str]:
    """(headline, plain explanation) for a status."""
    words = {
        "waiting_dns": (
            "Waiting for your DNS records",
            "We can't see the records below at your domain yet. Add them where you bought the domain, then press "
            "Check again. It can take a few minutes, sometimes a few hours, for the internet to notice.",
        ),
        "verifying": (
            "Checking your records",
            "We can see some of your records but not all. Compare each one below with what's set at your domain, "
            "fix anything that differs, then press Check again.",
        ),
        "issuing_certificate": (
            "Setting up the secure padlock",
            "Your records are right. Google is now creating the certificate that makes your site secure (https). "
            "This usually takes under an hour and can take up to a day. Nothing more to do.",
        ),
        "live": ("Your site is live", f"People can now visit https://{host}."),
        "failed": (
            "This domain didn't connect",
            "It could not be connected. Remove it and add it again once your DNS records are in place.",
        ),
    }
    return words[status]


def dns_steps(host: str, records: list[dict]) -> list[str]:
    """Numbered-list steps for the registrar, in plain words."""
    steps = [
        f"Sign in to the company where you bought {host}. This is your registrar, such as GoDaddy, Namecheap, "
        "Cloudflare or Squarespace.",
        "Open the DNS settings for the domain. It may be called DNS records, DNS zone or Manage DNS.",
    ]
    for r in records:
        where = "the domain itself (it may be shown as @ or left blank)" if r["label"] == "@" else f'"{r["label"]}"'
        if r["action"] == "remove":
            steps.append(f"Delete the {r['type']} record for {where} that has the value {r['value']}.")
        else:
            steps.append(f"Add a {r['type']} record for {where} with the value {r['value']}.")
    if not any(r["action"] == "add" for r in records):
        steps.append("There's nothing to add right now. Press Check again in a few minutes.")
    steps.append(
        "Save. It can take a few minutes, and sometimes a few hours, before we see the change. "
        "You can close this page and come back."
    )
    return steps

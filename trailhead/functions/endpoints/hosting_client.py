"""Talks to the Firebase Hosting API to attach a troop's own domain to the dedicated "troop sites" Hosting site.

`DOMAINS_MODE` picks what happens (see DEPLOY.md):
  off  (default) custom domains are not offered; nothing is called.
  log            nothing leaves the server. A built-in fake answers like the real API, for staging and tests.
  live           calls https://firebasehosting.googleapis.com/v1beta1 as the functions' service account.
The Functions emulator never goes live, whatever the setting.

The HTTP layer is a plain function `(method, url, json_body) -> (status, json)` so tests can replace it.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Protocol

log = logging.getLogger(__name__)
API = "https://firebasehosting.googleapis.com/v1beta1"
SCOPE = "https://www.googleapis.com/auth/cloud-platform"
Http = Callable[[str, str, dict | None], tuple[int, dict]]


class HostingError(Exception):
    """A Hosting API call failed. `conflict` means the domain is already attached somewhere else."""

    def __init__(self, message: str, status: int = 0, conflict: bool = False):
        super().__init__(message)
        self.status, self.conflict = status, conflict


class HostingClient(Protocol):
    def create(self, host: str, redirect_to: str | None = None) -> None: ...
    def get(self, host: str) -> dict | None: ...
    def delete(self, host: str) -> None: ...


def domains_mode(env=os.environ) -> str:
    if env.get("FUNCTIONS_EMULATOR") == "true":
        return "off" if env.get("DOMAINS_MODE") == "off" else "log"
    mode = env.get("DOMAINS_MODE", "off")
    return mode if mode in ("log", "live") else "off"


def _authed_http() -> Http:
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=[SCOPE])
    session = AuthorizedSession(creds)

    def send(method: str, url: str, body: dict | None) -> tuple[int, dict]:
        res = session.request(method, url, json=body, timeout=30)
        try:
            return res.status_code, res.json() if res.content else {}
        except ValueError:
            return res.status_code, {}

    return send


class LiveClient:
    """projects.sites.customDomains: create, get, delete (and undelete, for a domain removed in the last 30 days)."""

    def __init__(self, project: str, site: str, http: Http | None = None):
        self.base = f"{API}/projects/{project}/sites/{site}/customDomains"
        self._http = http

    @property
    def http(self) -> Http:
        if self._http is None:
            self._http = _authed_http()
        return self._http

    def _fail(self, what: str, status: int, body: dict) -> HostingError:
        message = (body.get("error") or {}).get("message", "")
        log.warning("hosting api %s failed status=%s message=%s", what, status, message[:200])
        return HostingError(f"{what} failed ({status})", status, conflict=status == 409)

    def create(self, host: str, redirect_to: str | None = None) -> None:
        body = {"redirectTarget": redirect_to} if redirect_to else {}
        status, out = self.http("POST", f"{self.base}?customDomainId={host}", body)
        if status == 409:  # already ours (a retry), or removed within 30 days and still held by Hosting
            current = self.get(host)
            if current is None:
                raise self._fail("create", status, out)
            if current.get("deleteTime"):
                code, out = self.http("POST", f"{self.base}/{host}:undelete", {})
                if code >= 300:
                    raise self._fail("undelete", code, out)
            return
        if status >= 300:
            raise self._fail("create", status, out)

    def get(self, host: str) -> dict | None:
        status, out = self.http("GET", f"{self.base}/{host}", None)
        if status == 404:
            return None
        if status >= 300:
            raise self._fail("get", status, out)
        return out

    def delete(self, host: str) -> None:
        status, out = self.http("DELETE", f"{self.base}/{host}", None)
        if status >= 300 and status != 404:
            raise self._fail("delete", status, out)


class FakeClient:
    """DOMAINS_MODE=log. Remembers nothing; how far along a domain is comes from its name, so tests can choose:
    a first label ending in `-live` is live, `-cert` is waiting on its certificate, `-dns` has only some records
    found, `-conflict` is attached elsewhere. Any other domain is waiting for DNS."""

    def create(self, host: str, redirect_to: str | None = None) -> None:
        log.info("domains mode=log create host=%s redirect=%s", host, redirect_to)

    def delete(self, host: str) -> None:
        log.info("domains mode=log delete host=%s", host)

    def get(self, host: str) -> dict | None:
        label = host.split(".")[0]
        suffix = label.rsplit("-", 1)[-1]
        owner = "OWNERSHIP_ACTIVE" if suffix in ("live", "cert", "dns") else "OWNERSHIP_PENDING"
        hosted = "HOST_ACTIVE" if suffix in ("live", "cert") else "HOST_UNHOSTED"
        cert = {"state": "CERT_ACTIVE"} if suffix == "live" else {"state": "CERT_PREPARING"}
        if suffix == "conflict":
            owner = "OWNERSHIP_CONFLICT"
        return {
            "name": f"projects/fake/sites/troops/customDomains/{host}",
            "hostState": hosted,
            "ownershipState": owner,
            "cert": cert,
            "requiredDnsUpdates": {
                "desired": [
                    {
                        "domainName": host,
                        "records": [
                            {"type": "TXT", "rdata": "hosting-site=forthright-troops", "requiredAction": "ADD"},
                            {"type": "A", "rdata": "199.36.158.100", "requiredAction": "ADD"},
                        ],
                    }
                ]
            },
        }


_override: HostingClient | None = None


def set_client(client: HostingClient | None) -> None:
    """Tests use this to replace the client."""
    global _override
    _override = client


def hosting_client(env=os.environ) -> HostingClient | None:
    """The client for the current mode, or None when custom domains are off."""
    if _override is not None:
        return _override
    mode = domains_mode(env)
    if mode == "off":
        return None
    if mode == "log":
        return FakeClient()
    project = env.get("GCLOUD_PROJECT") or env.get("GOOGLE_CLOUD_PROJECT") or ""
    site = env.get("TRAILHEAD_TROOPS_SITE") or ""
    if not project or not site:
        log.error("DOMAINS_MODE=live needs GCLOUD_PROJECT and TRAILHEAD_TROOPS_SITE")
        return None
    return LiveClient(project, site)

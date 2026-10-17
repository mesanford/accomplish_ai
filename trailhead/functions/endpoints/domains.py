"""A troop's own web address: add it, check on it, remove it. Leaders only.

Two kinds of document hold the state:
  domains/{host}                  server-only. What `site_shell` reads to map a host to a troop: troopId, slug, status.
  troops/{t}/site/domain          leaders may read it. What the Website page shows: status, DNS records, plain steps.
The Hosting API (see hosting_client.py) is the source of truth for how far along a domain is.
Unpublishing the site, removing the domain and deleting the troop all detach the domain from Hosting.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.hosting_client import HostingClient, HostingError, hosting_client
from fb import db, fail, require_leader, troop
from handlers import domains as rules

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
TAKEN = "That domain is already used by another troop."
RECREATE_AFTER = timedelta(minutes=15)


def mirror_ref(troop_id: str):
    return troop(troop_id).collection("site").document("domain")


def _now() -> datetime:
    return datetime.now(UTC)


def _client() -> HostingClient:
    client = hosting_client()
    if client is None:
        raise fail(Code.FAILED_PRECONDITION, "Using your own domain isn't turned on yet. Ask the Forthright team.")
    return client


def _hosts(mirror: dict) -> list[str]:
    return [mirror["host"], *([mirror["wwwHost"]] if mirror.get("wwwHost") else [])]


def _redirect(mirror: dict, host: str) -> str | None:
    return mirror["host"] if host == mirror.get("wwwHost") else None


def _public(mirror: dict) -> dict:
    """What the callables return: the mirror without server timestamps."""
    return {k: v for k, v in mirror.items() if k not in ("createdAt", "updatedAt", "checkedAt", "expiresAt")}


# ---- Adding ----------------------------------------------------------------------------------------------------


@https_fn.on_call(timeout_sec=60)
def add_domain(req: https_fn.CallableRequest) -> dict:
    """Register the troop's own domain (and optionally its www twin) with Hosting and return the DNS steps."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    try:
        host = rules.validate_domain(data.get("domain"))
    except rules.InvalidDomain as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from None
    client = _client()
    t = troop(troop_id)
    site = (t.get().to_dict() or {}).get("site") or {}
    if not site.get("published") or not site.get("slug"):
        raise fail(Code.FAILED_PRECONDITION, "Publish your website first. Your domain shows the published site.")
    www = rules.www_host(host) if data.get("www") else None
    hosts = [host, *([www] if www else [])]
    _claim(troop_id, site["slug"], host, www)
    created: list[str] = []
    try:
        for h in hosts:
            client.create(h, host if h == www else None)
            created.append(h)
    except HostingError as err:
        _undo(troop_id, hosts, created, client)
        if err.conflict:
            raise fail(
                Code.ALREADY_EXISTS,
                "This domain is already connected to another website service. Disconnect it there first, or use "
                "a different domain.",
            ) from None
        raise fail(Code.UNAVAILABLE, "We couldn't reach the hosting service. Try again in a few minutes.") from None
    log.info("domain added troop=%s host=%s www=%s", troop_id, host, bool(www))
    return _public(refresh_troop(troop_id, client) or {})


def _claim(troop_id: str, slug: str, host: str, www: str | None) -> None:
    """Reserve the hosts for this troop, or fail. One domain per troop; a host belongs to one troop."""
    refs = {h: db().collection("domains").document(h) for h in [host, *([www] if www else [])]}
    mirror = mirror_ref(troop_id)

    @firestore.transactional
    def run(tx) -> None:
        if mirror.get(transaction=tx).exists:
            raise fail(Code.ALREADY_EXISTS, "Your troop already has a domain. Remove it before adding another.")
        if any(ref.get(transaction=tx).exists for ref in refs.values()):
            raise fail(Code.ALREADY_EXISTS, TAKEN)
        now = firestore.SERVER_TIMESTAMP
        for h, ref in refs.items():
            tx.set(
                ref,
                {
                    "troopId": troop_id,
                    "slug": slug,
                    "host": h,
                    "kind": "www" if h == www else "primary",
                    "redirectTo": host if h == www else None,
                    "status": "waiting_dns",
                    "records": [],
                    "createdAt": now,
                    "updatedAt": now,
                },
            )
        headline, detail = rules.explain("waiting_dns", host)
        tx.set(
            mirror,
            {
                "host": host,
                "wwwHost": www,
                "status": "waiting_dns",
                "wwwStatus": "waiting_dns" if www else None,
                "headline": headline,
                "detail": detail,
                "records": [],
                "steps": rules.dns_steps(host, []),
                "createdAt": now,
                "updatedAt": now,
            },
        )

    run(db().transaction())


def _undo(troop_id: str, hosts: list[str], created: list[str], client: HostingClient) -> None:
    for h in created:
        try:
            client.delete(h)
        except HostingError:
            log.exception("domain rollback could not detach host=%s", h)
    batch = db().batch()
    for h in hosts:
        batch.delete(db().collection("domains").document(h))
    batch.delete(mirror_ref(troop_id))
    batch.commit()


# ---- Checking --------------------------------------------------------------------------------------------------


def _status_of(client: HostingClient, h: str, mirror: dict, created: datetime, now: datetime) -> dict:
    resource = client.get(h)
    if resource is None and now - created > RECREATE_AFTER:
        client.create(h, _redirect(mirror, h))  # a create that never reached Hosting: try once more
        resource = client.get(h)
    return rules.read_resource(resource, h)


def refresh_troop(troop_id: str, client: HostingClient | None = None) -> dict | None:
    """Ask Hosting where the troop's domain stands and store it. Returns the stored summary, or None if no domain.
    A domain still not live 7 days after it was added is detached and marked failed."""
    client = client or _client()
    ref = mirror_ref(troop_id)
    snap = ref.get()
    mirror = snap.to_dict() if snap.exists else None
    if not mirror or mirror.get("status") == "failed":
        return mirror
    now = _now()
    created = mirror.get("createdAt") or now
    hosts = _hosts(mirror)
    found = {h: _status_of(client, h, mirror, created, now) for h in hosts}
    main, www = found[hosts[0]], (found[hosts[1]] if len(hosts) > 1 else None)
    status, reason = main["status"], None
    if status != "live" and now > rules.deadline(created):
        status, reason = "failed", "We stopped waiting after 7 days, and your domain was disconnected."
        for h in hosts:
            _detach(client, h)
    records = [] if status == "failed" else [*main["records"], *(www["records"] if www else [])]
    headline, detail = rules.explain(status, mirror["host"])
    if reason:
        detail = f"{reason} Add it again once the DNS records are in place at your registrar."
    elif status == "live" and www and www["status"] != "live":
        detail += f" www.{mirror['host']} will start working once its records below are added."
    update = {
        "status": status,
        "wwwStatus": www["status"] if www else None,
        "headline": headline,
        "detail": detail,
        "records": records,
        "steps": rules.dns_steps(mirror["host"], records),
        "checkedAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    batch = db().batch()
    batch.update(ref, update)
    for h in hosts:
        batch.update(
            db().collection("domains").document(h),
            {
                "status": status if h == hosts[0] else found[h]["status"],
                "records": found[h]["records"],
                "checkedAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
    batch.commit()
    log.info("domain checked troop=%s host=%s status=%s", troop_id, mirror["host"], status)
    return {**mirror, **update}


@https_fn.on_call(timeout_sec=60)
def check_domain(req: https_fn.CallableRequest) -> dict:
    """The "Check again" button: ask Hosting now."""
    troop_id = (req.data or {}).get("troopId")
    require_leader(req, troop_id)
    try:
        out = refresh_troop(troop_id)
    except HostingError:
        raise fail(Code.UNAVAILABLE, "We couldn't reach the hosting service. Try again in a few minutes.") from None
    return _public(out) if out else {}


# ---- Removing --------------------------------------------------------------------------------------------------


def _detach(client: HostingClient, host: str) -> bool:
    try:
        client.delete(host)
        return True
    except HostingError:
        log.exception("domain could not be detached host=%s", host)
        return False


def release_troop_domains(troop_id: str) -> int:
    """Detach every domain the troop has from Hosting and delete its records. A host Hosting won't release now is
    kept with `pendingRemoval` (and no longer served) so the hourly job retries. Returns how many hosts were found."""
    docs = list(db().collection("domains").where("troopId", "==", troop_id).stream())
    mirror = mirror_ref(troop_id)
    if not docs:
        mirror.delete()
        return 0
    client = hosting_client()
    for d in docs:
        if client is not None and not _detach(client, d.id):
            d.reference.update({"pendingRemoval": True, "status": "failed", "updatedAt": firestore.SERVER_TIMESTAMP})
        elif client is None:
            log.warning("domain %s left attached: custom domains are off", d.id)
            d.reference.update({"pendingRemoval": True, "status": "failed", "updatedAt": firestore.SERVER_TIMESTAMP})
        else:
            d.reference.delete()
    mirror.delete()
    log.info("domains released troop=%s hosts=%d", troop_id, len(docs))
    return len(docs)


def retry_removals(limit: int = 50) -> int:
    """Finish detaching hosts that couldn't be released earlier."""
    client = hosting_client()
    if client is None:
        return 0
    done = 0
    for d in db().collection("domains").where("pendingRemoval", "==", True).limit(limit).stream():
        if _detach(client, d.id):
            d.reference.delete()
            done += 1
    return done


@https_fn.on_call(timeout_sec=60)
def remove_domain(req: https_fn.CallableRequest) -> dict:
    """Disconnect the troop's domain. The troop site stays at its forthrightapp.com address."""
    troop_id = (req.data or {}).get("troopId")
    require_leader(req, troop_id)
    return {"removed": release_troop_domains(troop_id) > 0}


def retarget_domains(troop_id: str, slug: str) -> None:
    """After a publish under a new web address, point the troop's domains at it."""
    for d in db().collection("domains").where("troopId", "==", troop_id).stream():
        if d.to_dict().get("slug") != slug:
            d.reference.update({"slug": slug, "updatedAt": firestore.SERVER_TIMESTAMP})

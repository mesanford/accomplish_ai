from datetime import UTC, datetime

import pytest

from handlers import domains as d

TXT = {"type": "TXT", "rdata": "hosting-site=forthright-troops", "requiredAction": "ADD"}
A = {"type": "A", "rdata": "199.36.158.100", "requiredAction": "ADD"}


def resource(host_state="HOST_UNHOSTED", owner="OWNERSHIP_PENDING", cert=None, records=None, acme=None):
    out = {
        "hostState": host_state,
        "ownershipState": owner,
        "requiredDnsUpdates": {"desired": [{"domainName": "troop101.org", "records": records or [TXT, A]}]},
    }
    if cert:
        out["cert"] = {"state": cert}
    if acme:
        out.setdefault("cert", {})["verification"] = {"dns": {"desired": [acme]}}
    return out


@pytest.mark.parametrize(
    ("typed", "clean"),
    [
        ("troop101springfield.org", "troop101springfield.org"),
        ("  Troop101.ORG ", "troop101.org"),
        ("troop101.org.", "troop101.org"),
        ("www.troop101.org", "www.troop101.org"),
        ("troop-101.example.co.uk", "troop-101.example.co.uk"),
        ("bücher-troop.de", "xn--bcher-troop-thb.de"),
    ],
)
def test_good_domains_are_cleaned(typed, clean):
    assert d.validate_domain(typed) == clean


@pytest.mark.parametrize(
    "typed",
    [
        "",
        "   ",
        None,
        42,
        "https://troop101.org",
        "troop101.org/about",
        "troop101.org?x=1",
        "troop101.org:8080",
        "me@troop101.org",
        "troop 101.org",
        "*.troop101.org",
        "troop101",
        "-troop.org",
        "troop-.org",
        "a..b.org",
        "troop101.123",
        "192.168.0.1",
        "x" * 64 + ".org",
        "forthrightapp.com",
        "www.forthrightapp.com",
        "troop.forthrightapp.com",
        "scout-app-prod-d6a66.web.app",
        "foo.firebaseapp.com",
        "us-central1-x.cloudfunctions.net",
        "localhost",
        "printer.local",
    ],
)
def test_bad_domains_are_refused_with_a_reason(typed):
    with pytest.raises(d.InvalidDomain) as err:
        d.validate_domain(typed)
    assert str(err.value)


def test_a_lookalike_of_forthright_is_allowed():
    assert d.validate_domain("notforthrightapp.com") == "notforthrightapp.com"


def test_www_twin():
    assert d.www_host("troop101.org") == "www.troop101.org"
    assert d.www_host("www.troop101.org") is None


@pytest.mark.parametrize(
    ("res", "status"),
    [
        (None, "waiting_dns"),
        ({}, "waiting_dns"),
        (resource(), "waiting_dns"),
        (resource("HOST_UNREACHABLE", "OWNERSHIP_MISSING"), "waiting_dns"),
        (resource("HOST_UNHOSTED", "OWNERSHIP_ACTIVE"), "verifying"),
        (resource("HOST_ACTIVE", "OWNERSHIP_PENDING"), "verifying"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE"), "issuing_certificate"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_PREPARING"), "issuing_certificate"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_VALIDATING"), "issuing_certificate"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_PROPAGATING"), "issuing_certificate"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_ACTIVE"), "live"),
        (resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_EXPIRING_SOON"), "live"),
        (resource("HOST_CONFLICT", "OWNERSHIP_ACTIVE"), "failed"),
        (resource("HOST_ACTIVE", "OWNERSHIP_CONFLICT"), "failed"),
        ({**resource(), "deleteTime": "2026-10-01T00:00:00Z"}, "failed"),
    ],
)
def test_status_mapping(res, status):
    assert d.map_status(res) == status


def test_records_are_what_the_registrar_needs():
    out = d.read_resource(resource(), "troop101.org")
    assert out["status"] == "waiting_dns"
    assert [(r["type"], r["label"], r["action"], r["purpose"]) for r in out["records"]] == [
        ("TXT", "@", "add", "ownership"),
        ("A", "@", "add", "traffic"),
    ]


def test_records_for_a_www_name_and_the_certificate_challenge():
    acme = {
        "domainName": "troop101.org",
        "records": [{"type": "CNAME", "domainName": "_acme-challenge.troop101.org", "rdata": "tok.authorize.example."}],
    }
    out = d.read_resource(resource(acme=acme), "troop101.org")
    labels = {(r["type"], r["label"], r["purpose"]) for r in out["records"]}
    assert ("CNAME", "_acme-challenge", "certificate") in labels
    www = d.read_resource(resource(records=[A]), "troop101.org")["records"][0]
    assert www["name"] == "troop101.org"


def test_records_already_in_place_or_repeated_are_not_listed_twice():
    done = {**A, "requiredAction": "NONE"}
    stale = {"type": "A", "rdata": "1.2.3.4", "requiredAction": "REMOVE"}
    out = d.dns_records(resource(records=[TXT, A, A, done, stale]), "troop101.org")
    assert [(r["action"], r["type"], r["value"]) for r in out] == [
        ("remove", "A", "1.2.3.4"),
        ("add", "TXT", "hosting-site=forthright-troops"),
        ("add", "A", "199.36.158.100"),
    ]


def test_a_live_domain_lists_no_records():
    assert d.read_resource(resource("HOST_ACTIVE", "OWNERSHIP_ACTIVE", "CERT_ACTIVE"), "troop101.org")["records"] == []


def test_every_status_has_plain_words():
    for status in d.STATUSES:
        headline, detail = d.explain(status, "troop101.org")
        assert headline and detail
    assert "https://troop101.org" in d.explain("live", "troop101.org")[1]


def test_dns_steps_read_like_instructions():
    records = d.read_resource(
        resource(records=[TXT, A, {"type": "A", "rdata": "9.9.9.9", "requiredAction": "REMOVE"}]), "troop101.org"
    )["records"]
    steps = d.dns_steps("troop101.org", records)
    assert steps[0].startswith("Sign in to the company where you bought troop101.org")
    assert (
        "Delete the A record for the domain itself (it may be shown as @ or left blank) that has the value 9.9.9.9."
        in steps
    )
    assert (
        "Add a TXT record for the domain itself (it may be shown as @ or left blank) "
        "with the value hosting-site=forthright-troops." in steps
    )
    assert steps[-1].startswith("Save.")
    assert (
        d.dns_steps("troop101.org", [])[-2] == "There's nothing to add right now. Press Check again in a few minutes."
    )


def test_subdomain_records_name_the_part_before_the_domain():
    rec = {"type": "CNAME", "domainName": "www.troop101.org", "rdata": "troop101.org.", "requiredAction": "ADD"}
    out = d.dns_records({"requiredDnsUpdates": {"desired": [{"records": [rec]}]}}, "troop101.org")
    assert out[0]["label"] == "www"
    assert 'Add a CNAME record for "www"' in d.dns_steps("troop101.org", out)[2]


def test_the_deadline_is_seven_days():
    start = datetime(2026, 10, 1, tzinfo=UTC)
    assert d.deadline(start) == datetime(2026, 10, 8, tzinfo=UTC)

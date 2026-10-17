"""Card payment records: only server code writes them; a family reads its own Scout's, the money viewers read all.

The Stripe lookup and the emulator's test switch are never readable or writable by any client, and nobody changes
the troop's Stripe connection (`payments` on the troop document) from the client.
"""

import pytest
import requests

from .conftest import FUTURE, T
from .emulator import DOCS, Client

OK, DENIED = 200, 403

owner = Client("owner")
treasurer, leader, assistant, chair = Client("treasurer"), Client("leader"), Client("assistant"), Client("chair")
counselor, parent, scout1 = Client("counselor"), Client("parent"), Client("scout1")
EVERYONE = [treasurer, leader, assistant, chair, counselor, parent, scout1]
PAYMENT = {
    "scoutId": "s1",
    "status": "paid",
    "chargeIds": ["c1"],
    "amountCents": 3500,
    "feeCents": 0,
    "totalCents": 3500,
    "stripeAccountId": "acct_1",
    "mode": "test",
    "createdBy": "parent",
    "date": "2026-10-01",
}


@pytest.fixture(autouse=True)
def payments(troop):
    owner.set(
        f"{T}/access/treasurer", {"memberId": "m-treas", "roles": ["treasurer"], "scoutIds": [], "yptExpiresAt": FUTURE}
    )
    owner.set(f"{T}/payments/p1", PAYMENT)
    owner.set(f"{T}/payments/p2", {**PAYMENT, "scoutId": "s2"})
    owner.set("stripeLookup/pi_1", {"troopId": "t1", "paymentId": "p1"})
    owner.set("_test/payments", {"mode": "test", "apiBase": "http://127.0.0.1:1"})
    yield


def payments_query(client: Client, scout_id: str) -> int:
    """List payments for one Scout, as the Scout's statement does."""
    where = {"fieldFilter": {"field": {"fieldPath": "scoutId"}, "op": "EQUAL", "value": {"stringValue": scout_id}}}
    body = {"structuredQuery": {"from": [{"collectionId": "payments"}], "where": where}}
    return requests.post(f"{DOCS}/{T}:runQuery", json=body, headers=client.headers, timeout=10).status_code


def test_no_client_writes_payment_records():
    for client in EVERYONE:
        assert client.set(f"{T}/payments/p1", {**PAYMENT, "status": "refunded"}) == DENIED
        assert client.create(f"{T}/payments/new", PAYMENT) == DENIED
        assert client.delete(f"{T}/payments/p1") == DENIED


def test_a_family_reads_only_its_own_scouts_payments():
    for client in (parent, scout1):
        assert client.get(f"{T}/payments/p1") == OK
        assert payments_query(client, "s1") == OK
        assert client.get(f"{T}/payments/p2") == DENIED
        assert payments_query(client, "s2") == DENIED


def test_the_treasurer_scoutmaster_and_advancement_chair_read_every_payment():
    for client in (treasurer, leader, chair):
        assert client.get(f"{T}/payments/p1") == OK and client.get(f"{T}/payments/p2") == OK


def test_other_leaders_and_counselors_read_no_payments():
    for client in (assistant, counselor):
        assert client.get(f"{T}/payments/p1") == DENIED


def test_the_lookup_and_the_test_switch_are_closed_to_everyone():
    for client in [*EVERYONE, Client(None)]:
        assert client.get("stripeLookup/pi_1") == DENIED
        assert client.get("_test/payments") == DENIED
        assert client.set("_test/payments", {"mode": "live"}) == DENIED
        assert client.set("stripeLookup/pi_2", {"troopId": "t1"}) == DENIED


def test_nobody_connects_a_stripe_account_from_the_client():
    for client in (treasurer, leader):
        assert client.set(T, {"unitNumber": "123", "payments": {"stripeAccountId": "acct_evil"}}) == DENIED

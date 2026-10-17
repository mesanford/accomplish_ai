"""Scout accounts: no client ever writes money documents, and only the right people read them.

The treasurer, Scoutmaster and advancement chair read every account; a parent and a Scout 13 or older read only
their own Scout's; counselors and other leaders read none.
"""

import pytest
import requests

from .conftest import FUTURE, T
from .emulator import DOCS, Client

OK, DENIED = 200, 403

owner = Client("owner")
treasurer, leader, assistant, chair = Client("treasurer"), Client("leader"), Client("assistant"), Client("chair")
counselor, parent, scout1 = Client("counselor"), Client("parent"), Client("scout1")
ENTRY = {"scoutId": "s1", "type": "sale", "amountCents": 3000, "description": "Popcorn", "date": "2026-10-01"}


@pytest.fixture(autouse=True)
def money(troop):
    owner.set(
        f"{T}/access/treasurer", {"memberId": "m-treas", "roles": ["treasurer"], "scoutIds": [], "yptExpiresAt": FUTURE}
    )
    owner.set(f"{T}/ledger/e1", ENTRY)
    owner.set(f"{T}/ledger/e2", {**ENTRY, "scoutId": "s2"})
    owner.set(f"{T}/accounts/s1", {"scoutId": "s1", "balanceCents": 3000, "openChargesCents": 0})
    owner.set(f"{T}/accounts/s2", {"scoutId": "s2", "balanceCents": 3000, "openChargesCents": 0})
    owner.set(f"{T}/accounts/troop-fund", {"scoutId": "troop-fund", "balanceCents": 0, "openChargesCents": 0})
    owner.set(f"{T}/campaigns/c1", {"name": "Fall popcorn", "status": "open", "rule": {"kind": "percent", "value": 0}})
    yield


def ledger_query(client: Client, scout_id: str) -> int:
    """List the ledger filtered to one Scout, as the app does on a Scout's page."""
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "ledger"}],
            "where": {
                "fieldFilter": {"field": {"fieldPath": "scoutId"}, "op": "EQUAL", "value": {"stringValue": scout_id}}
            },
        }
    }
    return requests.post(f"{DOCS}/{T}:runQuery", json=body, headers=client.headers, timeout=10).status_code


EVERYONE = [treasurer, leader, assistant, chair, counselor, parent, scout1]
MONEY_PATHS = ["ledger/e1", "accounts/s1", "campaigns/c1", "ledger/new", "accounts/new", "campaigns/new"]


@pytest.mark.parametrize("path", MONEY_PATHS)
def test_no_client_creates_changes_or_deletes_money_documents(path):
    for client in EVERYONE:
        assert client.set(f"{T}/{path}", {**ENTRY, "amountCents": 999999}) == DENIED
        assert client.create(f"{T}/{path}-x", ENTRY) == DENIED
        assert client.delete(f"{T}/{path}") == DENIED


def test_nobody_changes_the_troop_account_settings_from_the_client():
    for client in (treasurer, leader, chair):
        assert client.set(T, {"unitNumber": "123", "accounts": {"allowNegative": True}}) == DENIED


def test_treasurer_scoutmaster_and_advancement_chair_read_every_account():
    for client in (treasurer, leader, chair):
        for path in ("ledger/e1", "ledger/e2", "accounts/s1", "accounts/s2", "accounts/troop-fund", "campaigns/c1"):
            assert client.get(f"{T}/{path}") == OK, path


def test_a_parent_and_a_scout_read_only_their_own_scouts_account():
    for client in (parent, scout1):
        assert client.get(f"{T}/ledger/e1") == OK
        assert client.get(f"{T}/accounts/s1") == OK
        assert ledger_query(client, "s1") == OK
        assert client.get(f"{T}/ledger/e2") == DENIED
        assert client.get(f"{T}/accounts/s2") == DENIED
        assert client.get(f"{T}/accounts/troop-fund") == DENIED
        assert client.get(f"{T}/campaigns/c1") == DENIED
        assert ledger_query(client, "s2") == DENIED


def test_counselors_and_other_leaders_see_no_financial_information():
    for client in (counselor, assistant):
        for path in ("ledger/e1", "accounts/s1", "accounts/troop-fund", "campaigns/c1"):
            assert client.get(f"{T}/{path}") == DENIED, path
        assert ledger_query(client, "s1") == DENIED


def test_a_parent_waiting_to_agree_to_the_notice_sees_nothing_yet():
    owner.set(
        f"{T}/access/parent",
        {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s1"]},
    )
    assert parent.get(f"{T}/accounts/s1") == DENIED
    assert parent.get(f"{T}/ledger/e1") == DENIED


def test_a_removed_scouts_anonymized_entries_are_for_the_treasurer_only():
    owner.set(f"{T}/ledger/e3", {**ENTRY, "scoutId": "former-12345678", "scoutRef": "12345678", "anonymized": True})
    assert treasurer.get(f"{T}/ledger/e3") == OK
    assert parent.get(f"{T}/ledger/e3") == DENIED

"""request_pilot on the Functions emulator, called the way a signed-out visitor would (no login)."""

import os
from datetime import UTC, datetime

import pytest
import requests

from tests.integration.test_functions import FUNCTIONS, PROJECT, owner
from tests.integration.test_membership_flow import ok
from tests.rules.emulator import list_docs, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
FORM = {
    "name": "Pat Leader",
    "email": "pat@example.com",
    "unit": "303",
    "council": "Pine Council",
    "role": "Scoutmaster",
    "note": "We have 20 Scouts.",
}


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def request_pilot(form=None):
    url = f"{FUNCTIONS}/{PROJECT}/us-central1/request_pilot"
    return requests.post(url, json={"data": {"form": FORM if form is None else form}}, timeout=30)


def test_a_valid_request_is_stored_and_the_operator_is_told():
    assert ok(request_pilot()) == {"ok": True}
    (doc,) = list_docs("pilotRequests")
    assert (doc["name"], doc["unit"], doc["role"], doc["status"]) == ("Pat Leader", "303", "Scoutmaster", "new")
    assert doc["note"] == "We have 20 Scouts."
    (mail,) = [m for m in list_docs("emailOutbox") if m["template"] == "pilot_request"]
    assert mail["to"] == "privacy@msanford.com"
    assert "We have 20 Scouts." not in mail["text"]


def test_invalid_requests_are_refused():
    for bad in ({**FORM, "email": "nope"}, {**FORM, "name": " "}, {**FORM, "unit": ""}, {**FORM, "role": "King"}):
        assert request_pilot(bad).status_code == 400
    assert request_pilot("not a form").status_code == 400
    assert list_docs("pilotRequests") == []


def test_honeypot_looks_like_success_but_saves_nothing():
    assert ok(request_pilot({**FORM, "website": "http://spam.example"})) == {"ok": True}
    assert list_docs("pilotRequests") == []
    assert [m for m in list_docs("emailOutbox") if m["template"] == "pilot_request"] == []


def test_daily_cap():
    today = datetime.now(UTC).date().isoformat()
    owner.set(f"pilotUsage/pilot_{today}", {"count": 30, "day": today})
    assert request_pilot().status_code == 429
    assert list_docs("pilotRequests") == []

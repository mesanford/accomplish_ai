"""draft_path on the Functions emulator. The emulator always uses the fake planner, never Claude."""

import os
from datetime import UTC, datetime, timedelta

import pytest
import requests

from handlers.assistant import DAILY_DRAFT_LIMIT
from tests.rules.emulator import PROJECT, Client, list_docs, reset, token

FUNCTIONS = os.environ.get("FUNCTIONS_EMULATOR_URL", "http://127.0.0.1:5001")
T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
owner = Client("owner")


def call(uid: str, data: dict) -> requests.Response:
    url = f"{FUNCTIONS}/{PROJECT}/us-central1/draft_path"
    return requests.post(url, json={"data": data}, headers={"Authorization": f"Bearer {token(uid)}"}, timeout=60)


def ask(uid: str = "parent", **overrides) -> requests.Response:
    body = {"troopId": "t1", "scoutId": "s1", "goalAwardId": "star", "request": "Get me to Star by spring"}
    return call(uid, {**body, **overrides})


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"unitNumber": "123"})
    access = {
        "leader": {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "parent": {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]},
        "other": {"memberId": "m-other", "roles": ["parent"], "scoutIds": ["s2"]},
    }
    for uid, doc in access.items():
        owner.set(f"{T}/access/{uid}", doc)
    record = {"birthYear": 2012, "birthMonth": 5, "currentRankId": "first-class"}
    owner.set(f"{T}/scoutRecords/s1", {**record, "rankDates": {"first-class": "2026-09-01"}})


def test_parent_gets_a_checked_draft():
    r = ask()
    assert r.status_code == 200, r.text
    out = r.json()["result"]
    assert len(out["items"]) >= 6
    assert {"awardId", "plannedStart", "plannedEnd"} <= set(out["items"][0])
    assert out["feasibility"]["status"] in {"ok", "at_risk", "infeasible"}
    assert out["repaired"] in (True, False)
    assert out["explanation"]
    # Nothing is saved: a draft is only a suggestion.
    assert list_docs(f"{T}/paths") == []


def test_cannot_draft_for_another_scout_or_with_bad_input():
    assert ask("other").status_code == 403
    assert ask(request="").status_code == 400
    assert ask(request="x" * 501).status_code == 400
    assert ask(goalAwardId="scout").status_code == 400
    assert ask(targetDate="someday").status_code == 400


def test_daily_limit_is_enforced_per_user():
    for _ in range(DAILY_DRAFT_LIMIT):
        assert ask("leader").status_code == 200
    assert ask("leader").status_code == 429
    assert ask("parent").status_code == 200
    usage = list_docs(f"{T}/usage")
    assert sorted(u["count"] for u in usage) == [1, DAILY_DRAFT_LIMIT]

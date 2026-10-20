"""End-to-end: the weekly family digest. `run_digest` runs as the deployed job would; the scheduled trigger itself
can't fire on the emulators."""

import os
from datetime import UTC, date, datetime, timedelta

import pytest
import requests

from tests.integration.test_functions import owner
from tests.rules.emulator import PROJECT, list_docs, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/td"
ADULTS = {"lead": ["leader"], "mom": ["parent"], "dad": ["parent"], "ref": ["committee"]}
NOW = datetime.combine(date.today(), datetime.min.time(), tzinfo=UTC).replace(hour=17)  # midday in Chicago


def day(n: int) -> str:
    return (NOW.date() + timedelta(days=n)).isoformat()


def mail(uid: str) -> str:
    return f"{uid}@example.test"


def digests() -> list[dict]:
    return [m for m in list_docs("emailOutbox") if m["template"] == "weekly_digest"]


def held(member_id: str, kind: str = "scout", state: str = "approved") -> dict:
    return {"memberId": member_id, "kind": kind, "spot": "held", "permission": {"state": state}}


@pytest.fixture(autouse=True)
def seeded(monkeypatch):
    monkeypatch.setenv("FUNCTIONS_EMULATOR", "true")
    monkeypatch.setenv("GCLOUD_PROJECT", PROJECT)
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", AUTH.removeprefix("http://"))
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": uid, "email": mail(uid)} for uid in [*ADULTS, "scout1"]]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 4", "unitNumber": "4"})
    for sid, name in (("s1", "Ava Jones"), ("s2", "Max Jones")):
        owner.set(f"{T}/members/{sid}", {"kind": "scout", "displayName": name, "guardianIds": ["m-mom"]})
    owner.set(
        f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "guardianIds": ["m-mom"], "uid": "scout1"}
    )
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    for uid, roles in ADULTS.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        scouts = ["s1", "s2"] if uid == "mom" else []
        owner.set(f"{T}/access/{uid}", {"memberId": f"m-{uid}", "roles": roles, "scoutIds": scouts})


def test_families_get_one_digest_a_week_with_what_is_theirs():
    from endpoints.digest import run_digest

    signups = {"enabled": True, "audience": "both", "deadline": day(3), "questions": []}
    owner.set(f"{T}/events/camp", {"title": "Campout", "start": day(2), "signups": signups})
    owner.set(f"{T}/events/camp/signups/s2", held("s2"))
    owner.set(f"{T}/events/meet", {"title": "Troop meeting", "start": day(4), "cancelled": True})
    winter = {
        "title": "Winter camp",
        "start": day(40),
        "signups": {**signups, "deadline": day(30)},
        "signupCounts": {"waitingPermission": 1},
    }
    owner.set(f"{T}/events/winter", winter)
    owner.set(f"{T}/events/winter/signups/s1", held("s1", state="pending"))
    owner.set(
        f"{T}/announcements/a1",
        {"title": "Uniform swap", "readerUids": ["mom", "lead"], "createdAt": NOW - timedelta(days=2)},
    )
    owner.set("users/dad", {"emailDigest": False})

    assert run_digest(NOW)["emails"] == 3
    assert {m["to"] for m in digests()} == {mail("mom"), mail("lead"), mail("ref")}  # not dad (off), not the Scout
    mom = next(m for m in digests() if m["to"] == mail("mom"))
    assert "Campout (signed up: Max)" in mom["text"]
    assert "CANCELLED:" in mom["text"] and "Troop meeting" in mom["text"]
    assert "Waiting for your permission\n- Ava: Winter camp" in mom["text"]
    assert "Campout: sign up by" in mom["text"] and "Uniform swap" in mom["text"]
    assert "Jones" not in mom["text"]
    ref = next(m for m in digests() if m["to"] == mail("ref"))
    assert "Uniform swap" not in ref["text"] and "Waiting for your permission" not in ref["text"]

    assert run_digest(NOW)["emails"] == 0  # a rerun the same week sends nothing
    assert len(digests()) == 3


def test_a_quiet_week_sends_nothing():
    from endpoints.digest import run_digest

    owner.set(f"{T}/events/far", {"title": "Summer camp", "start": day(90)})
    assert run_digest(NOW)["emails"] == 0
    assert digests() == []

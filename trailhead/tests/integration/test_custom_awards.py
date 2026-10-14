"""End-to-end: troop-made awards on the Functions emulator, from creation through a version move."""

import os

import pytest

from tests.integration.test_functions import FUTURE, T, call, owner, wait_for
from tests.rules.emulator import list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)

REQS = [
    {"label": "1", "text": "Attend three troop meetings."},
    {"label": "2", "text": "Help plan a campout menu."},
]


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"unitNumber": "123"})
    owner.set(
        f"{T}/access/leader", {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
    )
    owner.set(f"{T}/access/parent", {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]})
    yield


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def save(**fields) -> dict:
    return ok(call("save_custom_award", "leader", {"troopId": "t1", "name": "First-Year Trail", **fields}))


def sign(signoff_id: str, award_id: str, version_id: str, req_id: str) -> dict:
    so = {"scoutId": "s1", "awardId": award_id, "versionId": version_id, "reqId": req_id, "signerUid": "leader"}
    owner.create(f"{T}/signoffs/{signoff_id}", {**so, "status": "pending"})
    return wait_for(lambda: (read(f"{T}/signoffs/{signoff_id}") or {}).get("status") != "pending")


def test_only_leaders_save_and_input_is_checked():
    r = call("save_custom_award", "parent", {"troopId": "t1", "name": "Mine", "requirements": REQS})
    assert r.status_code == 403
    r = call("save_custom_award", "leader", {"troopId": "t1", "name": "Mine", "requirements": []})
    assert r.status_code == 400
    assert "at least one requirement" in r.text


def test_edit_versions_sign_and_move():
    created = save(requirements=REQS, description="For new Scouts")
    award_id = created["awardId"]
    assert award_id.startswith("custom-") and created["versionId"] == "v1"
    v1 = read(f"{T}/customAwards/{award_id}/versions/v1")["requirements"]
    assert [r["label"] for r in v1] == ["1", "2"]

    # Renaming keeps the version.
    renamed = save(awardId=award_id, name="First-Year Trail Award", requirements=v1)
    assert renamed == {"awardId": award_id, "versionId": "v1", "newVersion": False}

    # A leader signs both requirements on version 1.
    assert sign("a", award_id, "v1", v1[0]["id"])
    assert sign("b", award_id, "v1", v1[1]["id"])
    assert read(f"{T}/signoffs/b")["status"] == "accepted"

    # Rewording requirement 2 and adding 3 makes version 2; the Scout stays on version 1.
    v2_form = [v1[0], {**v1[1], "text": "Plan and cook a campout menu."}, {"label": "3", "text": "Lead a game."}]
    edited = save(awardId=award_id, requirements=v2_form, note="Cooking added")
    assert edited["versionId"] == "v2" and edited["newVersion"]
    assert read(f"{T}/progress/s1_{award_id}")["versionId"] == "v1"
    assert len(list_docs(f"{T}/customAwards/{award_id}/versions")) == 2

    # Only leaders move Scouts.
    move = {"troopId": "t1", "scoutId": "s1", "awardId": award_id, "versionId": "v2"}
    assert call("move_to_custom_version", "parent", move).status_code == 403
    summary = ok(call("move_to_custom_version", "leader", move))
    assert summary["carried"] == ["1"] and summary["needsReview"] == ["2"] and summary["dropped"] == []
    progress = read(f"{T}/progress/s1_{award_id}")
    assert progress["versionId"] == "v2"
    assert set(progress["requirements"]) == {v1[0]["id"]}
    assert progress["needsReview"] == [v1[1]["id"]]
    again = call("move_to_custom_version", "leader", move)
    assert again.status_code == 400 and "already on the latest" in again.text

    # Signing the flagged requirement on the new version settles the review.
    sign("c", award_id, "v2", v1[1]["id"])
    assert read(f"{T}/progress/s1_{award_id}")["needsReview"] == []


def test_archive_and_restore():
    award_id = save(requirements=REQS)["awardId"]
    assert ok(call("archive_custom_award", "leader", {"troopId": "t1", "awardId": award_id}))["archived"] is True
    assert read(f"{T}/customAwards/{award_id}")["archived"] is True
    blocked = call(
        "save_custom_award", "leader", {"troopId": "t1", "awardId": award_id, "name": "X", "requirements": REQS}
    )
    assert blocked.status_code == 400 and "archived" in blocked.text
    restore = {"troopId": "t1", "awardId": award_id, "archived": False}
    assert ok(call("archive_custom_award", "leader", restore))["archived"] is False
    assert call("archive_custom_award", "parent", {"troopId": "t1", "awardId": award_id}).status_code == 403

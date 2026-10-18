"""End-to-end: patrols, activity credits that follow attendance, manual entries and their approval, and erasing a Scout.
Runs against the Functions emulator."""

import os
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests

from tests.integration.test_functions import call, owner, wait_for
from tests.rules.emulator import DOCS, Client, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
TID = "ta"
T = f"troops/{TID}"
FUTURE = datetime.now(UTC) + timedelta(days=365)
TODAY = date.today().isoformat()
# Two days ahead, so it is in the future both here and on the server, whose date is UTC (a day ahead in US evenings).
TOMORROW = (date.today() + timedelta(days=2)).isoformat()
CAMPOUT = {"title": "October campout", "start": "2026-10-10", "logKind": "campout", "logValues": {"nights": 2}}


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    scouts = {"s1": "Sam", "s2": "Ava", "s3": "Max"}
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "uid": "scout1", "guardianIds": ["m-mom"]})
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Ava", "guardianIds": ["m-dad"]})
    owner.set(f"{T}/members/s3", {"kind": "scout", "displayName": "Max", "guardianIds": []})
    for sid in scouts:
        owner.set(f"{T}/scoutRecords/{sid}", {"birthYear": 2012, "birthMonth": 5, "currentRankId": "scout"})
    people = {
        "lead": ("m-lead", ["leader", "scoutmaster"], []),
        "mom": ("m-mom", ["parent"], ["s1"]),
        "dad": ("m-dad", ["parent"], ["s2"]),
        "scout1": ("s1", ["scout"], ["s1"]),
        "newmom": ("m-new", ["parent"], ["s3"]),
    }
    for uid, (mid, roles, kids) in people.items():
        if mid.startswith("m-"):
            owner.set(f"{T}/members/{mid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        access = {"memberId": mid, "roles": roles, "scoutIds": kids}
        if "leader" in roles:
            access["yptExpiresAt"] = FUTURE
        if uid == "newmom":
            access["consentPendingScoutIds"] = ["s3"]  # has not agreed to the parent notice yet
        owner.set(f"{T}/access/{uid}", access)
    yield


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def ids() -> list[str]:
    """The ids of every credit document in the troop."""
    r = requests.get(f"{DOCS}/{T}/logs", headers={"Authorization": "Bearer owner"}, timeout=10)
    r.raise_for_status()
    return [d["name"].rsplit("/", 1)[-1] for d in r.json().get("documents", [])]


def present(scout: str, value: bool = True):
    owner.set(f"{T}/events/e1/attendance/{scout}", {"present": value})


def test_event_credits_follow_attendance_and_event_changes():
    owner.set(f"{T}/events/e1", CAMPOUT)
    present("s1")
    present("s2")
    present("s3", False)
    credit = wait_for(lambda: read(f"{T}/logs/e1_s1"))
    assert credit["nights"] == 2 and credit["kind"] == "campout" and credit["source"] == "event"
    assert credit["status"] == "approved" and credit["date"] == "2026-10-10"
    assert wait_for(lambda: read(f"{T}/logs/e1_s2"))
    assert read(f"{T}/logs/e1_s3") is None

    # Marking the same Scout present again, or twice, leaves one credit with the same numbers.
    present("s1")
    present("s1")
    assert sorted(ids()) == ["e1_s1", "e1_s2"] and read(f"{T}/logs/e1_s1")["nights"] == 2

    # Changing the event recomputes every Scout who is present.
    owner.set(f"{T}/events/e1", {**CAMPOUT, "logValues": {"nights": 3, "miles": 4}, "title": "Fall campout"})
    wait_for(lambda: (read(f"{T}/logs/e1_s2") or {}).get("nights") == 3)
    changed = read(f"{T}/logs/e1_s1")
    assert changed["nights"] == 3 and changed["miles"] == 4 and changed["eventTitle"] == "Fall campout"

    # Unticking a Scout takes their credit away. Ticking them again brings it back.
    present("s2", False)
    wait_for(lambda: read(f"{T}/logs/e1_s2") is None)
    present("s2")
    assert wait_for(lambda: read(f"{T}/logs/e1_s2"))["nights"] == 3

    # Clearing the amounts removes every credit. Deleting the event also removes them.
    owner.set(f"{T}/events/e1", {**CAMPOUT, "logValues": {"nights": 0}})
    wait_for(lambda: ids() == [])
    owner.set(f"{T}/events/e1", CAMPOUT)
    wait_for(lambda: len(ids()) == 2)
    owner.delete(f"{T}/events/e1")
    wait_for(lambda: ids() == [])


def review(uid: str, entry_id: str, action: str):
    return call("review_activity_entry", uid, {"troopId": TID, "entryId": entry_id, "action": action})


def delete(uid: str, entry_id: str):
    return call("delete_activity_entry", uid, {"troopId": TID, "entryId": entry_id})


def entry(**over) -> dict:
    body = {
        "troopId": TID,
        "scoutId": "s1",
        "kind": "service",
        "date": TODAY,
        "serviceHours": 40,
        "note": "Eagle project: trail bridge",
        "eagleProject": True,
    }
    return {**body, **over}


def test_manual_entries_and_approval():
    mine = ok(call("add_activity_entry", "lead", entry()))
    assert mine["status"] == "approved"
    saved = read(f"{T}/logs/{mine['entryId']}")
    assert saved["source"] == "manual" and saved["serviceHours"] == 40 and saved["eagleProject"] is True

    # A parent and the Scout (13 or older) can submit for their own Scout; it waits for a leader.
    waiting = ok(call("add_activity_entry", "mom", entry(serviceHours=3, eagleProject=False, note="Park cleanup")))
    own = ok(call("add_activity_entry", "scout1", entry(kind="campout", nights=6, serviceHours=0, note="Summer camp")))
    assert waiting["status"] == own["status"] == "pending"
    assert read(f"{T}/logs/{waiting['entryId']}")["enteredByName"] == "Mom"

    # Not for another family's Scout, a stranger, or a parent who has not agreed to the notice.
    assert call("add_activity_entry", "mom", entry(scoutId="s2")).status_code == 403
    assert call("add_activity_entry", "stranger", entry()).status_code == 403
    assert call("add_activity_entry", "newmom", entry(scoutId="s3")).status_code == 403
    assert call("add_activity_entry", "mom", entry(scoutId="nobody")).status_code == 403

    # Bad input is refused.
    assert call("add_activity_entry", "lead", entry(date=TOMORROW)).status_code == 400
    # The server's "today" is US Central, not UTC, so tomorrow is refused even in the evening, when UTC is a day ahead.
    local_tomorrow = (datetime.now(ZoneInfo("America/Chicago")).date() + timedelta(days=1)).isoformat()
    assert call("add_activity_entry", "lead", entry(date=local_tomorrow)).status_code == 400
    assert call("add_activity_entry", "lead", entry(note="  ")).status_code == 400
    assert call("add_activity_entry", "lead", entry(serviceHours=0)).status_code == 400
    assert call("add_activity_entry", "lead", entry(kind="party")).status_code == 400

    # Only a leader answers. An entry is answered once.
    assert (
        call(
            "review_activity_entry", "mom", {"troopId": TID, "entryId": waiting["entryId"], "action": "approve"}
        ).status_code
        == 403
    )
    done = ok(review("lead", waiting["entryId"], "approve"))
    assert done["status"] == "approved" and read(f"{T}/logs/{waiting['entryId']}")["reviewedByMemberId"] == "m-lead"
    again = review("lead", waiting["entryId"], "reject")
    assert again.status_code == 400
    rejected = ok(review("lead", own["entryId"], "reject"))
    assert rejected["status"] == "rejected"

    # A family can withdraw only an entry that is still waiting; a leader can delete any manual entry.
    extra = ok(call("add_activity_entry", "mom", entry(note="Another")))["entryId"]
    assert delete("dad", extra).status_code == 403
    assert delete("mom", waiting["entryId"]).status_code == 403
    assert delete("mom", extra).status_code == 200
    assert delete("lead", mine["entryId"]).status_code == 200
    assert read(f"{T}/logs/{extra}") is None and read(f"{T}/logs/{mine['entryId']}") is None


def test_a_family_cannot_pile_up_pending_entries_and_event_credits_cannot_be_deleted_by_hand():
    for n in range(10):
        ok(call("add_activity_entry", "mom", entry(note=f"Entry {n}")))
    assert call("add_activity_entry", "mom", entry(note="One more")).status_code == 429
    assert call("add_activity_entry", "lead", entry(note="A leader can")).status_code == 200
    owner.set(f"{T}/events/e1", CAMPOUT)
    present("s1")
    wait_for(lambda: read(f"{T}/logs/e1_s1"))
    assert delete("lead", "e1_s1").status_code == 404
    assert review("lead", "e1_s1", "approve").status_code == 404


def test_a_family_reads_its_own_credits_and_a_leader_reads_all():
    owner.set(f"{T}/events/e1", CAMPOUT)
    present("s1")
    present("s2")
    wait_for(lambda: read(f"{T}/logs/e1_s2"))
    assert Client("mom").get(f"{T}/logs/e1_s1") == 200
    assert Client("mom").get(f"{T}/logs/e1_s2") == 403
    assert Client("scout1").get(f"{T}/logs/e1_s1") == 200
    assert Client("lead").get(f"{T}/logs/e1_s2") == 200


def patrol(uid="lead", **over):
    return call("save_patrol", uid, {"troopId": TID, "name": "Eagles", **over})


def test_patrols_and_their_leaders():
    eagles = ok(patrol(color="#1565C0"))["patrolId"]
    owls = ok(patrol(name="Owls"))["patrolId"]
    assert read(f"{T}/patrols/{eagles}")["color"] == "#1565c0"
    assert patrol("mom").status_code == 403
    assert patrol(name="eagles").status_code == 400  # a name is used once
    assert patrol(name="").status_code == 400 and patrol(name="Hawks", color="blue").status_code == 400

    moved = ok(call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s1", "s2"], "patrolId": eagles}))
    assert moved["moved"] == 2 and read(f"{T}/members/s1")["patrolId"] == eagles
    assert call("assign_patrol", "mom", {"troopId": TID, "scoutIds": ["s3"], "patrolId": eagles}).status_code == 403
    assert call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["m-mom"], "patrolId": eagles}).status_code == 400
    assert call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s3"], "patrolId": "nope"}).status_code == 400

    # The patrol leader and assistant must be two different Scouts in the patrol.
    ok(patrol(patrolId=eagles, leaderId="s1", assistantId="s2"))
    assert patrol(patrolId=eagles, leaderId="s3").status_code == 400
    assert patrol(patrolId=eagles, leaderId="s1", assistantId="s1").status_code == 400
    assert read(f"{T}/patrols/{eagles}")["leaderId"] == "s1"
    ok(patrol(patrolId=eagles, name="Eagle patrol"))  # color and officers are kept when not sent
    assert read(f"{T}/patrols/{eagles}")["assistantId"] == "s2" and read(f"{T}/patrols/{eagles}")["color"] == "#1565c0"

    # Moving a Scout to another patrol puts them in one patrol only and takes away their office.
    ok(call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s1"], "patrolId": owls}))
    assert read(f"{T}/members/s1")["patrolId"] == owls
    assert read(f"{T}/patrols/{eagles}")["leaderId"] is None and read(f"{T}/patrols/{eagles}")["assistantId"] == "s2"

    # Taking a Scout out of every patrol, and deleting a patrol.
    ok(call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s2"], "patrolId": None}))
    assert "patrolId" not in read(f"{T}/members/s2") and read(f"{T}/patrols/{eagles}")["assistantId"] is None
    gone = ok(call("delete_patrol", "lead", {"troopId": TID, "patrolId": owls}))
    assert gone["scoutsUnassigned"] == 1 and read(f"{T}/patrols/{owls}") is None
    assert "patrolId" not in read(f"{T}/members/s1")
    assert call("delete_patrol", "mom", {"troopId": TID, "patrolId": eagles}).status_code == 403
    assert call("delete_patrol", "lead", {"troopId": TID, "patrolId": owls}).status_code == 404


def test_announcement_to_the_parents_of_a_patrol():
    eagles = ok(patrol())["patrolId"]
    ok(call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s1"], "patrolId": eagles}))
    post = {
        "troopId": TID,
        "title": "Patrol meeting",
        "body": "Thursday.",
        "audience": {"type": "patrolParents", "patrolId": eagles},
    }
    result = ok(call("post_announcement", "lead", post))
    stored = read(f"{T}/announcements/{result['announcementId']}")
    assert stored["readerUids"] == ["lead", "mom"] and stored["audienceLabel"] == "Parents of Eagles"
    bad = {**post, "audience": {"type": "patrolParents", "patrolId": "nope"}}
    assert call("post_announcement", "lead", bad).status_code == 400
    assert call("post_announcement", "lead", {**post, "audience": {"type": "patrolParents"}}).status_code == 400


def test_erasing_a_scout_removes_their_credits_and_patrol_office_but_not_anyone_elses():
    eagles = ok(patrol())["patrolId"]
    ok(call("assign_patrol", "lead", {"troopId": TID, "scoutIds": ["s1", "s2"], "patrolId": eagles}))
    ok(patrol(patrolId=eagles, leaderId="s1", assistantId="s2"))
    owner.set(f"{T}/events/e1", CAMPOUT)
    present("s1")
    present("s2")
    wait_for(lambda: read(f"{T}/logs/e1_s2"))
    manual = ok(call("add_activity_entry", "lead", entry(scoutId="s1")))["entryId"]
    other = ok(call("add_activity_entry", "lead", entry(scoutId="s2")))["entryId"]

    ok(call("remove_scout", "lead", {"troopId": TID, "scoutId": "s1", "confirm": True}))
    assert read(f"{T}/logs/e1_s1") is None and read(f"{T}/logs/{manual}") is None
    assert read(f"{T}/logs/e1_s2") is not None and read(f"{T}/logs/{other}") is not None
    patrol_doc = read(f"{T}/patrols/{eagles}")
    assert patrol_doc["leaderId"] is None and patrol_doc["assistantId"] == "s2"

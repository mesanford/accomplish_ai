"""End-to-end: the nightly retention job, and the leader actions it relies on (marking a Scout as left,
deleting a lead) and activity tracking.

The scheduled function can't be triggered on these emulators, so the job's body (`run_retention`) runs in this
process against the same Firestore and Storage emulators the functions use.
"""

import os
from datetime import UTC, date, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.rules.emulator import list_docs, read, reset
from tests.rules.storage import Storage, reset_storage

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)


def years_ago(n: float) -> datetime:
    return NOW - timedelta(days=round(365.25 * n))


@pytest.fixture(autouse=True)
def clean():
    reset()
    reset_storage()
    yield


@pytest.fixture
def run():
    """`run_retention` against the emulators, as the deployed job would run it."""
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.retention import Budget, run_retention

    return lambda dry_run=True, **limits: run_retention(TODAY, dry_run, Budget(**limits))


def test_mark_scout_left_is_leader_only_and_can_be_undone():
    tid = new_troop("41")
    sid = new_scout(tid, "lead", "Sam", 2012)
    args = {"troopId": tid, "scoutId": sid, "left": True}
    assert call("mark_scout_left", "stranger", args).status_code == 403
    assert call("mark_scout_left", "lead", {**args, "left": "yes"}).status_code == 400
    assert call("mark_scout_left", "lead", {**args, "scoutId": "nobody"}).status_code == 404
    first = ok(call("mark_scout_left", "lead", args))
    assert first["left"] is True and first["leftAt"]
    assert ok(call("mark_scout_left", "lead", args))["leftAt"] == first["leftAt"]  # the first date is kept
    assert ok(call("mark_scout_left", "lead", {**args, "left": False})) == {"left": False, "leftAt": None}
    assert "leftAt" not in read(f"troops/{tid}/members/{sid}")


def test_record_activity_writes_at_most_once_a_day():
    tid = new_troop("42")
    assert call("record_activity", "stranger", {"troopId": tid}).status_code == 403
    assert ok(call("record_activity", "lead", {"troopId": tid})) == {"recorded": True}
    assert read(f"troops/{tid}")["lastActiveAt"]
    assert ok(call("record_activity", "lead", {"troopId": tid})) == {"recorded": False}


def test_scouts_are_deleted_twelve_months_after_leaving_or_turning_eighteen(run):
    tid = new_troop("43")
    t = f"troops/{tid}"
    left_long_ago = new_scout(tid, "lead", "Ava", 2013)
    left_recently = new_scout(tid, "lead", "Ben", 2013)
    adult = new_scout(tid, "lead", "Cal", 2013)
    no_birth = new_scout(tid, "lead", "Dee", 2013)
    young = new_scout(tid, "lead", "Eli", 2013)
    for sid, when in ((left_long_ago, years_ago(1.5)), (left_recently, years_ago(0.5))):
        member = read(f"{t}/members/{sid}")
        owner.set(f"{t}/members/{sid}", {**member, "leftAt": when})
    owner.set(f"{t}/scoutRecords/{adult}", {"birthYear": 2007, "birthMonth": 8, "currentRankId": "eagle"})
    owner.set(f"{t}/scoutRecords/{no_birth}", {"currentRankId": "star"})
    owner.set(f"{t}/progress/{left_long_ago}_art", {"scoutId": left_long_ago, "awardId": "art"})
    assert Storage("owner").upload(f"cards/{tid}/{left_long_ago}/c1/card.png") == 200

    totals = run()
    assert totals["scouts"] == 2
    for sid in (left_long_ago, adult):
        assert read(f"{t}/members/{sid}") is None and read(f"{t}/scoutRecords/{sid}") is None
    assert read(f"{t}/progress/{left_long_ago}_art") is None
    assert Storage("owner").download(f"cards/{tid}/{left_long_ago}/c1/card.png") == 404
    for sid in (left_recently, no_birth, young):
        assert read(f"{t}/members/{sid}") is not None
    assert run()["scouts"] == 0  # rerunning finds nothing more


def test_scout_deletions_are_bounded_per_run(run):
    tid = new_troop("44")
    t = f"troops/{tid}"
    ids = [new_scout(tid, "lead", f"S{n}", 2000) for n in range(3)]  # all over 19
    assert run(scouts=2)["scouts"] == 2
    assert sum(read(f"{t}/members/{s}") is not None for s in ids) == 1
    assert run(scouts=2)["scouts"] == 1


def test_old_conversations_go_with_their_messages(run):
    tid = new_troop("45")
    t = f"troops/{tid}"
    owner.set(f"{t}/threads/old", {"memberIds": [], "participantUids": [], "updatedAt": years_ago(2.1)})
    for n in range(3):
        owner.set(f"{t}/threads/old/messages/m{n}", {"body": "hi", "createdAt": years_ago(2.2)})
    owner.set(f"{t}/threads/recent", {"memberIds": [], "participantUids": [], "updatedAt": years_ago(1.5)})
    owner.set(f"{t}/threads/recent/messages/m0", {"body": "hi", "createdAt": years_ago(1.5)})
    # The thread date says old, but a newer message says otherwise: keep it.
    owner.set(f"{t}/threads/mixed", {"memberIds": [], "participantUids": [], "updatedAt": years_ago(3)})
    owner.set(f"{t}/threads/mixed/messages/m0", {"body": "hi", "createdAt": years_ago(0.1)})

    assert run()["threads"] == 1
    assert read(f"{t}/threads/old") is None and list_docs(f"{t}/threads/old/messages") == []
    assert read(f"{t}/threads/recent") is not None and read(f"{t}/threads/mixed") is not None


def test_old_leads_and_usage_counters_go(run):
    tid = new_troop("46")
    t = f"troops/{tid}"
    lead = {"name": "Jordan", "email": "j@example.com", "status": "new", "notes": "", "source": "website"}
    owner.set(f"{t}/leads/old", {**lead, "createdAt": years_ago(1.1)})
    owner.set(f"{t}/leads/new", {**lead, "createdAt": years_ago(0.5)})
    owner.set(f"{t}/invites/code1", {"role": "parent", "scoutIds": [], "leadId": "old"})
    old_day, new_day = (TODAY - timedelta(days=31)).isoformat(), (TODAY - timedelta(days=30)).isoformat()
    for doc_id in (f"lead_{old_day}", f"about_lead_{old_day}", f"leads_{old_day}", f"lead_{new_day}"):
        owner.set(f"{t}/usage/{doc_id}", {"count": 1})

    totals = run()
    assert totals["leads"] == 1 and totals["usage"] == 3
    assert read(f"{t}/leads/old") is None and read(f"{t}/leads/new") is not None
    assert "leadId" not in read(f"{t}/invites/code1")
    assert read(f"{t}/usage/lead_{new_day}") is not None
    assert read(f"{t}/usage/lead_{old_day}") is None


def test_a_leader_deletes_a_lead_and_its_invite_still_works():
    tid = new_troop("47")
    t = f"troops/{tid}"
    lead = {"name": "Jordan", "email": "j@example.com", "status": "new", "notes": "", "source": "website"}
    owner.set(f"{t}/leads/l1", {**lead, "createdAt": NOW})
    code = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "leadId": "l1"}))["code"]
    args = {"troopId": tid, "leadId": "l1"}
    assert call("delete_lead", "stranger", args).status_code == 403
    assert call("delete_lead", "lead", {**args, "leadId": "nope"}).status_code == 404
    assert ok(call("delete_lead", "lead", args)) == {"deleted": True}
    assert read(f"{t}/leads/l1") is None
    ok(call("accept_invite", "jordan", {"troopId": tid, "code": code, "displayName": "Jordan"}))
    assert read(f"{t}/access/jordan") is not None

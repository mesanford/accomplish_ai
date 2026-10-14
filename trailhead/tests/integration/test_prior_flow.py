"""End-to-end: a leader records a Scout's earlier ranks and badges, and the plan checker counts them."""

import os

import pytest

from tests.integration.test_functions import call, owner, wait_for
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.rules.emulator import read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def test_record_earlier_advancement():
    tid = new_troop("8")
    sid = new_scout(tid, "lead", "Sam", 2012)
    form = {
        "troopId": tid,
        "scoutId": sid,
        "ranks": {"tenderfoot": "2023-02-01", "second-class": "2023-08-01", "first-class": "2024-03-01"},
        "badges": [{"awardId": "camping", "date": "2024-07-15"}, {"awardId": "first-aid", "date": "2024-04-10"}],
        "partials": [{"awardId": "cooking", "date": "2025-06-01", "requirements": ["1", "2a"]}],
    }
    assert call("record_prior_advancement", "stranger", form).status_code == 403
    result = ok(call("record_prior_advancement", "lead", form))
    assert result == {"ranks": 3, "badges": 3, "skipped": []}

    record = read(f"troops/{tid}/scoutRecords/{sid}")
    assert record["currentRankId"] == "first-class"
    assert set(record["priorRankIds"]) == {"tenderfoot", "second-class", "first-class"}
    assert read(f"troops/{tid}/progress/{sid}_camping")["status"] == "complete"
    assert read(f"troops/{tid}/progress/{sid}_cooking")["requirements"]["2a"]["status"] == "signed"

    # Work recorded in Trailhead itself is kept; the entry reports it as skipped.
    owner.set(f"troops/{tid}/progress/{sid}_chess", {"scoutId": sid, "awardId": "chess", "status": "complete"})
    again = {**form, "ranks": {}, "partials": [], "badges": [{"awardId": "chess", "date": "2024-01-05"}]}
    assert ok(call("record_prior_advancement", "lead", again))["skipped"] == ["Chess"]

    # The plan checker counts the earlier badges toward Star.
    owner.set(f"troops/{tid}/paths/{sid}", {"scoutId": sid, "goalAwardId": "star", "items": []})
    path = wait_for(
        lambda: (read(f"troops/{tid}/paths/{sid}") or {}).get("feasibility") and read(f"troops/{tid}/paths/{sid}")
    )
    short = next(i for i in path["feasibility"]["issues"] if i["code"] == "not_enough_badges")
    assert "the plan has 3." in short["message"]


def test_bad_rank_order_is_refused():
    tid = new_troop("6")
    sid = new_scout(tid, "lead", "Ava", 2013)
    form = {"troopId": tid, "scoutId": sid, "ranks": {"tenderfoot": "2025-02-01", "second-class": "2024-08-01"}}
    r = call("record_prior_advancement", "lead", form)
    assert r.status_code == 400
    assert "dated before" in r.text

"""End-to-end: a leader records a paper blue card, and the Scoutbook report picks it up."""

import os
import time
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.rules.emulator import list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


def days_ago(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).date().isoformat()


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def form(tid, sid, **changes):
    base = {
        "troopId": tid,
        "scoutId": sid,
        "awardId": "camping",
        "counselorName": "Jordan Smith",
        "counselorEmail": "jordan@example.org",
        "startedOn": days_ago(90),
        "requirements": [{"reqId": "1", "date": days_ago(60)}, {"reqId": "2a", "date": days_ago(50)}],
    }
    return {**base, **changes}


def test_paper_card_in_progress_writes_card_signoffs_and_progress():
    tid = new_troop("21")
    sid = new_scout(tid, "lead", "Sam", 2012)
    result = ok(call("record_paper_blue_card", "lead", form(tid, sid)))
    assert result == {"cardId": f"{sid}_camping", "requirements": 2, "complete": False}

    card = read(f"troops/{tid}/blueCards/{sid}_camping")
    assert card["status"] == "in_progress"
    assert card["source"] == "paper"
    assert (card["counselorName"], card["counselorEmail"]) == ("Jordan Smith", "jordan@example.org")
    assert card["startedOn"] == days_ago(90)
    assert card["photoPaths"] == []
    assert "counselorUid" not in card

    signoffs = list_docs(f"troops/{tid}/signoffs")
    assert {s["reqId"] for s in signoffs} == {"1", "2a"}
    assert all(s["status"] == "accepted" and s["source"] == "paper" for s in signoffs)
    assert all(s["onBehalfOf"] == "Jordan Smith" and s["recordedAt"] for s in signoffs)
    assert all(s["signerUid"] == "lead" for s in signoffs)

    progress = read(f"troops/{tid}/progress/{sid}_camping")
    assert progress["status"] == "in_progress"
    assert progress["requirements"]["2a"]["onBehalfOf"] == "Jordan Smith"
    assert len({r["signoffId"] for r in progress["requirements"].values()}) == 2

    # The sign-off trigger must leave these alone: nothing rejected, progress unchanged.
    time.sleep(4)
    assert all(s["status"] == "accepted" for s in list_docs(f"troops/{tid}/signoffs"))
    assert read(f"troops/{tid}/progress/{sid}_camping") == progress


def test_paper_card_completed_is_complete_with_the_real_date():
    tid = new_troop("22")
    sid = new_scout(tid, "lead", "Ava", 2012)
    done = days_ago(30)
    assert ok(call("record_paper_blue_card", "lead", form(tid, sid, completedOn=done)))["complete"] is True
    assert read(f"troops/{tid}/blueCards/{sid}_camping")["status"] == "complete"
    time.sleep(4)  # the blue-card trigger must not replace the completion date with today's
    progress = read(f"troops/{tid}/progress/{sid}_camping")
    assert (progress["status"], progress["completedAt"], progress["source"]) == ("complete", done, "paper")


def test_refusals():
    tid = new_troop("23")
    sid = new_scout(tid, "lead", "Kai", 2012)
    assert call("record_paper_blue_card", "stranger", form(tid, sid)).status_code == 403
    assert call("record_paper_blue_card", "lead", form(tid, "nobody")).status_code == 404
    future = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
    assert call("record_paper_blue_card", "lead", form(tid, sid, startedOn=future)).status_code == 400
    too_early = form(tid, sid, startedOn="2021-01-01")
    assert "before the Scout turned 10" in call("record_paper_blue_card", "lead", too_early).text
    assert call("record_paper_blue_card", "lead", form(tid, sid, counselorName="")).status_code == 400
    assert call("record_paper_blue_card", "lead", form(tid, sid, requirements=[])).status_code == 400
    assert list_docs(f"troops/{tid}/signoffs") == []

    ok(call("record_paper_blue_card", "lead", form(tid, sid)))
    again = call("record_paper_blue_card", "lead", form(tid, sid))
    assert again.status_code == 409
    assert "already has a Camping blue card" in again.text


def test_finished_badge_in_trailhead_blocks_a_paper_card():
    tid = new_troop("24")
    sid = new_scout(tid, "lead", "Noa", 2012)
    owner.set(f"troops/{tid}/progress/{sid}_camping", {"scoutId": sid, "awardId": "camping", "status": "complete"})
    refused = call("record_paper_blue_card", "lead", form(tid, sid))
    assert refused.status_code == 409
    assert "already has" in refused.text


def test_scoutbook_report_includes_paper_items_recorded_after_the_last_report():
    tid = new_troop("25")
    sid = new_scout(tid, "lead", "Sam", 2012)
    yesterday = datetime.now(UTC) - timedelta(days=1)
    base = {"scoutId": sid, "versionId": "v1", "signerUid": "lead", "signedAt": yesterday, "status": "accepted"}
    owner.set(f"troops/{tid}/signoffs/first", {**base, "awardId": "chess", "reqId": "1"})
    first = ok(call("create_scoutbook_report", "lead", {"troopId": tid}))
    assert first["created"] is True

    # Signed two months ago, but only entered now: it belongs in the next report.
    done = days_ago(45)
    ok(call("record_paper_blue_card", "lead", form(tid, sid, completedOn=done)))
    second = ok(call("create_scoutbook_report", "lead", {"troopId": tid}))
    assert second["created"] is True
    rows = read(f"troops/{tid}/exports/{second['reportId']}")["rows"]
    camping = [r for r in rows if r["awardId"] == "camping"]
    assert {(r["kind"], r.get("requirement"), r["date"]) for r in camping} == {
        ("requirement", "1", days_ago(60)),
        ("requirement", "2a", days_ago(50)),
        ("merit_badge", None, done),
    }
    assert all(r["signedBy"] == "Pat (for Jordan Smith, counselor)" for r in camping if r["kind"] == "requirement")
    assert not any(r["awardId"] == "chess" for r in rows)

    # Listed once only.
    third = ok(call("create_scoutbook_report", "lead", {"troopId": tid}))
    assert third["created"] is False

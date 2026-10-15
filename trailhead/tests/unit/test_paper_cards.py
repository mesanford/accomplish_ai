from datetime import UTC, date, datetime

import pytest

from handlers.membership import InvalidInput
from handlers.paper_cards import already_started, card_doc, check_paper_card, progress_doc, signoff_doc
from handlers.signoffs import apply_signoff
from trailhead_core import load_catalog

TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 9, tzinfo=UTC)
RECORD = {"birthYear": 2012, "birthMonth": 3}  # turned 10 in March 2022
CATALOG = load_catalog()
BASE = {
    "awardId": "camping",
    "counselorName": "  Jordan   Smith ",
    "startedOn": "2026-05-01",
    "requirements": [{"reqId": "1", "date": "2026-05-20"}, {"reqId": "2A", "date": "2026-06-01"}],
}


def check(**changes):
    return check_paper_card({**BASE, **changes}, RECORD, CATALOG, TODAY)


def test_valid_card_in_progress():
    plan = check(counselorEmail=" jordan@example.org ")
    assert plan.counselor_name == "Jordan Smith"
    assert plan.counselor_email == "jordan@example.org"
    assert plan.requirements == {"1": "2026-05-20", "2a": "2026-06-01"}
    assert plan.completed_on is None


def test_completed_card_may_list_no_requirements():
    plan = check(requirements=[], completedOn="2026-07-01")
    assert plan.completed_on == "2026-07-01"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"awardId": "nope"}, "Choose a merit badge"),
        ({"counselorName": "  "}, "counselor's name"),
        ({"counselorEmail": "not an email"}, "counselor email"),
        ({"startedOn": "2026-11-01"}, "in the future"),
        ({"startedOn": "2021-01-01"}, "before the Scout turned 10"),
        ({"startedOn": "soon"}, "Enter the start date as a date"),
        ({"completedOn": "2026-10-15"}, "in the future"),
        ({"requirements": [{"reqId": "1", "date": "2026-04-30"}]}, "requirement 1 is before the start date"),
        ({"requirements": [{"reqId": "1", "date": "2026-12-01"}]}, "in the future"),
        ({"requirements": [{"reqId": "1", "date": "2021-01-01"}]}, "before the Scout turned 10"),
        ({"requirements": [{"reqId": "x!", "date": "2026-05-20"}]}, "doesn't look like a requirement"),
        ({"requirements": [{"reqId": "1", "date": "2026-05-20"}, {"reqId": "1", "date": "2026-05-21"}]}, "twice"),
        ({"requirements": []}, "List the requirements"),
        ({"completedOn": "2026-04-01"}, "before the start date"),
        ({"completedOn": "2026-05-25"}, "after the completion date"),
    ],
)
def test_refusals(changes, message):
    with pytest.raises(InvalidInput, match=message):
        check(**changes)


def test_documents_for_an_in_progress_card():
    plan = check()
    card = card_doc("s1", plan, "2026-01-01", "m1", NOW)
    assert card["status"] == "in_progress"
    assert (card["counselorName"], card["counselorEmail"], card["source"]) == ("Jordan Smith", None, "paper")
    assert card["photoPaths"] == []
    so = signoff_doc("s1", plan, "2a", "2026-01-01", "leader-uid", NOW)
    assert so["status"] == "accepted"
    assert so["onBehalfOf"] == "Jordan Smith"
    assert so["signedAt"] == datetime(2026, 6, 1, 12, tzinfo=UTC)
    assert so["recordedAt"] == NOW
    prog = progress_doc("s1", plan, "2026-01-01", {"1": "a", "2a": "b"}, NOW)
    assert prog["status"] == "in_progress"
    assert prog["requirements"]["2a"] == {"status": "signed", "signoffId": "b", "onBehalfOf": "Jordan Smith"}


def test_documents_for_a_completed_card():
    plan = check(completedOn="2026-06-15")
    assert card_doc("s1", plan, "v", "m1", NOW)["status"] == "complete"
    prog = progress_doc("s1", plan, "v", {}, NOW)
    assert (prog["status"], prog["completedAt"], prog["source"]) == ("complete", "2026-06-15", "paper")


def test_existing_cards_and_finished_badges_block_a_paper_card():
    assert already_started({"status": "requested"}, None)
    assert already_started({"status": "complete"}, None)
    assert already_started(None, {"status": "complete"})
    assert not already_started(None, {"status": "in_progress"})
    assert not already_started({"status": "cancelled"}, None)
    assert not already_started(None, None)


def test_apply_signoff_copies_on_behalf_of_only_when_present():
    signoff = {"scoutId": "s1", "awardId": "camping", "versionId": "v1", "reqId": "1", "onBehalfOf": "Jordan Smith"}
    out = apply_signoff("so1", signoff, None)
    assert out.progress["requirements"]["1"] == {"status": "signed", "signoffId": "so1", "onBehalfOf": "Jordan Smith"}
    plain = apply_signoff("so2", {k: v for k, v in signoff.items() if k != "onBehalfOf"}, out.progress)
    assert plain.progress["requirements"]["1"] == {"status": "signed", "signoffId": "so2"}

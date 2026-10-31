"""Event plans: planners (leaders and committee), the plan's trip lead and the treasurer read a plan; only the
plan_action function writes it; planners and the trip lead write its research cards, with availability stamped by
the server's time. Plans' event fields are server-owned. Seed users come from conftest, plus a committee member, a
treasurer, a parent who is the trip lead and a Scout quartermaster."""

from datetime import UTC, datetime

from .conftest import FUTURE, T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)
PLAN = f"{T}/eventPlans/p1"
OPTION = f"{PLAN}/options/o1"
STAMPED = ["createdAt", "availability.at"]

owner = Client("owner")
leader, chair, counselor, parent, scout1 = (Client(u) for u in ("leader", "chair", "counselor", "parent", "scout1"))
committee, treasurer, lead, scoutqm = (Client(u) for u in ("committee", "treasurer", "triplead", "scoutqm"))
stranger = Client("someone-else")


def seed(trip_lead: str | None = "triplead"):
    for uid, doc in {
        "committee": {"memberId": "m-com", "roles": ["committee"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "treasurer": {"memberId": "m-tre", "roles": ["treasurer"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "triplead": {"memberId": "m-lead", "roles": ["parent"], "scoutIds": ["s2"], "yptExpiresAt": FUTURE},
        "scoutqm": {"memberId": "s2", "roles": ["scout", "quartermaster"], "scoutIds": ["s2"]},
    }.items():
        owner.set(f"{T}/access/{uid}", doc)
    owner.set(PLAN, {"title": "Fall campout", "status": "draft", "tripLeadUid": trip_lead})
    owner.set(f"{PLAN}/milestones/m1", {"title": "Reserve the site", "dueOn": "2026-10-01"})
    owner.set(f"{PLAN}/acks/two_deep", {"note": "Second adult from the district", "byMemberId": "m-leader"})
    owner.set(f"{PLAN}/private/adult", {"contacts": "Ranger: 555-0100"})
    owner.set(OPTION, option("m-leader", at=NOW))
    owner.set(f"{T}/planSummaries/p1", {"title": "Fall campout", "familyNotes": "Bring a mess kit"})


def option(member_id: str, at=None, **over) -> dict:
    """A research card. Without `at`, the stamped fields are left for set_stamped to fill with the server's time."""
    availability = {"state": "unknown", "byMemberId": member_id, "note": ""}
    body = {"name": "Pine Lake", "links": ["https://example.org"], "costCents": 1500, "pinned": False}
    body |= {"availability": availability, "createdByMemberId": member_id}
    if at is not None:
        body["availability"] = {**availability, "at": at}
        body["createdAt"] = at
    return {**body, **over}


def test_planners_the_trip_lead_and_the_treasurer_read_a_plan_and_everything_under_it():
    seed()
    for who in (leader, chair, committee, treasurer, lead):
        for path in (PLAN, OPTION, f"{PLAN}/milestones/m1", f"{PLAN}/acks/two_deep", f"{PLAN}/private/adult"):
            assert who.get(path) == OK, path


def test_families_counselors_scouts_and_the_scout_quartermaster_read_nothing():
    seed()
    for who in (parent, counselor, scout1, scoutqm, stranger):
        for path in (PLAN, OPTION, f"{PLAN}/milestones/m1", f"{PLAN}/private/adult"):
            assert who.get(path) == DENIED, path


def test_a_cleared_trip_lead_loses_access_straight_away():
    seed(trip_lead=None)
    assert lead.get(PLAN) == DENIED
    assert lead.get(OPTION) == DENIED


def test_a_committee_member_who_loses_the_role_loses_access():
    seed()
    owner.set(f"{T}/access/committee", {"memberId": "m-com", "roles": ["parent"], "scoutIds": []})
    assert committee.get(PLAN) == DENIED


def test_no_client_writes_a_plan_or_its_milestones_acks_or_private_panel():
    seed()
    server_only = (PLAN, f"{PLAN}/milestones/m2", f"{PLAN}/acks/transport", f"{PLAN}/private/adult")
    for path in (*server_only, f"{T}/planSummaries/p1"):
        assert leader.set(path, {"title": "x"}) == DENIED, path
    assert leader.delete(PLAN) == DENIED


def test_planners_and_the_trip_lead_add_research_cards_with_the_server_time():
    seed()
    assert leader.set_stamped(f"{PLAN}/options/a", option("m-leader"), STAMPED) == OK
    assert committee.set_stamped(f"{PLAN}/options/b", option("m-com"), STAMPED) == OK
    assert lead.set_stamped(f"{PLAN}/options/c", option("m-lead"), STAMPED) == OK
    assert treasurer.set_stamped(f"{PLAN}/options/d", option("m-tre"), STAMPED) == DENIED
    assert parent.set_stamped(f"{PLAN}/options/e", option("m-parent"), STAMPED) == DENIED


def test_a_research_card_must_name_its_author_and_use_the_server_time():
    seed()
    assert leader.set_stamped(f"{PLAN}/options/a", option("m-com"), STAMPED) == DENIED  # someone else's name
    assert leader.set(f"{PLAN}/options/b", option("m-leader", at=datetime(2020, 1, 1, tzinfo=UTC))) == DENIED


def test_research_cards_are_checked():
    seed()
    for bad in (
        {"name": ""},
        {"name": "x" * 121},
        {"links": ["a", "b", "c", "d", "e", "f"]},
        {"costCents": -1},
        {"costCents": 12.5},
        {"pinned": "yes"},
        {"availability": {"state": "maybe", "byMemberId": "m-leader", "note": ""}},
        {"secret": "nope"},
        {"bookingOpens": {"date": "soon"}},
    ):
        assert leader.set_stamped(f"{PLAN}/options/x", option("m-leader", **bad), STAMPED) == DENIED, bad


def test_editing_a_card_keeps_its_author_and_restamps_availability_only_when_it_changes():
    seed()
    current = option("m-leader", at=NOW)
    assert committee.set(OPTION, {**current, "pinned": True}) == OK  # availability unchanged
    changed = {**current, "availability": {"state": "held", "byMemberId": "m-com", "note": "Held until Friday"}}
    changed.pop("createdAt")
    with_created = {**changed, "createdAt": NOW}
    assert committee.set(OPTION, {**with_created, "availability": {**changed["availability"], "at": NOW}}) == DENIED
    assert committee.set_stamped(OPTION, with_created, ["availability.at"]) == OK
    assert committee.set(OPTION, {**current, "pinned": True, "createdByMemberId": "m-com"}) == DENIED


def test_members_read_a_plan_summary_but_strangers_do_not():
    seed()
    assert parent.get(f"{T}/planSummaries/p1") == OK
    assert scout1.get(f"{T}/planSummaries/p1") == OK
    assert stranger.get(f"{T}/planSummaries/p1") == DENIED


def test_leaders_cannot_set_or_change_an_events_plan_link():
    base = {"title": "Campout", "start": "2026-11-13"}
    assert leader.create(f"{T}/events/new", {**base, "planId": "p1"}) == DENIED
    assert leader.create(f"{T}/events/new2", {**base, "planSegmentId": "s1"}) == DENIED
    owner.set(f"{T}/events/e1", {**base, "planId": "p1", "planSegmentId": "s1"})
    assert leader.set(f"{T}/events/e1", {**base, "planId": "p2", "planSegmentId": "s1"}) == DENIED
    assert leader.set(f"{T}/events/e1", {**base, "planSegmentId": "s1"}) == DENIED  # removing it is a change too
    assert leader.set(f"{T}/events/e1", {**base, "place": "Pine Lake", "planId": "p1", "planSegmentId": "s1"}) == OK

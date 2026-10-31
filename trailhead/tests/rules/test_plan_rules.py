"""Event plans: planners (leaders and committee), the plan's trip lead, the treasurer and Scouts who sign in read a
plan; only the plan_action function writes a plan and everything under it, research cards included. Scouts never
read the adult-only panel. Plans' event fields are server-owned. Seed users come from conftest, plus a committee
member, a treasurer, a parent who is the trip lead and a Scout who is also the quartermaster."""

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


def test_scouts_read_plans_cards_and_milestones_but_never_the_adult_panel():
    seed()
    for who in (scout1, scoutqm):
        for path in (PLAN, OPTION, f"{PLAN}/milestones/m1", f"{PLAN}/acks/two_deep"):
            assert who.get(path) == OK, path
        assert who.get(f"{PLAN}/private/adult") == DENIED


def test_families_counselors_and_strangers_read_nothing():
    seed()
    for who in (parent, counselor, stranger):
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


def test_no_client_writes_a_plan_or_anything_under_it():
    seed()
    server_only = (PLAN, OPTION, f"{PLAN}/options/new", f"{PLAN}/milestones/m2", f"{PLAN}/acks/transport")
    for path in (*server_only, f"{PLAN}/private/adult", f"{T}/planSummaries/p1"):
        for who in (leader, committee, lead, scout1):
            assert who.set(path, {"title": "x"}) == DENIED, path
    assert leader.set_stamped(f"{PLAN}/options/a", option("m-leader"), STAMPED) == DENIED
    assert leader.delete(OPTION) == DENIED and scout1.delete(OPTION) == DENIED
    assert leader.delete(PLAN) == DENIED


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


def test_no_client_reads_or_writes_the_troops_saved_location():
    owner.set(f"{T}/planning/home", {"address": "12 Elm St", "lat": 39.78, "lng": -89.65})
    assert leader.get(f"{T}/planning/home") == DENIED
    assert leader.set(f"{T}/planning/home", {"lat": 0.0}) == DENIED

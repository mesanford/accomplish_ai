"""Patrols and activity credits. Seed users come from conftest: leader (Scoutmaster), assistant (leader), chair,
counselor, parent (linked to s1) and scout1 (s1). s2 has no login and no parent on the app."""

import pytest

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403

owner = Client("owner")
leader, assistant, chair = Client("leader"), Client("assistant"), Client("chair")
counselor, parent, scout1 = Client("counselor"), Client("parent"), Client("scout1")
stranger = Client("someone-else")


def credit(scout: str, **over) -> dict:
    base = {
        "scoutId": scout,
        "eventId": "e1",
        "date": "2026-10-10",
        "source": "event",
        "status": "approved",
        "kind": "campout",
        "nights": 2,
        "serviceHours": 0,
        "miles": 0,
    }
    return {**base, **over}


@pytest.fixture(autouse=True)
def seed(troop):
    owner.set(f"{T}/logs/e1_s1", credit("s1"))
    owner.set(f"{T}/logs/e1_s2", credit("s2"))
    owner.set(f"{T}/logs/m1", credit("s1", source="manual", status="pending", eventId=None))
    owner.set(f"{T}/patrols/p1", {"name": "Eagles", "leaderId": "s1", "assistantId": None})


def test_leaders_read_every_credit():
    for who in (leader, assistant, chair):
        assert who.get(f"{T}/logs/e1_s1") == OK
        assert who.get(f"{T}/logs/e1_s2") == OK


def test_a_family_and_a_scout_read_only_their_own_credits():
    for who in (parent, scout1):
        assert who.get(f"{T}/logs/e1_s1") == OK
        assert who.get(f"{T}/logs/m1") == OK  # including an entry still waiting for a leader
        assert who.get(f"{T}/logs/e1_s2") == DENIED


def test_others_read_no_credits():
    for who in (counselor, stranger):
        assert who.get(f"{T}/logs/e1_s1") == DENIED


@pytest.mark.parametrize("who", [leader, assistant, chair, parent, scout1, counselor])
def test_no_client_writes_a_credit(who):
    assert who.set(f"{T}/logs/e1_s1", credit("s1", nights=20)) == DENIED
    assert who.create(f"{T}/logs/new", credit("s1", source="manual")) == DENIED
    assert who.set(f"{T}/logs/m1", credit("s1", status="approved")) == DENIED
    assert who.delete(f"{T}/logs/e1_s1") == DENIED
    assert who.delete(f"{T}/logs/m1") == DENIED


def test_everyone_in_the_troop_reads_patrols_and_nobody_writes_them():
    for who in (leader, parent, scout1, counselor):
        assert who.get(f"{T}/patrols/p1") == OK
    assert stranger.get(f"{T}/patrols/p1") == DENIED
    for who in (leader, assistant, chair, parent, scout1):
        assert who.set(f"{T}/patrols/p1", {"name": "Owls"}) == DENIED
        assert who.create(f"{T}/patrols/p2", {"name": "Owls"}) == DENIED
        assert who.delete(f"{T}/patrols/p1") == DENIED


def test_a_leader_cannot_put_a_scout_in_a_patrol_from_the_client():
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrolId": "p1"}) == DENIED
    assert leader.create(f"{T}/members/s9", {"kind": "scout", "displayName": "Max", "patrolId": "p1"}) == DENIED
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Samuel"}) == OK  # other edits still work


def test_a_leader_cannot_move_or_clear_a_scouts_patrol_from_the_client():
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrolId": "p1"})
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrolId": "p2"}) == DENIED
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam"}) == DENIED
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrolId": "p1"}) == OK  # unchanged


def test_any_troop_member_still_reads_members_with_their_patrol():
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrolId": "p1"})
    for who in (parent, scout1, counselor):
        assert who.get(f"{T}/members/s1") == OK


def test_leaders_set_an_events_activity_log_fields():
    body = {"title": "Campout", "start": "2026-10-10", "logKind": "campout", "logValues": {"nights": 2, "miles": 3.5}}
    for who in (leader, assistant, chair):
        assert who.set(f"{T}/events/log-{id(who)}", body) == OK
    assert parent.set(f"{T}/events/nope", body) == DENIED
    assert counselor.set(f"{T}/events/nope", body) == DENIED


@pytest.mark.parametrize(
    "fields",
    [
        {"logKind": "party"},
        {"logValues": {"nights": -1}},
        {"logValues": {"nights": 61}},
        {"logValues": {"serviceHours": 1001}},
        {"logValues": {"miles": 2001}},
        {"logValues": {"nights": "two"}},
        {"logValues": {"nights": 1, "extra": 1}},
        {"logValues": "lots"},
    ],
)
def test_bad_activity_log_fields_are_refused(fields):
    assert leader.set(f"{T}/events/bad", {"title": "Campout", "start": "2026-10-10", **fields}) == DENIED
    owner.set(f"{T}/events/e1", {"title": "Campout", "start": "2026-10-10"})
    assert leader.set(f"{T}/events/e1", {"title": "Campout", "start": "2026-10-10", **fields}) == DENIED

"""Health form dates and Youth Protection reminder records. Seed users come from conftest: leader (Scoutmaster),
assistant (leader), chair, counselor, parent (linked to s1) and scout1 (s1). m-leader, m-asst, m-chair, m-mbc and
m-parent have no member documents in the seed, so these tests add the ones they need."""

from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
owner = Client("owner")
leader, assistant, counselor = Client("leader"), Client("assistant"), Client("counselor")
parent, scout1, stranger = Client("parent"), Client("scout1"), Client("someone-else")
FORM = {"partsAB": {"date": "2026-09-01", "byMemberId": "m-parent", "at": datetime(2026, 9, 2, tzinfo=UTC)}}


def seed():
    for member in ("m-parent", "m-asst", "m-mbc"):
        owner.set(f"{T}/members/{member}", {"kind": "adult", "displayName": member})
    for member in ("s1", "s2", "m-parent", "m-asst", "m-mbc"):
        owner.set(f"{T}/healthForms/{member}", FORM)


def test_leaders_read_everyones_health_form_dates():
    seed()
    for who in (leader, assistant):
        for member in ("s1", "s2", "m-parent", "m-mbc"):
            assert who.get(f"{T}/healthForms/{member}") == OK


def test_a_parent_reads_only_their_own_and_their_scouts_dates():
    seed()
    assert parent.get(f"{T}/healthForms/s1") == OK
    assert parent.get(f"{T}/healthForms/m-parent") == OK
    assert parent.get(f"{T}/healthForms/s2") == DENIED  # someone else's Scout
    assert parent.get(f"{T}/healthForms/m-asst") == DENIED


def test_a_scout_reads_their_own_dates_but_not_another_scouts():
    seed()
    assert scout1.get(f"{T}/healthForms/s1") == OK
    assert scout1.get(f"{T}/healthForms/s2") == DENIED


def test_counselors_and_strangers_read_nobody_elses_dates():
    seed()
    assert counselor.get(f"{T}/healthForms/s1") == DENIED
    assert counselor.get(f"{T}/healthForms/m-mbc") == OK  # their own
    assert stranger.get(f"{T}/healthForms/s1") == DENIED
    assert Client(None).get(f"{T}/healthForms/s1") == DENIED


def test_a_pending_parent_link_does_not_open_a_scouts_dates():
    owner.set(
        f"{T}/access/parent",
        {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s1"]},
    )
    seed()
    assert parent.get(f"{T}/healthForms/s1") == DENIED


def test_no_client_writes_health_form_dates():
    """Dates are written only by record_health_form, which stamps who recorded them and when."""
    seed()
    mine = {"partsAB": {"date": "2026-10-01", "byMemberId": "m-leader", "at": datetime.now(UTC)}}
    for who in (leader, assistant, parent, scout1, counselor, stranger):
        assert who.set(f"{T}/healthForms/s1", mine) == DENIED
        assert who.set(f"{T}/healthForms/s9", mine) == DENIED
        assert who.create(f"{T}/healthForms/s8", mine) == DENIED
        assert who.delete(f"{T}/healthForms/s1") == DENIED


def test_health_forms_for_someone_not_on_the_roster_are_not_readable():
    owner.set(f"{T}/healthForms/ghost", FORM)
    assert leader.get(f"{T}/healthForms/ghost") == DENIED


def test_no_client_reads_or_writes_youth_protection_reminder_records():
    owner.set(f"{T}/yptReminders/m-asst", {"expiresOn": "2026-12-01", "sent": ["30"]})
    owner.set(f"{T}/yptReminders/_weekly", {"weekOf": "2026-10-12"})
    record = {"expiresOn": "2030-01-01", "sent": []}
    for who in (leader, assistant, parent, scout1, counselor, stranger):
        for doc in ("m-asst", "_weekly", "m-new"):
            assert who.get(f"{T}/yptReminders/{doc}") == DENIED
            assert who.set(f"{T}/yptReminders/{doc}", record) == DENIED
            assert who.delete(f"{T}/yptReminders/{doc}") == DENIED


def test_leaders_set_an_events_health_form_requirement_and_others_cannot():
    owner.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01"})
    assert leader.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "healthForm": "abc"}) == OK
    assert leader.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "healthForm": "ab"}) == OK
    assert leader.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "healthForm": "everything"}) == DENIED
    assert leader.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "healthForm": True}) == DENIED
    assert parent.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "healthForm": "ab"}) == DENIED


def test_no_client_writes_training_dates_directly():
    """yptExpiresAt, yptUpdatedBy and yptUpdatedAt change only through set_my_ypt and set_member_roles."""
    owner.set(f"{T}/members/m-asst", {"kind": "adult", "displayName": "Asst", "roles": ["leader"]})
    soon = datetime(2027, 1, 1, tzinfo=UTC)
    for field, value in (("yptExpiresAt", soon), ("yptUpdatedBy", "self"), ("yptUpdatedAt", soon)):
        member = {"kind": "adult", "displayName": "Asst", "roles": ["leader"], field: value}
        assert leader.set(f"{T}/members/m-asst", member) == DENIED  # even a leader
        assert assistant.set(f"{T}/members/m-asst", member) == DENIED  # even the adult themselves
        assert leader.create(f"{T}/members/m-new", member) == DENIED
        assert (
            assistant.set(f"{T}/access/assistant", {"memberId": "m-asst", "roles": ["leader"], field: value}) == DENIED
        )
    assert leader.set(f"{T}/members/m-asst", {"kind": "adult", "displayName": "Asst B.", "roles": ["leader"]}) == OK


def test_only_leaders_can_list_every_health_form():
    # The Roster lists them all; a refused list query breaks the browser's Firestore client, so this must be allowed.
    seed()
    for who in (leader, assistant, Client("chair")):
        assert who.get(f"{T}/healthForms") == OK
    for who in (parent, scout1, counselor, stranger):
        assert who.get(f"{T}/healthForms") == DENIED

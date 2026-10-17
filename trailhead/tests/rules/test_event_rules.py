"""Event sign-ups: the server owns every status field, only leaders read health notes and fee status, and families
see only their own Scouts' sign-ups. Seed users come from conftest: leader (Scoutmaster), assistant (leader), chair,
counselor, parent (linked to s1) and scout1 (s1)."""

from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)
EVENT = f"{T}/events/e1"
CONFIG = {"enabled": True, "audience": "both", "capacity": 10, "needsPermission": True, "questions": []}

owner = Client("owner")
leader, assistant, chair = Client("leader"), Client("assistant"), Client("chair")
counselor, parent, scout1 = Client("counselor"), Client("parent"), Client("scout1")
stranger = Client("someone-else")


def signup(member_id: str, **over) -> dict:
    base = {
        "memberId": member_id,
        "kind": "scout",
        "spot": "held",
        "status": "waiting_permission",
        "permission": {"state": "pending"},
        "answers": {},
        "signedUpAt": NOW,
    }
    return {**base, **over}


def seed():
    owner.set(EVENT, {"title": "Campout", "start": "2026-10-17", "signups": CONFIG})
    owner.set(f"{EVENT}/signups/s1", signup("s1"))
    owner.set(f"{EVENT}/signups/s2", signup("s2"))
    owner.set(f"{EVENT}/signupNotes/s1", {"note": "Asthma. Inhaler in the blue bag."})
    owner.set(f"{EVENT}/feeStatus/s1", {"state": "pending", "amountCents": 2500})


def test_leaders_set_the_sign_up_options_and_fee():
    for who in (leader, assistant, chair):
        body = {"title": "Hike", "start": "2026-11-01", "feeCents": 1500, "signups": CONFIG, "startTime": "09:00"}
        assert who.set(f"{T}/events/new-{id(who)}", body) == OK
    assert parent.set(f"{T}/events/nope", {"title": "Hike", "start": "2026-11-01"}) == DENIED
    assert counselor.set(f"{T}/events/nope", {"title": "Hike", "start": "2026-11-01"}) == DENIED


def test_a_leader_cannot_write_the_fields_the_server_owns_when_making_an_event():
    for field, value in (
        ("signupCounts", {"held": 0, "going": 0, "waitingPermission": 0, "waitlist": 0}),
        ("feesPending", {"count": 3, "amountCents": 100}),
        ("feesPosted", {"count": 3, "amountCents": 100}),
        ("reminderSentFor", "2026-10-17"),
    ):
        assert leader.create(f"{T}/events/x-{field}", {"title": "Hike", "start": "2026-11-01", field: value}) == DENIED


def test_a_leader_cannot_change_the_fields_the_server_owns_on_an_existing_event():
    seed()
    owner.set(EVENT, {"title": "Campout", "start": "2026-10-17", "signups": CONFIG, "signupCounts": {"held": 1}})
    base = {"title": "Campout", "start": "2026-10-17", "signups": CONFIG}
    assert leader.set(EVENT, {**base, "signupCounts": {"held": 99}}) == DENIED
    assert leader.set(EVENT, base) == DENIED  # dropping signupCounts is a change to it too
    assert leader.set(EVENT, {**base, "signupCounts": {"held": 1}, "feesPending": {"count": 1}}) == DENIED
    assert leader.set(EVENT, {**base, "signupCounts": {"held": 1}, "title": "Renamed"}) == OK
    assert leader.set(EVENT, {**base, "signupCounts": {"held": 1}, "reminderSentFor": "2026-10-17"}) == DENIED


def test_settings_are_size_limited():
    seed()
    seven = [{"id": f"q{n}", "label": "x", "type": "text"} for n in range(7)]
    assert leader.set(EVENT, {"title": "C", "start": "2026-10-17", "signups": {**CONFIG, "questions": seven}}) == DENIED
    assert leader.set(EVENT, {"title": "C", "start": "2026-10-17", "feeCents": -1}) == DENIED
    assert leader.set(EVENT, {"title": "C", "start": "2026-10-17", "feeCents": "25"}) == DENIED


def test_no_client_can_write_a_sign_up_even_for_their_own_scout():
    seed()
    path = f"{EVENT}/signups/s1"
    approved = signup("s1", status="going", permission={"state": "approved", "byMemberId": "m-parent"})
    for who in (leader, assistant, chair, parent, scout1, counselor, stranger):
        assert who.set(path, approved) == DENIED
        assert who.create(f"{EVENT}/signups/s9", signup("s9")) == DENIED
        assert who.delete(path) == DENIED


def test_no_client_can_record_a_paper_permission_slip_directly():
    # Only the record_paper_permission function writes "paper" permission, after checking the caller is a leader.
    seed()
    path = f"{EVENT}/signups/s1"
    paper = signup("s1", status="going", permission={"state": "approved", "method": "paper", "byMemberId": "m-leader"})
    for who in (leader, assistant, chair, parent, scout1, counselor, stranger):
        assert who.set(path, paper) == DENIED


def test_a_family_cannot_approve_permission_or_jump_the_waitlist_itself():
    seed()
    path = f"{EVENT}/signups/s1"
    assert parent.set(path, signup("s1", permission={"state": "approved"}, status="going")) == DENIED
    assert parent.set(path, signup("s1", spot="held", status="going")) == DENIED
    assert scout1.set(path, signup("s1", permission={"state": "approved"}, status="going")) == DENIED


def test_leaders_read_every_sign_up_and_families_only_their_own_scouts():
    seed()
    for who in (leader, assistant, chair):
        assert who.get(f"{EVENT}/signups/s1") == OK and who.get(f"{EVENT}/signups/s2") == OK
    assert parent.get(f"{EVENT}/signups/s1") == OK
    assert parent.get(f"{EVENT}/signups/s2") == DENIED  # another family's Scout
    assert scout1.get(f"{EVENT}/signups/s1") == OK
    assert scout1.get(f"{EVENT}/signups/s2") == DENIED
    assert counselor.get(f"{EVENT}/signups/s1") == DENIED
    assert stranger.get(f"{EVENT}/signups/s1") == DENIED


def test_an_adult_reads_their_own_sign_up_only():
    seed()
    owner.set(
        f"{EVENT}/signups/m-mbc", signup("m-mbc", kind="adult", permission={"state": "not_needed"}, status="going")
    )
    assert counselor.get(f"{EVENT}/signups/m-mbc") == OK
    assert parent.get(f"{EVENT}/signups/m-mbc") == DENIED


def test_only_leaders_read_health_notes_and_nobody_writes_them():
    seed()
    path = f"{EVENT}/signupNotes/s1"
    for who in (leader, assistant, chair):
        assert who.get(path) == OK
    for who in (parent, scout1, counselor, stranger):
        assert who.get(path) == DENIED
    for who in (leader, parent, scout1):
        assert who.set(path, {"note": "changed"}) == DENIED
        assert who.delete(path) == DENIED


def test_only_leaders_read_fee_status_and_nobody_writes_it():
    seed()
    path = f"{EVENT}/feeStatus/s1"
    assert leader.get(path) == OK and chair.get(path) == OK
    assert parent.get(path) == DENIED and scout1.get(path) == DENIED
    assert leader.set(path, {"state": "posted"}) == DENIED
    assert parent.delete(path) == DENIED


def test_earlier_rsvps_still_work_as_before():
    seed()
    path = f"{EVENT}/rsvps/s1"
    assert parent.set(path, {"going": True}) == OK
    assert scout1.set(path, {"going": False}) == OK
    assert parent.set(f"{EVENT}/rsvps/s2", {"going": True}) == DENIED
    assert leader.set(f"{EVENT}/rsvps/s2", {"going": True}) == OK
    assert counselor.get(path) == OK


def test_calendar_feed_tokens_are_never_readable_or_writable_by_clients():
    owner.set(f"{T}/calendarTokens/leader", {"token": "secret"})
    owner.set("calendarFeeds/secret", {"troopId": "t1", "uid": "leader"})
    for who in (leader, parent, scout1, stranger):
        assert who.get(f"{T}/calendarTokens/leader") == DENIED
        assert who.get("calendarFeeds/secret") == DENIED
        assert who.set(f"{T}/calendarTokens/{id(who)}", {"token": "mine"}) == DENIED
        assert who.set("calendarFeeds/mine", {"troopId": "t1", "uid": "x"}) == DENIED

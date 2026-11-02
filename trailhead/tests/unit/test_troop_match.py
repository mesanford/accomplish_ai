from datetime import UTC, date, datetime

import pytest

from handlers import join_emails
from handlers.membership import InvalidInput
from handlers.troop_match import (
    MAX_MATCHES,
    approved_member,
    delete_blocker,
    match_keys,
    matching,
    new_join_request,
    unit_key,
)

TODAY = date(2026, 11, 2)
YPT = datetime(2027, 6, 30, 23, 59, tzinfo=UTC)


@pytest.mark.parametrize(
    ("unit", "key"),
    [("1107", "1107"), ("1107F", "1107"), ("Troop 0045", "45"), (" 7 ", "7"), ("", None), ("T", None), (None, None)],
)
def test_unit_key_is_the_number_without_zeros_or_letters(unit, key):
    assert unit_key(unit) == key


def test_match_keys_use_the_council_calendar_council_key():
    assert match_keys({"unitNumber": "1107F", "council": "Bay-Lakes Council"}) == {
        "unitKey": "1107",
        "councilKey": "bay-lakes",
    }
    assert match_keys({"unitNumber": "1107", "council": "Bay Lakes"})["councilKey"] == "bay-lakes"
    assert match_keys({"unitNumber": "", "council": ""}) == {"unitKey": None, "councilKey": None}


def troop(name, unit, council, **extra):
    return {
        "name": name,
        "unitNumber": unit,
        "council": council,
        **match_keys({"unitNumber": unit, "council": council}),
        **extra,
    }


def test_matching_keeps_troops_in_the_same_council_and_shows_only_public_fields():
    candidates = {
        "a": troop("Troop 1107", "1107", "Bay Lakes", district="Fox River", createdBy="uid-secret"),
        "b": troop("Scouting America Troop 1107", "1107F", "Bay-Lakes"),
        "c": troop("Troop 1107", "1107", "Three Fires"),
        "d": troop("Old 1107", "1107", "Bay Lakes", retiredAt=YPT),
    }
    found = matching(candidates, "Bay-Lakes Council")
    assert [t["troopId"] for t in found] == ["a", "b"]  # 1107 before 1107F
    assert found[0] == {
        "troopId": "a",
        "name": "Troop 1107",
        "unitNumber": "1107",
        "council": "Bay Lakes",
        "district": "Fox River",
    }


def test_a_troop_without_a_council_is_offered_in_any_council():
    candidates = {"a": troop("Troop 9", "9", ""), "b": troop("Troop 9", "9", "Pine")}
    assert [t["troopId"] for t in matching(candidates, "Oak")] == ["a"]
    assert [t["troopId"] for t in matching(candidates, "")] == ["a"]


def test_matching_is_capped():
    candidates = {f"t{i:02d}": troop(f"Troop 1 #{i:02d}", "1", "") for i in range(MAX_MATCHES + 5)}
    assert len(matching(candidates, "Pine")) == MAX_MATCHES


def test_join_request_holds_name_role_and_training():
    data = {"displayName": " Robin Leader ", "creatorRole": "committee_member", "yptExpiresAt": "2027-06-30"}
    request = new_join_request(data, "u1", "robin@example.test", TODAY)
    assert request == {
        "uid": "u1",
        "displayName": "Robin Leader",
        "email": "robin@example.test",
        "creatorRole": "committee_member",
        "yptExpiresAt": YPT,
    }


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ({"displayName": "Robin", "creatorRole": "king", "yptExpiresAt": "2027-06-30"}, "Pick your role"),
        ({"displayName": "", "creatorRole": "leader", "yptExpiresAt": "2027-06-30"}, "Your name"),
        ({"displayName": "Robin", "creatorRole": "leader", "yptExpiresAt": ""}, "Youth Protection"),
        ({"displayName": "Robin", "creatorRole": "leader", "yptExpiresAt": "2025-01-01"}, "expired"),
    ],
)
def test_join_request_is_checked_like_the_create_form(data, message):
    with pytest.raises(InvalidInput, match=message):
        new_join_request(data, "u1", None, TODAY)


def test_approval_uses_the_role_asked_for_unless_the_leader_picks_another():
    request = {"uid": "u1", "displayName": "Robin", "creatorRole": "scoutmaster", "yptExpiresAt": YPT}
    member = approved_member(request, None, TODAY)
    assert member == {
        "kind": "adult",
        "displayName": "Robin",
        "uid": "u1",
        "roles": ["leader", "scoutmaster"],
        "yptExpiresAt": YPT,
    }
    assert approved_member(request, "committee_member", TODAY)["roles"] == ["leader", "committee"]
    with pytest.raises(InvalidInput, match="Pick a role"):
        approved_member(request, "king", TODAY)


def test_approval_checks_training_again():
    request = {"uid": "u1", "displayName": "Robin", "creatorRole": "leader", "yptExpiresAt": YPT}
    with pytest.raises(InvalidInput, match="expired or is missing"):
        approved_member(request, None, date(2027, 7, 1))


ME = {"kind": "adult", "uid": "me"}


@pytest.mark.parametrize(
    ("logins", "members", "ledger", "message"),
    [
        (["me"], [ME], 0, None),
        (["me"], [ME, {"kind": "scout"}], 0, "Scouts on its roster"),
        (["me", "you"], [ME], 0, "Other people"),
        (["me"], [ME, {"kind": "adult", "uid": None}], 0, "Other people"),
        (["me"], [ME], 3, "Scout account records"),
    ],
)
def test_only_a_troop_nobody_else_uses_can_be_deleted(logins, members, ledger, message):
    blocker = delete_blocker("me", logins, members, ledger)
    assert (blocker is None) if message is None else (message in blocker)


def test_join_emails_name_the_troop_and_link_to_the_right_place():
    asked = join_emails.join_requested("Robin", "Troop 1107", "t1", "https://app.test")
    assert asked.subject == "Robin asked to join Troop 1107"
    assert "https://app.test/t/t1/roster" in asked.text
    assert "https://app.test/t/t1" in join_emails.join_approved("Troop 1107", "t1", "https://app.test").text
    declined = join_emails.join_declined("Troop 1107", "https://app.test")
    assert "didn't approve" in declined.text and "Account page" not in declined.text
    note = join_emails.join_requested_note("Robin", "t1")
    assert note.path == "/t/t1/roster" and note.kind == "membership"

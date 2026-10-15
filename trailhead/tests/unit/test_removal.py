from handlers.account import is_last_leader, last_leader_message, plan_contacts
from handlers.removal import (
    BATCH_SIZE,
    card_folder,
    chunked,
    plan_access,
    plan_draft_gallery,
    plan_exports,
    plan_invites,
    plan_threads,
    usage_ids,
)


def test_chunked_keeps_every_batch_under_the_firestore_limit():
    parts = chunked(list(range(1250)))
    assert [len(p) for p in parts] == [BATCH_SIZE, BATCH_SIZE, BATCH_SIZE, 50]
    assert BATCH_SIZE < 500
    assert sum(parts, []) == list(range(1250))
    assert chunked([]) == []


def test_card_folder_matches_the_storage_rules_path():
    assert card_folder("t1", "s1") == "cards/t1/s1/"


def test_access_the_scouts_own_login_goes_and_parents_keep_their_other_children():
    access = {
        "scoutUid": {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]},
        "mom": {"memberId": "m1", "roles": ["parent"], "scoutIds": ["s1", "s2"]},
        "dad": {"memberId": "m2", "roles": ["parent"], "scoutIds": ["s2"]},
        "lead": {"memberId": "m3", "roles": ["leader"], "scoutIds": []},
    }
    plan = plan_access("s1", access)
    assert plan.delete_uids == ["scoutUid"]
    assert plan.new_scout_ids == {"mom": ["s2"]}


def test_a_parent_with_only_this_scout_keeps_a_login_with_no_scouts():
    plan = plan_access("s1", {"mom": {"memberId": "m1", "roles": ["parent"], "scoutIds": ["s1"]}})
    assert plan.delete_uids == [] and plan.new_scout_ids == {"mom": []}


def test_invites():
    invites = {
        "scout-invite": {"role": "scout", "scoutMemberId": "s1"},
        "only-s1": {"role": "parent", "scoutIds": ["s1"]},
        "both": {"role": "parent", "scoutIds": ["s1", "s2"]},
        "website-family": {"role": "parent", "scoutIds": ["s1"], "leadId": "L1"},
        "other": {"role": "parent", "scoutIds": ["s2"]},
        "leader": {"role": "leader"},
    }
    drop, trim = plan_invites("s1", invites)
    assert sorted(drop) == ["only-s1", "scout-invite"]
    assert trim == {"both": ["s2"], "website-family": []}


def test_threads_drop_the_scout_and_their_login_but_leave_messages_alone():
    threads = {
        "a": {
            "memberIds": ["s1", "m1", "m2"],
            "participantUids": ["scoutUid", "mom", "lead"],
            "yptAddedMemberIds": ["m2"],
        },
        "b": {"memberIds": ["s2", "m1"], "participantUids": ["mom"]},
        "c": {"memberIds": ["s1", "m1"], "participantUids": ["mom"]},  # an under-13 Scout has no login
    }
    updates = plan_threads("s1", "scoutUid", threads)
    assert set(updates) == {"a", "c"}
    assert updates["a"] == {
        "memberIds": ["m1", "m2"],
        "participantUids": ["mom", "lead"],
        "yptAddedMemberIds": ["m2"],
    }
    assert updates["c"]["memberIds"] == ["m1"] and updates["c"]["participantUids"] == ["mom"]


def test_thread_planning_works_for_an_adult_too():
    threads = {"a": {"memberIds": ["s1", "m1"], "participantUids": ["mom"], "yptAddedMemberIds": ["m1"]}}
    assert plan_threads("m1", "mom", threads)["a"] == {
        "memberIds": ["s1"],
        "participantUids": [],
        "yptAddedMemberIds": [],
    }


def test_draft_gallery_removes_photos_of_only_this_scout():
    draft = {
        "theme": {"logoPath": "sites/t/draft/logo.png"},
        "cover": {"photoPath": "sites/t/draft/solo.png"},
        "gallery": [
            {"path": "sites/t/draft/solo.png", "scoutIds": ["s1"], "noScoutsShown": False},
            {"path": "sites/t/draft/only.png", "scoutIds": ["s1"], "noScoutsShown": False},
            {"path": "sites/t/draft/group.png", "scoutIds": ["s1", "s2"], "noScoutsShown": False},
            {"path": "sites/t/draft/hands.png", "scoutIds": ["s1"], "noScoutsShown": True},
            {"path": "sites/t/draft/other.png", "scoutIds": ["s2"], "noScoutsShown": False},
        ],
    }
    gallery, files = plan_draft_gallery("s1", draft)
    assert files == ["sites/t/draft/only.png"]  # the cover photo is still used elsewhere
    assert [g["path"] for g in gallery] == [
        "sites/t/draft/group.png",
        "sites/t/draft/hands.png",
        "sites/t/draft/other.png",
    ]


def test_draft_gallery_unchanged_when_the_scout_is_not_in_it():
    assert plan_draft_gallery("s1", {"gallery": [{"path": "p", "scoutIds": ["s2"]}]}) == (None, [])
    assert plan_draft_gallery("s1", None) == (None, [])


def test_exports_lose_the_scouts_rows_and_empty_reports_go():
    exports = {
        "mixed": {"rows": [{"scoutId": "s1"}, {"scoutId": "s2"}], "rowCount": 2, "enteredScoutIds": ["s1", "s2"]},
        "solo": {"rows": [{"scoutId": "s1"}], "rowCount": 1, "enteredScoutIds": []},
        "untouched": {"rows": [{"scoutId": "s2"}], "rowCount": 1, "enteredScoutIds": ["s2"]},
    }
    drop, updates = plan_exports("s1", exports)
    assert drop == ["solo"]
    assert updates == {"mixed": {"rows": [{"scoutId": "s2"}], "rowCount": 1, "enteredScoutIds": ["s2"]}}


def test_usage_counters_belong_to_one_login():
    ids = ["scoutUid_2026-10-14", "about_scoutUid_2026-10-14", "leads_2026-10-14", "mom_2026-10-14"]
    assert usage_ids("scoutUid", ids) == ["scoutUid_2026-10-14", "about_scoutUid_2026-10-14"]
    assert usage_ids(None, ids) == []


def test_last_leader_is_refused_only_while_others_remain():
    leader = {"roles": ["leader"]}
    assert is_last_leader("a", leader, {}, ["s1"]) is True
    assert is_last_leader("a", leader, {}, []) is False  # nobody else left in the troop
    assert is_last_leader("a", leader, {"b": {"roles": ["advancement"]}}, ["s1"]) is False
    assert is_last_leader("a", leader, {"b": {"roles": ["parent"]}}, ["s1"]) is True
    assert is_last_leader("a", {"roles": ["parent"]}, {}, ["s1"]) is False


def test_last_leader_message_is_plain():
    assert "only leader of Troop 7" in last_leader_message("Troop 7")


def test_contacts_leave_the_draft_and_the_live_site():
    draft = {
        "contacts": [{"memberId": "m1", "role": "Scoutmaster", "email": "a@x.org"}, {"memberId": "m2", "role": "SPL"}]
    }
    public = {"contacts": [{"name": "Pat", "role": "Scoutmaster", "email": "a@x.org"}, {"name": "Lee", "role": "SPL"}]}
    new_draft, new_public = plan_contacts("m1", "Pat", draft, public)
    assert new_draft == [{"memberId": "m2", "role": "SPL"}]
    assert new_public == [{"name": "Lee", "role": "SPL"}]
    assert plan_contacts("m9", "Sam", draft, public) == (None, None)
    assert plan_contacts("m1", "Pat", draft, None) == ([{"memberId": "m2", "role": "SPL"}], None)

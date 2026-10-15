from .conftest import FUTURE, T
from .emulator import Client

OK, DENIED = 200, 403
owner = Client("owner")


def seed():
    # A leader who is also the parent of s1, and a parent a leader linked to s2 who has not yet agreed.
    owner.set(
        f"{T}/access/both",
        {"memberId": "m-both", "roles": ["leader", "parent"], "scoutIds": ["s1"], "yptExpiresAt": FUTURE},
    )
    owner.set(
        f"{T}/access/waiting",
        {
            "memberId": "m-waiting",
            "roles": ["counselor", "parent"],
            "scoutIds": ["s1", "s2"],
            "consentPendingScoutIds": ["s2"],
            "yptExpiresAt": FUTURE,
        },
    )
    owner.set(f"{T}/progress/s2_camping", {"scoutId": "s2", "awardId": "camping", "status": "in_progress"})
    owner.set(f"{T}/consents/s1", {"parentConsents": []})
    owner.set(f"{T}/consents/s2", {"parentConsents": []})


def test_a_leader_who_is_a_parent_reads_every_scout_and_still_acts_for_their_own():
    seed()
    both = Client("both")
    assert both.get(f"{T}/progress/s1_camping") == OK
    assert both.get(f"{T}/progress/s2_camping") == OK
    assert both.get(f"{T}/consents/s2") == OK


def test_a_parent_sees_a_linked_scout_only_after_agreeing_to_the_notice():
    seed()
    waiting = Client("waiting")
    assert waiting.get(f"{T}/progress/s1_camping") == OK
    assert waiting.get(f"{T}/progress/s2_camping") == DENIED
    assert waiting.get(f"{T}/consents/s2") == DENIED
    owner.set(
        f"{T}/access/waiting",
        {"memberId": "m-waiting", "roles": ["counselor", "parent"], "scoutIds": ["s1", "s2"], "yptExpiresAt": FUTURE},
    )
    assert waiting.get(f"{T}/progress/s2_camping") == OK


def test_nobody_edits_their_own_roles_or_pending_consent():
    seed()
    for uid in ("both", "waiting", "leader"):
        client = Client(uid)
        assert client.set(f"{T}/access/{uid}", {"memberId": "x", "roles": ["leader"], "scoutIds": []}) == DENIED

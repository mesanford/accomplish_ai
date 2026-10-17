"""submit_interest and invites created from a website lead, on the Functions emulator."""

import os
from datetime import UTC, datetime

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_troop, ok
from tests.rules.emulator import DOCS, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
FORM = {"name": "Jordan Lee", "email": "jordan@example.com", "scoutAge": "11", "message": "Interested!"}


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def _lead_ids(tid: str) -> list[str]:
    r = requests.get(f"{DOCS}/troops/{tid}/leads", headers={"Authorization": "Bearer owner"}, timeout=10)
    return [d["name"].rsplit("/", 1)[1] for d in r.json().get("documents", [])]


def site(tid: str, slug: str = "troop-7", open_: bool = True) -> None:
    owner.set(f"publicSites/{slug}", {"slug": slug, "troopId": tid, "recruiting": {"open": open_, "intro": "Hi"}})


def submit(slug: str, form: dict | None = None):
    return call("submit_interest", "anon", {"slug": slug, "form": form or FORM})


def test_submit_writes_a_lead_and_hides_the_troop():
    tid = new_troop("7")
    site(tid)
    result = ok(submit("troop-7"))
    assert result == {"ok": True}
    assert tid not in str(result)
    (lead,) = list_docs(f"troops/{tid}/leads")
    assert lead["name"] == "Jordan Lee"
    assert lead["status"] == "new"
    assert lead["scoutAge"] == 11
    assert lead["source"] == "website"
    today = datetime.now(UTC).date().isoformat()
    assert read(f"troops/{tid}/usage/leads_{today}")["count"] == 1


def test_closed_unknown_and_invalid_are_refused():
    tid = new_troop("7")
    site(tid, "closed", open_=False)
    site(tid)
    closed = submit("closed")
    assert closed.status_code == 400
    assert "isn't taking new families" in closed.text
    assert submit("no-such-troop").status_code == 404
    assert submit("troop-7", {**FORM, "email": "nope"}).status_code == 400
    assert list_docs(f"troops/{tid}/leads") == []


def test_honeypot_looks_like_success_but_saves_nothing():
    tid = new_troop("7")
    site(tid)
    assert ok(submit("troop-7", {**FORM, "website": "http://spam.example"})) == {"ok": True}
    assert list_docs(f"troops/{tid}/leads") == []


def test_daily_cap():
    tid = new_troop("7")
    site(tid)
    today = datetime.now(UTC).date().isoformat()
    owner.set(f"troops/{tid}/usage/leads_{today}", {"count": 30, "day": today})
    r = submit("troop-7")
    assert r.status_code == 429
    assert list_docs(f"troops/{tid}/leads") == []


def test_invite_from_a_lead_needs_no_scouts_and_marks_it():
    tid = new_troop("7")
    site(tid)
    ok(submit("troop-7"))
    lead_id = _lead_ids(tid)[0]
    plain = call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": []})
    assert plain.status_code == 400
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "leadId": lead_id}))
    lead = read(f"troops/{tid}/leads/{lead_id}")
    assert lead["status"] == "invited"
    assert lead["invitePath"] == invite["path"]
    assert call("create_invite", "lead", {"troopId": tid, "role": "leader", "leadId": lead_id}).status_code == 400
    assert call("create_invite", "lead", {"troopId": tid, "role": "parent", "leadId": "ghost"}).status_code == 400

    ok(
        call(
            "accept_invite",
            "mom",
            {
                "troopId": tid,
                "code": invite["code"],
                "displayName": "Jordan",
                "consent": True,
                "consentVersion": "2026-10-17.1",
            },
        )
    )
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == []
    assert read(f"troops/{tid}/leads/{lead_id}")["status"] == "joined"

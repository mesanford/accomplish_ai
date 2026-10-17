"""Push notifications: who is pushed, the opt-outs, text that is safe on a lock screen and dead-token cleanup."""

import logging

import pytest
from firebase_admin import messaging

from endpoints import push as sender
from handlers import push as p

FORBIDDEN = ("$", "Smith", "1/2/2012", "allerg", "peanut", "dollar")


class Snap:
    def __init__(self, id_, data):
        self.id, self._data = id_, data

    def to_dict(self):
        return self._data


class FakeDb:
    """Just enough Firestore for push_all: user documents and their devices."""

    def __init__(self, users, devices):
        self.users, self.devices, self.deleted, self.outbox = users, devices, [], []

    def collection(self, name):
        return FakeCollection(self, name)

    def get_all(self, refs):
        return [Snap(r.id, self.users.get(r.id)) for r in refs]


class FakeCollection:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def document(self, id_):
        return FakeDoc(self.db, self.name, id_)

    def add(self, data):
        self.db.outbox.append(data)


class FakeDoc:
    def __init__(self, db, collection, id_, parent=None):
        self.db, self.collection_name, self.id, self.parent = db, collection, id_, parent

    def collection(self, name):
        return FakeDevices(self.db, self.id) if name == "devices" else FakeCollection(self.db, name)


class FakeDevices:
    def __init__(self, db, uid):
        self.db, self.uid = db, uid

    def stream(self):
        return [Snap(i, {"token": t}) for i, t in self.db.devices.get(self.uid, [])]

    def document(self, id_):
        db, uid = self.db, self.uid

        class Gone:
            def delete(self):
                db.deleted.append((uid, id_))

        return Gone()


@pytest.fixture
def fake(monkeypatch):
    db = FakeDb(
        users={"mom": {}, "dad": {"emailNotifications": False}, "quiet": {"emailAnnouncements": False}, "kid": None},
        devices={
            "mom": [("m1", "tok-mom-1" * 3), ("m2", "tok-mom-2" * 3)],
            "dad": [("d1", "tok-dad" * 4)],
            "quiet": [("q1", "tok-quiet" * 3)],
            "kid": [("k1", "tok-kid" * 4)],
        },
    )
    monkeypatch.setattr(sender, "db", lambda: db)
    return db


NOTE_CARD = p.card_update("Sam", "Camping", "was approved", "s1", "t1")
NOTE_POST = p.announcement("Troop 9", "t1")
LOG = {}  # PUSH_MODE unset: log only
SEND = {"PUSH_MODE": "send", "APP_URL": "https://forthrightapp.com"}


def test_a_person_with_two_devices_gets_both_and_opt_outs_apply_per_kind(fake):
    # emailNotifications off stops blue card pushes; emailAnnouncements off stops announcement pushes, not card ones.
    assert sender.push_all("card", ["mom", "dad", "quiet"], NOTE_CARD, env=LOG) == 3  # mom x2, quiet x1
    assert sender.push_all("announcement", ["mom", "dad", "quiet", "kid"], NOTE_POST, env=LOG) == 4  # mom 2, dad, kid


def test_nobody_without_a_device_and_nobody_unknown_is_pushed(fake):
    assert sender.push_all("card", ["stranger", "stranger"], NOTE_CARD, env=LOG) == 0
    assert sender.push_all("card", [], NOTE_CARD, env=LOG) == 0


def test_log_mode_sends_nothing_and_logs_only_counts(fake, caplog):
    def boom(messages):
        raise AssertionError("must not send")

    with caplog.at_level(logging.INFO):
        assert sender.push_all("card", ["mom"], NOTE_CARD, send=boom, env=LOG) == 2
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "devices=2" in text and "tok-mom" not in text and "Camping" not in text


def test_send_mode_builds_data_messages_with_a_link_and_no_tokens_in_text(fake):
    seen = []

    def ok(messages):
        seen.extend(messages)
        return [None] * len(messages)

    assert sender.push_all("card", ["mom"], NOTE_CARD, send=ok, env=SEND) == 2
    assert {m.token for m in seen} == {"tok-mom-1" * 3, "tok-mom-2" * 3}
    assert seen[0].data["link"] == "https://forthrightapp.com/t/t1/scouts/s1"
    assert seen[0].data["title"] == "Blue card update" and seen[0].notification is None


def test_an_invalid_token_is_deleted_and_other_failures_keep_the_device(fake):
    class Dead(messaging.UnregisteredError):
        def __init__(self):
            Exception.__init__(self, "gone")

    def mixed(messages):
        return [Dead(), RuntimeError("flaky")]

    assert sender.push_all("card", ["mom"], NOTE_CARD, send=mixed, env=SEND) == 0
    assert fake.deleted == [("mom", "m1")]


def test_a_failure_while_sending_never_raises(fake):
    def broken(messages):
        raise RuntimeError("fcm down")

    assert sender.push_all("card", ["mom"], NOTE_CARD, send=broken, env=SEND) == 0


def test_the_emulator_records_pushes_in_an_outbox(fake):
    assert sender.push_all("announcement", ["mom"], NOTE_POST, env={"FUNCTIONS_EMULATOR": "true"}) == 2
    assert [o["uid"] for o in fake.outbox] == ["mom", "mom"] and fake.outbox[0]["template"] == "announcement"


def test_recipients_and_devices_are_capped():
    uids = [f"u{i}" for i in range(300)]
    devices = {u: [(f"d{n}", f"token-{u}-{n}") for n in range(15)] for u in uids}
    out = p.targets(uids + uids, {}, devices, p.CARD)
    assert len({t.uid for t in out}) == p.MAX_PUSH_USERS
    assert len(out) == p.MAX_PUSH_USERS * p.MAX_DEVICES_PER_USER


def test_announcements_follow_emailAnnouncements_and_the_rest_follow_emailNotifications():
    assert not p.wants_push({"emailAnnouncements": False}, p.ANNOUNCEMENT)
    assert p.wants_push({"emailAnnouncements": False}, p.CARD)
    assert not p.wants_push({"emailNotifications": False}, p.EVENT)
    assert p.wants_push({"emailNotifications": False}, p.ANNOUNCEMENT)
    assert p.wants_push(None, p.CARD)


def test_money_and_long_text_are_removed_from_what_people_typed():
    assert p.clean("Camp fee $25.50 due", 80) == "Camp fee due"
    assert p.clean("Pay 20 dollars now", 80) == "Pay now"
    assert len(p.clean("x" * 500, p.MAX_BODY)) == p.MAX_BODY


def test_every_text_is_short_first_name_only_and_free_of_forbidden_fields():
    notes = [
        p.announcement("Troop 9", "t1"),
        p.card_requested("Sam", "Camping", "t1"),
        p.card_update("Sam", "Camping", "is complete", "s1", "t1"),
        p.counselor_assigned("Sam", "Camping", "t1"),
        p.waitlist_promoted(["Sam", "you"], "Fall campout $40 fee", "t1", "e1"),
        p.permission_needed(["Sam"], "Fall campout", "t1", "e1"),
        p.event_reminder("Fall campout, bring 12 dollars", "t1", "e1"),
    ]
    for n in notes:
        shown = f"{n.title} {n.body}"
        assert len(n.title) <= p.MAX_TITLE and len(n.body) <= p.MAX_BODY
        assert not any(bad.lower() in shown.lower() for bad in FORBIDDEN), shown
        assert n.path.startswith("/t/t1") and "?" not in n.path

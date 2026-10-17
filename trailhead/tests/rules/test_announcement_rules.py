"""Announcements: only the audience reads one, and no client writes one. The read marker is each person's own."""

from datetime import UTC, datetime

import pytest
import requests

from .conftest import T
from .emulator import DOCS, Client

OK, DENIED = 200, 403
POST = {
    "kind": "announcement",
    "title": "Campout",
    "body": "Bring a coat.",
    "readerUids": ["leader", "parent"],
    "audience": {"type": "parents"},
    "postedByUid": "leader",
    "createdAt": datetime(2026, 10, 1, tzinfo=UTC),
}
A = f"{T}/announcements/a1"
leader, assistant, parent, scout, outsider = (
    Client(u) for u in ("leader", "assistant", "parent", "scout1", "stranger")
)


@pytest.fixture(autouse=True)
def posted(troop):
    Client("owner").set(A, POST)


def test_only_people_in_the_audience_read_an_announcement():
    assert leader.get(A) == OK
    assert parent.get(A) == OK
    for other in (assistant, scout, outsider, Client(None)):
        assert other.get(A) == DENIED


def test_a_scout_in_the_audience_reads_it():
    Client("owner").set(A, {**POST, "readerUids": ["scout1", "leader"]})
    assert scout.get(A) == OK and parent.get(A) == DENIED


def query_as(client, uid):
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "announcements"}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "readerUids"},
                    "op": "ARRAY_CONTAINS",
                    "value": {"stringValue": uid},
                }
            },
        }
    }
    url = f"{DOCS}/{T}:runQuery"
    return requests.post(url, json=body, headers=client.headers, timeout=10).status_code


def test_the_feed_query_works_for_a_reader_and_not_for_asking_as_someone_else():
    assert query_as(parent, "parent") == OK
    assert query_as(parent, "leader") == DENIED
    # A query for everything is refused, so one person cannot list the troop's announcements.
    all_docs = {"structuredQuery": {"from": [{"collectionId": "announcements"}]}}
    url = f"{DOCS}/{T}:runQuery"
    assert requests.post(url, json=all_docs, headers=parent.headers, timeout=10).status_code == DENIED


def test_no_client_writes_an_announcement_not_even_the_poster_or_scoutmaster():
    for client in (leader, assistant, parent, scout):
        assert client.set(f"{T}/announcements/a2", POST) == DENIED
        assert client.set(A, {**POST, "title": "Changed"}) == DENIED
        assert client.delete(A) == DENIED


def test_clients_cannot_add_themselves_to_the_audience_or_fake_server_fields():
    for fields in (
        {"readerUids": ["leader", "parent", "assistant"]},
        {"postedByUid": "assistant"},
        {"emailed": 99},
        {"pinned": True},
        {"editedAt": datetime.now(UTC)},
    ):
        assert assistant.set(A, {**POST, **fields}) == DENIED
        assert leader.set(A, {**POST, **fields}) == DENIED


def test_each_person_records_only_their_own_last_seen_time_with_the_servers_clock():
    own = f"{T}/announcementReads/parent"
    assert parent.set(own, {"lastSeenAt": datetime(2020, 1, 1, tzinfo=UTC)}) == DENIED  # not the server time
    assert parent.set(own, {"lastSeenAt": datetime(2020, 1, 1, tzinfo=UTC), "extra": 1}) == DENIED
    assert leader.set(own, {"lastSeenAt": datetime.now(UTC)}) == DENIED  # someone else's marker
    assert outsider.set(f"{T}/announcementReads/stranger", {"lastSeenAt": datetime.now(UTC)}) == DENIED
    assert parent.delete(own) == DENIED


def test_a_person_reads_their_own_marker_and_nobody_elses():
    Client("owner").set(f"{T}/announcementReads/parent", {"lastSeenAt": datetime(2026, 10, 2, tzinfo=UTC)})
    assert parent.get(f"{T}/announcementReads/parent") == OK
    assert leader.get(f"{T}/announcementReads/parent") == DENIED

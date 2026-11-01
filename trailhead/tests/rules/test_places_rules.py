"""The place catalog: anyone signed in reads places and when they were last refreshed; only the refresh_places job
writes them, and nobody reads the job's own run records."""

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
owner, parent, scout1, nobody = Client("owner"), Client("parent"), Client("scout1"), Client(None)


def test_signed_in_people_read_the_catalog_but_no_client_writes_it():
    owner.set("places/ridb_1", {"name": "Pine Lake", "state": "WI", "kind": "federal"})
    owner.set("catalogMeta/current", {"summary": {"added": 1}})
    owner.set("placeRuns/2026-11-01", {"stage": "states"})
    for who in (parent, scout1):
        assert who.get("places/ridb_1") == OK
        assert who.get("catalogMeta/current") == OK
        assert who.get("placeRuns/2026-11-01") == DENIED
        assert who.set("places/ridb_2", {"name": "Mine"}) == DENIED
        assert who.set("catalogMeta/current", {"summary": {}}) == DENIED
    assert nobody.get("places/ridb_1") == DENIED
    assert T  # the troop fixture still seeds the usual users

"""Validate the official requirement text files in app/public/requirements."""

import json
import re
from pathlib import Path

import pytest

from trailhead_core.catalog import load_catalog

REQ_DIR = Path(__file__).resolve().parents[2] / "app" / "public" / "requirements"
FILES = sorted(p for p in REQ_DIR.glob("*.json") if p.name != "index.json")
BADGE_ID_RULE = re.compile(r"^\d+([a-z]|\(\d+\)|\([a-z]+\)|-[A-Z0-9]+|-h\d+|-\d+)*$")


def _walk(nodes, parent_id=None):
    for node in nodes:
        yield node, parent_id
        yield from _walk(node["children"], node["id"])


def test_every_merit_badge_has_a_requirements_file():
    names = {p.stem for p in FILES}
    missing = sorted(set(load_catalog().badges) - names)
    assert not missing, f"no requirements file for: {missing}"


def test_index_lists_the_files_it_names():
    index = json.loads((REQ_DIR / "index.json").read_text())
    assert index["attribution"].startswith("Requirements ©")
    assert list(index["awards"]) == sorted(index["awards"])
    for award_id, entry in index["awards"].items():
        doc = json.loads((REQ_DIR / f"{award_id}.json").read_text())
        assert entry["sourceUrl"].startswith("https://")
        assert entry["count"] == len(doc["requirements"])


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_requirements_file_matches_the_shared_format(path):
    doc = json.loads(path.read_text())
    for key in ("awardId", "name", "kind", "sourceUrl", "fetchedAt", "requirements"):
        assert key in doc, key
    assert doc["awardId"] == path.stem
    assert doc["sourceUrl"].startswith("https://")
    assert doc["kind"] in {"merit_badge", "rank"}
    assert doc["requirements"], "no requirements"

    seen = set()
    for node, parent_id in _walk(doc["requirements"]):
        for key in ("id", "label", "text", "resources", "children"):
            assert key in node, f"{node.get('id')} missing {key}"
        assert node["text"].strip(), f"{node['id']} has empty text"
        assert node["id"] not in seen, f"duplicate id {node['id']}"
        seen.add(node["id"])
        if parent_id:
            assert node["id"].startswith(parent_id), f"{node['id']} not under {parent_id}"
        if doc["kind"] == "merit_badge":
            assert BADGE_ID_RULE.match(node["id"]), f"odd id {node['id']}"
        for res in node["resources"]:
            assert res["title"] and res["url"].startswith("http")

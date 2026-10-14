"""The rank requirement files in app/public/requirements must follow the shared data format."""

import json
import re
from pathlib import Path

import pytest

DIR = Path(__file__).resolve().parents[2] / "app" / "public" / "requirements"
RANKS = ["scout", "tenderfoot", "second-class", "first-class", "star", "life", "eagle"]
ALL = [*RANKS, "eagle-palm"]
KEYS = {"awardId", "name", "kind", "sourceUrl", "fetchedAt", "requirements"}
REQ_KEYS = {"id", "label", "text", "resources", "children"}
TOP_ID = re.compile(r"^\d{1,2}(-\d+)?$")
LETTER_ID = re.compile(r"^(\d{1,2})([a-z])(-\d+)?$")
GRANDCHILD_ID = re.compile(r"^(\d{1,2}[a-z])\((\d+)\)(-\d+)?$")


def load(award: str) -> dict:
    return json.loads((DIR / f"{award}.json").read_text())


def walk(reqs: list[dict], depth: int = 0, parent: dict | None = None):
    for r in reqs:
        yield r, depth, parent
        yield from walk(r["children"], depth + 1, r)


@pytest.mark.parametrize("award", ALL)
def test_file_shape(award: str) -> None:
    doc = load(award)
    assert KEYS <= doc.keys() <= KEYS | {"note"}
    assert doc["awardId"] == award
    assert doc["kind"] == "rank"
    assert doc["sourceUrl"].startswith("https://www.scouting.org/")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", doc["fetchedAt"])
    assert doc["requirements"]


@pytest.mark.parametrize("award", ALL)
def test_requirements_follow_the_id_rules(award: str) -> None:
    seen: set[str] = set()
    for r, depth, parent in walk(load(award)["requirements"]):
        assert set(r) == REQ_KEYS, r["id"]
        assert r["id"] not in seen, f"duplicate id {r['id']}"
        seen.add(r["id"])
        assert r["text"].strip(), f"{r['id']} has no text"
        assert r["label"].strip()
        assert r["resources"] == []
        if depth == 0:
            assert TOP_ID.match(r["id"]), r["id"]
            continue
        m = (LETTER_ID if depth == 1 else GRANDCHILD_ID).match(r["id"])
        assert m, r["id"]
        assert parent is not None
        assert parent["id"].split("-")[0] == m.group(1), r["id"]


@pytest.mark.parametrize("award", ALL)
def test_no_pdf_leftovers_in_text(award: str) -> None:
    for r, _, _ in walk(load(award)["requirements"]):
        text = r["text"]
        assert not re.search(r"LEADER|INITIAL|& DATE|RANK REQUIREMENTS|[ﬁﬂ]|\S- \S", text), (r["id"], text)
        assert not re.search(r"[a-z]\d{1,2}\b", text), (r["id"], text)  # footnote marks must be gone


def test_every_rank_is_indexed() -> None:
    index = json.loads((DIR / "index.json").read_text())
    for award in ALL:
        entry = index["awards"][award]
        doc = load(award)
        assert entry["count"] == len(doc["requirements"])
        assert entry["sourceUrl"] == doc["sourceUrl"]
    assert list(index["awards"]) == sorted(index["awards"])


def test_tenderfoot_matches_what_scouts_see() -> None:
    tenderfoot = load("tenderfoot")["requirements"]
    assert [r["id"] for r in tenderfoot] == [str(n) for n in range(1, 12)]
    assert [c["id"] for c in tenderfoot[3]["children"]] == ["4a", "4b", "4c", "4d"]


@pytest.mark.parametrize("rank", ["star", "life", "eagle"])
def test_upper_ranks_have_the_core_requirements(rank: str) -> None:
    text = " ".join(r["text"] for r in load(rank)["requirements"])
    for phrase in ("merit badges", "of responsibility", "Scoutmaster conference", "board of review", "service"):
        assert phrase in text, phrase


def test_eagle_merit_badge_list_is_readable() -> None:
    lines = load("eagle")["requirements"][2]["text"].splitlines()
    badges = [line for line in lines if re.match(r"\([a-n]\) ", line)]
    assert len(badges) == 14
    assert "(a) First Aid" in badges
    assert "(n) Family Life" in badges

"""Download the official Scouting America rank requirement PDFs and turn them into JSON for the app.

Run from `trailhead/`:
    .venv/bin/python scripts/fetch_rank_requirements.py [--pdf-dir DIR]

Writes one file per award to app/public/requirements/<awardId>.json (shape documented in the lead's data
contract) and merges the awards into app/public/requirements/index.json. Needs `pypdf` (requirements-dev.txt).

The PDFs are laid out as printed forms, so besides generic parsing this handles the known quirks of the
December 2025 editions: section headings, "Leader initial & date" boxes, page numbers, footnotes, two-column
choice lists and fragments from the form layout. After parsing, every rank is cross-checked against the
combined Scouts-BSA-Rank-Requirements.pdf (which also supplies Eagle).

If scouting.org returns 403 to this script, download the PDFs in a browser into a folder and pass --pdf-dir
(file names: scout.pdf, tenderfoot.pdf, second-class.pdf, first-class.pdf, star.pdf, life.pdf,
eagle-palm.pdf, all.pdf).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import urllib.request
from datetime import date
from pathlib import Path

import pypdf

BASE = "https://www.scouting.org/wp-content/uploads/2025/12/"
COMBINED = "Scouts-BSA-Rank-Requirements.pdf"
OUT_DIR = Path(__file__).resolve().parents[1] / "app" / "public" / "requirements"
ATTRIBUTION = "Requirements © Scouting America. Shown from scouting.org for troop use."

# award id -> (display name, pdf file name or None when only in the combined PDF, title printed on the PDF)
AWARDS = {
    "scout": ("Scout", "Scout-Rank.pdf", "SCOUT"),
    "tenderfoot": ("Tenderfoot", "Tenderfoot-Rank.pdf", "TENDERFOOT"),
    "second-class": ("Second Class", "Second-Class-v2.pdf", "SECOND CLASS"),
    "first-class": ("First Class", "First-Class.pdf", "FIRST CLASS"),
    "star": ("Star", "Star-Rank.pdf", "STAR"),
    "life": ("Life", "Life-Rank.pdf", "LIFE"),
    "eagle": ("Eagle", None, "EAGLE"),
    "eagle-palm": ("Eagle Palm", "Eagle-Palms.pdf", "EAGLE PALM"),
}

LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}
NOISE_EXACT = {
    "LEADER", "INITIAL", "& DATE", "RANK REQUIREMENTS", "ADER", "LEA", "S", "R", "L", "E", "di d",
    "NAME OF MERIT BADGE DATE EARNED", "(Eagle-required)",
    "the required Eagle merit badges,", "as approved by your Scoutmaster",
}  # fmt: skip
NOISE_RE = [
    re.compile(r"^\d{3}$"),  # page number
    re.compile(r"^\d{1,2}\.$"),  # empty numbered rows of the Eagle merit badge table
    re.compile(r"^[A-Z ]+ (RANK|PALM) REQUIREMENTS\*?$"),  # page title
    re.compile(r"^(Second |Third )?(Bronze|Gold|Silver) Palm earned$"),
    re.compile(r"^h\. Three requirements from one of$"),  # orphan of Life requirement 6 (restored in a fixup)
]
FOOT_START = re.compile(r"^(?:(\d{1,2}) ?(?=[A-Z])|(\*\*))")
TOP = re.compile(r"^(\d{1,2})\.\s*(.*)$")
LETTERED = re.compile(r"^(\d{1,2})([a-z])\.\s*(.*)$")
HEADING = re.compile(r"^[A-Z][A-Z ,&/'-]{3,}$")
NEW_PARAGRAPH = re.compile(r"^(•|Scout troop\.|Venturing crew/Sea Scout ship\.|Lone Scout\.)")
HYPHEN_JOINS = {"activi-ties": "activities", "condi-tions": "conditions"}  # other line-end hyphens are real

# Footnote reference marks in requirement text: (award, requirement id, regex of the mark, footnote number as
# printed at the foot of the page). The mark is removed and the footnote text is appended to the requirement.
FOOTNOTES = [
    ("scout", "6b", r"(?<=videos\.)1", "1"),
    ("second-class", "3b", r"(?<=guardian\.)2", "2"),
    ("second-class", "3c", r"(?<=them\.)2", "2"),
    ("second-class", "5b", r"(?<=place\.)3", "3"),
    ("first-class", "6a", r"(?<=test\.)4,5", "4,5"),
    ("first-class", "6e", r"(?<=\))5", "5"),
    ("star", "5", r"(?<=guide\.)6", "6"),
    ("star", "6b", r"(?<=videos\.)7", "7"),
    ("star", "8", r"(?<=rank\.)8", "8"),
    ("life", "5", r"(?<=guide\.)9", "9"),
    ("life", "8", r"(?<=rank\.)8", "10"),  # the PDF marks this "8" but prints the footnote as number 10
    ("eagle", "4", r"(?<=responsibility)11(?=:)", "11"),
    ("eagle", "7", r"(?<=rank\.)12", "12"),
    ("eagle", "7", r"(?<=3\.1)\.13(?=\))", "13"),
    ("eagle-palm", "3", r"(?<=\.)\*\*", "**"),
]
# Footnote text headings that were printed in capitals.
FOOT_HEADINGS = {
    "APPEALS AND EXTENSIONS ": "Appeals and extensions. ",
    "AGE REQUIREMENT ELIGIBILITY ": "Age requirement eligibility. ",
}
LIFE_6_CHOICES = [
    "a. Tenderfoot 4a and 4b (first aid)",
    "b. Second Class 2b, 2c, and 2d (cooking/tools)",
    "c. Second Class 3a and 3d (navigation)",
    "d. First Class 3a, 3b, 3c, and 3d (tools)",
    "e. First Class 4a and 4b (navigation)",
    "f. Second Class 6a and 6b (first aid)",
    "g. First Class 7a and 7b (first aid)",
    "h. Three requirements from one of the required Eagle merit badges, as approved by your Scoutmaster",
]


def norm(line: str) -> str:
    for old, new in LIGATURES.items():
        line = line.replace(old, new)
    line = line.replace("-–", "–")  # stray hyphen in a printed page range
    line = re.sub(r"(?<=[a-z]\.)\d{3}$", "", line.strip())  # page number glued to the last line
    return re.sub(r"\s+", " ", line).strip()


def is_noise(line: str) -> bool:
    return line in NOISE_EXACT or any(p.match(line) for p in NOISE_RE)


def join(prev: str, nxt: str) -> str:
    if prev.endswith("-") and nxt[:1].islower():
        merged = (prev.rsplit(" ", 1)[-1] + nxt.split(" ", 1)[0]).lower().rstrip(",.;:)")
        if merged in HYPHEN_JOINS:
            return prev[:-1] + nxt
        return prev + nxt
    return prev + " " + nxt


def sentence_case(heading: str) -> str:
    return heading.capitalize()


def split_awards(pages: list[str]) -> dict[str, list[str]]:
    """Group page texts by the award title printed at the top of the first page of each award."""
    titles = {v[2]: k for k, v in AWARDS.items()}
    groups: dict[str, list[str]] = {}
    current = None
    for page in pages:
        first = next((norm(x) for x in page.splitlines() if x.strip()), "")
        m = re.match(r"^([A-Z ]+?)(?: RANK)? REQUIREMENTS\*?$", first)
        if m and m.group(1) in titles:
            current = titles[m.group(1)]
            groups[current] = []
        elif m:
            current = None  # cover page of the combined PDF
        if current:
            groups[current].append(page)
    return groups


class Req:
    def __init__(self, rid: str, label: str, text: str = "") -> None:
        self.id, self.label = rid, label
        self.paras: list[str] = [text] if text else []
        self.children: list[Req] = []

    def add(self, line: str) -> None:
        if not self.paras or NEW_PARAGRAPH.match(line):
            self.paras.append(line)
        else:
            self.paras[-1] = join(self.paras[-1], line)

    def to_json(self) -> dict:
        text = "\n".join(self.paras)
        text = re.sub(r"\.\(See", ". (See", text)
        return {
            "id": self.id,
            "label": self.label,
            "text": "\n".join(re.sub(r"[ \t]+", " ", p).strip() for p in text.split("\n")).strip(),
            "resources": [],
            "children": [c.to_json() for c in self.children],
        }


def parse_award(pages: list[str]) -> tuple[list[Req], str, dict[str, str]]:
    tops: list[Req] = []
    preamble: list[str] = []
    notes: list[str] = []
    foots: dict[str, list[str]] = {}
    heading = None
    for page in pages:
        mode, fkey = "body", ""
        for raw in page.splitlines():
            line = norm(raw)
            if not line:
                continue
            if is_noise(line):
                mode = "body"
                continue
            if line.startswith("Notes:"):
                mode = "notes"
                notes.append(line[6:].strip())
                continue
            m = FOOT_START.match(line)
            if m and not TOP.match(line):
                mode, fkey = "foot", m.group(1) or m.group(2)
                foots[fkey] = [line[m.end() :].strip()]
                continue
            if line.startswith("Alternative requirements"):
                mode = "notes"
            if mode == "notes":
                notes.append(line)
                continue
            if mode == "foot":
                foots[fkey][-1] = join(foots[fkey][-1], line)
                continue
            top_num = int(tops[-1].id) if tops else 0
            top, let = TOP.match(line), LETTERED.match(line)
            if top and int(top.group(1)) == top_num + 1:
                tops.append(Req(top.group(1), top.group(1) + ".", top.group(2)))
                heading = None
            elif (
                let
                and tops
                and let.group(1) == tops[-1].id
                and ord(let.group(2)) == ord(tops[-1].children[-1].id[-1] if tops[-1].children else "`") + 1
            ):
                tops[-1].children.append(
                    Req(let.group(1) + let.group(2), f"{let.group(1)}{let.group(2)}.", let.group(3))
                )
            elif let and let.group(2) == "a" and int(let.group(1)) == top_num + 1:
                # Lettered parts whose numbered parent is not printed: build it from the section heading.
                num = let.group(1)
                tops.append(Req(num, num + ".", sentence_case(heading) if heading else "Do the following:"))
                heading = None
                tops[-1].children.append(Req(num + "a", f"{num}a.", let.group(3)))
            elif HEADING.match(line):
                heading = line.strip()
            elif not tops:
                preamble.append(line)
            else:
                (tops[-1].children[-1] if tops[-1].children else tops[-1]).add(line)
    note = re.sub(r"\s+", " ", " ".join([*preamble, *notes])).strip()
    foot_text = {}
    for k, v in foots.items():
        t = " ".join(v)
        for old, new in FOOT_HEADINGS.items():
            t = t.replace(old, new)
        foot_text[k] = t
    return tops, note, foot_text


def find(tops: list[Req], rid: str) -> Req:
    for t in tops:
        if t.id == rid:
            return t
        for c in t.children:
            if c.id == rid:
                return c
    raise KeyError(rid)


def apply_footnotes(award: str, tops: list[Req], foots: dict[str, str]) -> None:
    for aw, rid, pattern, key in FOOTNOTES:
        if aw != award:
            continue
        req = find(tops, rid)
        joined = "\n".join(req.paras)
        joined, n = re.subn(pattern, "", joined, count=1)
        keys = key.split(",")
        if n != 1 or any(k not in foots for k in keys):
            raise ValueError(f"{award} {rid}: footnote mark {pattern!r} or footnote {key!r} not found")
        req.paras = joined.split("\n") + [f"Note: {foots[k]}" for k in keys]


def fixups(award: str, tops: list[Req]) -> None:
    if award == "life":
        r6 = find(tops, "6")
        text = "\n".join(r6.paras)
        head, _, rest = text.partition(" a. Tenderfoot")
        for frag in ("4a and 4b (first aid)", "2d (cooking/tools)", "3a and 3d (navigation)", "7a and 7b (first aid)"):
            if frag not in rest:
                raise ValueError(f"life 6 choice list changed: missing {frag}")
        r6.paras = [head.strip(), *LIFE_6_CHOICES]
    if award == "eagle":
        r3 = find(tops, "3")
        text = "\n".join(r3.paras)
        m = re.match(r"(.*?merit badges:) (\(a\) .*?\(n\) [^.]*\.)(.*)$", text, re.S)
        if not m:
            raise ValueError("eagle 3 merit badge list not found")
        items = [i for i in re.split(r",?\s*(?:and\s+)?(?=\([b-n]\) )", m.group(2).rstrip(".")) if i]
        if len(items) != 14:
            raise ValueError(f"eagle 3 expected 14 badge entries, got {len(items)}")
        r3.paras = [m.group(1), *[i.strip() for i in items], m.group(3).strip()]
        # The paragraph about preparing for the board of review prints before requirement 7 but belongs to it.
        r6, r7 = find(tops, "6"), find(tops, "7")
        joined = "\n".join(r6.paras)
        head, sep, para = joined.partition(" In preparation for your board of review")
        if not sep:
            raise ValueError("eagle 6/7 board of review paragraph not found")
        r6.paras = head.split("\n")
        r7.paras = [r7.paras[0].replace("age 1 8", "age 18"), "In preparation for your board of review" + para]


# Official changes announced after a PDF was published. Shown as a note; the printed text is left as it is.
LATER_CHANGES = {
    "eagle": (
        "Update: Citizenship in Society was discontinued on February 27, 2026, so Eagle now requires 13 of the "
        "badges listed in requirement 3 (21 merit badges in total). Scouts who had already started Citizenship in "
        "Society may finish it and count it for Eagle through December 31, 2026."
    ),
}


def build(award: str, pages: list[str], fetched: str, source_url: str) -> tuple[dict, list[Req]]:
    tops, note, foots = parse_award(pages)
    fixups(award, tops)
    apply_footnotes(award, tops, foots)
    doc = {
        "awardId": award,
        "name": AWARDS[award][0],
        "kind": "rank",
        "sourceUrl": source_url,
        "fetchedAt": fetched,
    }
    note = " ".join(part for part in (LATER_CHANGES.get(award), note) if part)
    if note:
        doc["note"] = note
    doc["requirements"] = [t.to_json() for t in tops]
    return doc, tops


def read_pages(path: Path) -> list[str]:
    return [p.extract_text() or "" for p in pypdf.PdfReader(str(path)).pages]


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Trailhead requirement fetcher)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            dest.write_bytes(resp.read())
    except Exception as exc:
        sys.exit(f"Could not download {url}: {exc}\nDownload it in a browser and use --pdf-dir (see --help).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf-dir", type=Path, help="folder holding the PDFs (downloaded there if missing)")
    args = ap.parse_args()
    pdf_dir = args.pdf_dir or Path(tempfile.gettempdir()) / "trailhead-rank-pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    fetched = date.today().isoformat()

    def pdf(local: str, remote: str) -> Path:
        path = pdf_dir / local
        if not path.exists():
            download(BASE + remote, path)
        return path

    combined = split_awards(read_pages(pdf("all.pdf", COMBINED)))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index_path = OUT_DIR / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    index.setdefault("awards", {})
    index = {"fetchedAt": fetched, "attribution": ATTRIBUTION, "awards": index["awards"]}

    for award, (name, remote, _title) in AWARDS.items():
        if remote:
            pages = split_awards(read_pages(pdf(f"{award}.pdf", remote))).get(award)
            url = BASE + remote
        else:
            pages, url = combined.get(award), BASE + COMBINED
        if not pages:
            sys.exit(f"{award}: requirements not found in the PDF")
        doc, _ = build(award, pages, fetched, url)
        other = combined.get(award)
        if other and remote:
            same = build(award, other, fetched, url)[0]["requirements"] == doc["requirements"]
            check = "matches combined PDF" if same else "DIFFERS FROM COMBINED PDF"
        else:
            check = "from combined PDF"
        (OUT_DIR / f"{award}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        index["awards"][award] = {"name": name, "kind": "rank", "count": len(doc["requirements"]), "sourceUrl": url}
        subs = sum(len(r["children"]) for r in doc["requirements"])
        print(f"{award:13} {len(doc['requirements']):2} requirements, {subs:2} lettered parts  ({check})")
    index["awards"] = dict(sorted(index["awards"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT_DIR}")


if __name__ == "__main__":
    main()

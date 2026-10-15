"""The Scoutbook Plus handoff report: what was signed in Trailhead since the last handoff."""

from __future__ import annotations

from datetime import UTC, date, datetime

from handlers.membership import InvalidInput
from trailhead_core.catalog import Catalog

CUSTOM_PREFIX = "custom-"
KIND_ORDER = {"rank": 0, "merit_badge": 1, "requirement": 2}
Key = tuple[str, str, str, str]


def award_name(catalog: Catalog, award_id: str) -> str:
    badge, rank = catalog.badges.get(award_id), catalog.ranks.get(award_id)
    if badge:
        return badge.name
    return rank.name if rank else award_id


def _row_key(row: dict) -> Key:
    return (row["scoutId"], row["kind"], row["awardId"], row.get("requirement", ""))


def _day(value: datetime | date | str | None) -> str | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value[:10] if isinstance(value, str) and value else None


def _recorded_day(item: dict) -> str | None:
    return _day(item["recordedAt"]) if isinstance(item.get("recordedAt"), datetime) else None


def _candidates(signoffs, progress, records, since: datetime | None, until: datetime):
    """Everything counted as new in the period, as dicts, before names are added.

    Paper blue cards are often entered weeks after they were signed, so an item with a `recordedAt` counts by when
    it was entered; others count by their signed or completed date. `date` is always the real signed or completed day.
    """
    for s in signoffs:
        signed = s.get("signedAt")
        if s.get("status") != "accepted" or not isinstance(signed, datetime):
            continue
        counted = s["recordedAt"] if isinstance(s.get("recordedAt"), datetime) else signed
        if (since is None or counted > since) and counted <= until:
            yield {
                "kind": "requirement",
                "scoutId": s["scoutId"],
                "awardId": s["awardId"],
                "requirement": str(s.get("reqId", "")),
                "date": _day(signed),
                "signer": s.get("signerUid"),
                "onBehalfOf": s.get("onBehalfOf"),
            }
    # Work recorded as earned before the Scout joined Trailhead is already in Scoutbook.
    for p in progress:
        if p.get("status") == "complete" and _day(p.get("completedAt")) and p.get("source") != "prior":
            day = _day(p["completedAt"])
            yield {
                "kind": "merit_badge",
                "scoutId": p["scoutId"],
                "awardId": p["awardId"],
                "date": day,
                "counted": _recorded_day(p) or day,
            }
    for scout_id, record in records.items():
        prior_ranks = set(record.get("priorRankIds") or [])
        for rank_id, earned in (record.get("rankDates") or {}).items():
            if _day(earned) and rank_id not in prior_ranks:
                yield {"kind": "rank", "scoutId": scout_id, "awardId": rank_id, "date": _day(earned)}


def _signed_by(signer_name: str | None, on_behalf_of: str | None) -> str | None:
    if not on_behalf_of:
        return signer_name
    for_counselor = f"for {on_behalf_of}, counselor"
    return f"{signer_name} ({for_counselor})" if signer_name else for_counselor


def build_report(
    signoffs: list[dict],
    progress: list[dict],
    records: dict[str, dict],
    members: dict[str, dict],
    catalog: Catalog,
    since: datetime | None,
    until: datetime,
    already_reported: set[Key] | None = None,
) -> list[dict]:
    """Report rows grouped by Scout (sorted by name, then date).

    Badge and rank dates are whole days, so the day of the previous report is included again; `already_reported`
    (the previous report's row keys) stops those from being listed twice.
    """
    already = already_reported or set()
    names = {mid: m.get("displayName") or "Unknown Scout" for mid, m in members.items()}
    signer_names = {m["uid"]: m.get("displayName") for m in members.values() if m.get("uid")}
    since_day = since.astimezone(UTC).date().isoformat() if since else None
    until_day = until.astimezone(UTC).date().isoformat()
    rows = []
    for item in _candidates(signoffs, progress, records, since, until):
        kind, award_id, day = item["kind"], item["awardId"], item["date"]
        if award_id.startswith(CUSTOM_PREFIX) or day is None or day > until_day:
            continue
        if kind != "requirement" and since_day and item.get("counted", day) < since_day:
            continue
        if kind == "rank" and award_id not in catalog.ranks:
            continue
        row = {
            "scoutId": item["scoutId"],
            "scoutName": names.get(item["scoutId"], "Unknown Scout"),
            "kind": kind,
            "awardId": award_id,
            "awardName": award_name(catalog, award_id),
            "date": day,
        }
        if item.get("requirement"):
            row["requirement"] = item["requirement"]
        signed_by = _signed_by(signer_names.get(item.get("signer")), item.get("onBehalfOf"))
        if signed_by:
            row["signedBy"] = signed_by
        if kind != "requirement" and _row_key(row) in already:
            continue
        rows.append(row)
    rows.sort(
        key=lambda r: (
            r["scoutName"].lower(),
            r["scoutId"],
            r["date"],
            KIND_ORDER[r["kind"]],
            r["awardName"],
            r.get("requirement", ""),
        )
    )
    return rows


def row_keys(rows: list[dict]) -> set[Key]:
    return {_row_key(r) for r in rows}


def nothing_new_message(since: datetime | None) -> str:
    if since is None:
        return "Nothing has been signed off in Forthright yet."
    return f"Nothing new since {since.astimezone(UTC).strftime('%b')} {since.day}, {since.year}."


def new_report(rows: list[dict], since: datetime | None, until: datetime, member_id: str) -> dict:
    return {
        "createdByMemberId": member_id,
        "since": since,
        "until": until,
        "rows": rows,
        "rowCount": len(rows),
        "enteredScoutIds": [],
    }


def check_entered_request(report: dict | None, scout_id: str | None) -> str:
    if report is None:
        raise InvalidInput("That report wasn't found.")
    if not scout_id or scout_id not in {r["scoutId"] for r in report.get("rows", [])}:
        raise InvalidInput("That Scout isn't on this report.")
    return scout_id

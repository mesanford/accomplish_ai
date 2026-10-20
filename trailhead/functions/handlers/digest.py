"""The weekly family digest: what is on in the coming week, sign-up deadlines, permission slips waiting on the reader
and new announcements. Pure functions over documents already read from Firestore.

One email a week, on Sunday evening, instead of many: it goes to adults and parents (never Scouts) who have not turned
it off (`users/{uid}.emailDigest`), and only when there is something in it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from handlers.event_changes import clock
from handlers.signup_config import as_date

WEEK_DAYS = 7
LOOK_AHEAD_DAYS = 60  # events read for deadlines and permission slips
MAX_ITEMS = 15  # per section, so a busy troop's email stays readable


@dataclass
class Digest:
    events: list[dict] = field(default_factory=list)  # {title, day, time, place, cancelled, names}
    deadlines: list[dict] = field(default_factory=list)  # {title, deadline}
    waiting: list[dict] = field(default_factory=list)  # {title, names}
    posts: list[str] = field(default_factory=list)  # announcement titles

    def empty(self) -> bool:
        return not (self.events or self.deadlines or self.waiting or self.posts)


def window(today: date) -> tuple[date, date]:
    """The coming week: tomorrow and the six days after it (Monday to Sunday when the job runs on Sunday)."""
    first = today + timedelta(days=1)
    return first, first + timedelta(days=WEEK_DAYS - 1)


def week_of(today: date) -> str:
    """The id of this week's digest run, for the once-a-week claim."""
    return window(today)[0].isoformat()


def wants_digest(user_doc: dict | None) -> bool:
    return (user_doc or {}).get("emailDigest") is not False


def _title(event: dict) -> str | None:
    title = event.get("title")
    return title.strip()[:120] if isinstance(title, str) and title.strip() else None


def _open_deadline(event: dict, first: date, last: date) -> date | None:
    signups = event.get("signups") or {}
    if signups.get("enabled") is not True or signups.get("closed") is True or event.get("cancelled") is True:
        return None
    deadline = as_date(signups.get("deadline"))
    return deadline if deadline and first <= deadline <= last else None


def build(
    uid: str,
    events: list[tuple[str, dict]],
    families: dict[str, dict[str, list[str]]],
    owed: dict[str, dict[str, list[str]]],
    posts: list[dict],
    today: date,
) -> Digest:
    """This reader's digest. `families[event_id][uid]` and `owed[event_id][uid]` are the first names (or "you") they
    signed up and the Scouts waiting for their permission. `posts` are announcements created this past week."""
    first, last = window(today)
    out = Digest()
    for event_id, event in sorted(events, key=lambda e: (str(e[1].get("start")), _title(e[1]) or "")):
        title, start = _title(event), as_date(event.get("start"))
        if not title or start is None or start < today:
            continue
        if first <= start <= last:
            out.events.append(
                {
                    "title": title,
                    "day": start,
                    "time": clock(event.get("startTime")),
                    "place": (event.get("place") or "").strip()[:120] or None,
                    "cancelled": event.get("cancelled") is True,
                    "names": families.get(event_id, {}).get(uid, []),
                }
            )
        deadline = _open_deadline(event, first, last)
        if deadline:
            out.deadlines.append({"title": title, "deadline": deadline})
        waiting = owed.get(event_id, {}).get(uid, [])
        if waiting and event.get("cancelled") is not True:
            out.waiting.append({"title": title, "names": waiting})
    out.posts = [p["title"] for p in posts if uid in (p.get("readerUids") or []) and p.get("title")]
    out.events, out.deadlines = out.events[:MAX_ITEMS], out.deadlines[:MAX_ITEMS]
    out.waiting, out.posts = out.waiting[:MAX_ITEMS], out.posts[:MAX_ITEMS]
    return out


def readers(access: dict[str, dict], members: dict[str, dict]) -> list[str]:
    """The logins that get a digest: every adult and parent. A Scout's own login never gets email."""
    out = []
    for uid, a in access.items():
        member = members.get(a.get("memberId") or "") or {}
        if member.get("kind") != "scout":
            out.append(uid)
    return sorted(out)

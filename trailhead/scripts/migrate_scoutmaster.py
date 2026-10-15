"""One-off: give every existing troop that has no Scoutmaster one, so someone can change merit badge records.

The Scoutmaster role is new. Before it, every leader could sign merit badges and approve blue cards. This gives the
role to the person who created each troop (the troop's `createdBy`). Older troops have no `createdBy`, so for those
it picks the leader whose access record was created first.

It does nothing unless you pass --apply. Run it again any time: troops that already have a Scoutmaster are skipped.

    python scripts/migrate_scoutmaster.py --project your-project-id            # dry run, prints what it would do
    python scripts/migrate_scoutmaster.py --project your-project-id --apply    # make the changes

Against the emulator, set FIRESTORE_EMULATOR_HOST first (see scripts/seed.py).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))

from handlers.account import LEADER_ROLES  # noqa: E402
from handlers.roles import in_order  # noqa: E402

SCOUTMASTER = "scoutmaster"


@dataclass(frozen=True)
class Change:
    uid: str
    roles: list[str]  # the person's roles after the change
    reason: str  # "created the troop" or "first leader"


def plan_troop(troop: dict, logins: dict[str, dict]) -> Change | None:
    """The role change for one troop, or None when it has a Scoutmaster already or nobody to give the role to.

    `logins`: uid -> that login's access record, plus an optional `createdAt` datetime (the record's creation time).
    Only adults who are leaders or advancement chairs are considered; a creator who has since left is passed over.
    """
    if has_scoutmaster(logins):
        return None
    leaders = {uid: a for uid, a in logins.items() if (LEADER_ROLES - {SCOUTMASTER}) & set(a.get("roles", []))}
    creator = troop.get("createdBy")
    if creator in leaders:
        chosen, reason = creator, "created the troop"
    elif leaders:
        far_future = datetime.max.replace(tzinfo=None)

        def order(uid: str):
            made = leaders[uid].get("createdAt")
            return (made.replace(tzinfo=None) if made else far_future, uid)

        chosen, reason = min(leaders, key=order), "first leader"
    else:
        return None
    return Change(chosen, in_order([*leaders[chosen].get("roles", []), SCOUTMASTER]), reason)


def has_scoutmaster(logins: dict[str, dict]) -> bool:
    return any(SCOUTMASTER in a.get("roles", []) for a in logins.values())


def collect(t) -> dict[str, dict]:
    """Every login's access record in a troop, with the time the record was created."""
    return {d.id: {**d.to_dict(), "createdAt": d.create_time} for d in t.collection("access").stream()}


def apply_change(db, t, change: Change) -> None:
    """Write the new roles to the three places the app reads them: member, access record and user."""
    access_ref = t.collection("access").document(change.uid)
    member_id = (access_ref.get().to_dict() or {}).get("memberId")
    batch = db.batch()
    batch.update(access_ref, {"roles": change.roles})
    if member_id:
        batch.update(t.collection("members").document(member_id), {"roles": change.roles})
    batch.set(db.collection("users").document(change.uid), {"troops": {t.id: {"roles": change.roles}}}, merge=True)
    batch.commit()


def main(argv: list[str]) -> None:
    from seed import client  # the same sign-in handling as the seed script

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", required=True)
    parser.add_argument("--apply", action="store_true", help="make the changes (without it, only print them)")
    args = parser.parse_args(argv)
    db = client(args.project)
    changed = skipped = unchanged = 0
    for t in db.collection("troops").stream():
        ref = db.collection("troops").document(t.id)
        logins = collect(ref)
        change = plan_troop(t.to_dict() or {}, logins)
        label = f"troop {t.id} ({(t.to_dict() or {}).get('name', 'no name')})"
        if change is None:
            if has_scoutmaster(logins):
                unchanged += 1
            else:
                skipped += 1
                print(f"{label}: no leader to give the role to, left alone")
            continue
        print(f"{label}: {change.uid} ({change.reason}) -> {', '.join(change.roles)}")
        if args.apply:
            apply_change(db, ref, change)
        changed += 1
    verb = "Changed" if args.apply else "Would change"
    print(f"{verb} {changed} troop(s); {unchanged} already had a Scoutmaster; {skipped} left alone.")
    if not args.apply and changed:
        print("Dry run. Run again with --apply to make these changes.")


if __name__ == "__main__":
    main(sys.argv[1:])

"""One-off: add `unitKey` and `councilKey` to troops created before the create form looked for existing troops.

`find_troops` searches on these fields; new troops get them from `create_troop` and `save_troop_settings`. A troop
without them is never offered as a match, so run this once per project after deploying.

It does nothing unless you pass --apply. Run it again any time: troops whose keys are already right are skipped.

    python scripts/backfill_troop_keys.py --project your-project-id            # dry run, prints what it would do
    python scripts/backfill_troop_keys.py --project your-project-id --apply    # make the changes

Against the emulator, set FIRESTORE_EMULATOR_HOST first (see scripts/seed.py).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))

from handlers.troop_match import match_keys  # noqa: E402


def main(argv: list[str]) -> None:
    from seed import client  # the same sign-in handling as the seed script

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", required=True)
    parser.add_argument("--apply", action="store_true", help="make the changes (without it, only print them)")
    args = parser.parse_args(argv)
    db = client(args.project)
    changed = unchanged = 0
    for t in db.collection("troops").stream():
        doc = t.to_dict() or {}
        keys = match_keys(doc)
        if all(doc.get(k) == v for k, v in keys.items()):
            unchanged += 1
            continue
        print(f"troop {t.id} ({doc.get('name', 'no name')}): {keys}")
        if args.apply:
            db.collection("troops").document(t.id).update(keys)
        changed += 1
    verb = "Changed" if args.apply else "Would change"
    print(f"{verb} {changed} troop(s); {unchanged} already had their keys.")
    if not args.apply and changed:
        print("Dry run. Run again with --apply to make these changes.")


if __name__ == "__main__":
    main(sys.argv[1:])

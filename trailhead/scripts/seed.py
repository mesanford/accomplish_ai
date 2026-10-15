"""Load program content (merit badges and ranks) into Firestore, and optionally a demo troop.

Run against the emulator:
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 python scripts/seed.py --demo

Run against a real project (uses Application Default Credentials):
    python scripts/seed.py --project your-project-id
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from google.cloud import firestore

CONTENT = Path(__file__).resolve().parents[1] / "functions" / "trailhead_core" / "content"


def client(project: str) -> firestore.Client:
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        from google.auth.credentials import AnonymousCredentials

        return firestore.Client(project=project, credentials=AnonymousCredentials())
    try:
        import google.auth
        from google.auth.transport.requests import Request

        credentials, _ = google.auth.default()
        credentials.refresh(Request())  # fails fast if they exist but have expired
        return firestore.Client(project=project, credentials=credentials)
    except google.auth.exceptions.GoogleAuthError:
        # No usable application-default credentials: borrow the signed-in gcloud user's token instead.
        from google.oauth2.credentials import Credentials

        token = subprocess.run(
            ["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True
        ).stdout.strip()
        return firestore.Client(project=project, credentials=Credentials(token))


def seed_content(db: firestore.Client) -> int:
    badges = json.loads((CONTENT / "merit_badges.json").read_text())
    ranks = json.loads((CONTENT / "ranks.json").read_text())
    batch, count = db.batch(), 0
    version_id = badges["effectiveDate"]
    for badge in badges["badges"]:
        ref = db.collection("awards").document(badge["id"])
        batch.set(ref, {**badge, "currentVersionId": version_id, "ownerTroopId": None})
        # Requirement text is loaded separately, once licensing of the official text is settled.
        batch.set(
            ref.collection("versions").document(version_id),
            {"effectiveDate": version_id, "sourceUrl": badge["officialUrl"], "asOf": badges["asOf"]},
        )
        count += 1
        if count % 200 == 0:
            batch.commit()
            batch = db.batch()
    for rank in ranks["ranks"]:
        batch.set(
            db.collection("awards").document(rank["id"]),
            {**rank, "type": "rank", "currentVersionId": ranks["effectiveDate"], "ownerTroopId": None},
        )
        count += 1
    batch.commit()
    return count


def seed_demo_troop(db: firestore.Client) -> None:
    """A small troop for local development. Logins: leader, parent, scout1 (create them in the Auth emulator)."""
    t = db.collection("troops").document("demo")
    ypt = datetime.now(UTC) + timedelta(days=365)
    t.set({"unitNumber": "101", "council": "Demo Council", "yptCopyMemberIds": ["m-asm"]})
    members = {
        "m-leader": {"kind": "adult", "displayName": "Pat Leader", "uid": "leader", "yptExpiresAt": ypt},
        "m-asm": {"kind": "adult", "displayName": "Alex Assistant", "uid": "asm", "yptExpiresAt": ypt},
        "m-parent": {"kind": "adult", "displayName": "Jordan Parent", "uid": "parent"},
        "s1": {"kind": "scout", "displayName": "Sam", "uid": "scout1", "guardianIds": ["m-parent"]},
    }
    for mid, doc in members.items():
        t.collection("members").document(mid).set(doc)
    t.collection("access").document("leader").set(
        {"memberId": "m-leader", "roles": ["leader", "scoutmaster"], "scoutIds": [], "yptExpiresAt": ypt}
    )
    t.collection("access").document("parent").set({"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]})
    t.collection("access").document("scout1").set({"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    t.collection("scoutRecords").document("s1").set(
        {"birthYear": 2012, "birthMonth": 5, "currentRankId": "first-class", "rankDates": {"first-class": "2026-09-01"}}
    )


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", default="demo-trailhead")
    parser.add_argument("--demo", action="store_true", help="also create a demo troop")
    args = parser.parse_args(argv)
    db = client(args.project)
    print(f"Loaded {seed_content(db)} awards into {args.project}.")
    if args.demo:
        seed_demo_troop(db)
        print("Created demo troop 'demo'.")


if __name__ == "__main__":
    main(sys.argv[1:])

# Trailhead

Scouts BSA advancement planning on Firebase, with the backend in Python. This is the first slice of the MVP in the
[product spec](https://claude.ai/code/artifact/ddbc6f94-4646-412f-bc8c-4e52f42509b3): the rules engine, security
rules and Cloud Functions. The mobile and web client comes next.

## What works today

| Piece                  | Where                              | What it does                                                                                                                                 |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Program content        | `functions/trailhead_core/content` | 138 merit badges (2026) with difficulty, Eagle status and timing constraints; rank timing rules                                              |
| Rules engine           | `functions/trailhead_core`         | Checks a path to a rank: time in rank, badge counts, Eagle-required slots, tracking badges, prerequisites, age 18, workload; gives next steps |
| Youth Protection       | `trailhead_core/ypt.py`            | Adds a parent or second trained adult to every adult–Scout message; blocks adults with expired training                                      |
| Requirement versioning | `trailhead_core/versioning.py`     | Moves progress to a new requirement version only where wording is unchanged; flags the rest                                                  |
| Security rules         | `firestore.rules`                  | Troop- and role-scoped access, append-only sign-offs, counselors limited to assigned badges, server-only messages and feasibility             |
| Cloud Functions        | `functions/main.py`                | Apply sign-offs to progress; turn attendance into logs and ready requirements; recheck paths on save; `send_message`; `check_path_preview`   |
| Merit badge guide      | `web/guide.html`                   | The card and table field guide, served by Firebase Hosting                                                                                   |

## Setup

Needs Python 3.12, Java 11+ (for the emulators) and the Firebase CLI (`npm i -g firebase-tools`).

```bash
cd trailhead
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
python3.12 -m venv functions/venv && functions/venv/bin/pip install -r functions/requirements.txt
```

The functions venv must be built with Python 3.12, the deployed runtime. The emulator looks for `python3.12` in it.

## Run locally

```bash
firebase emulators:start --project demo-trailhead
# in another shell: load badges and ranks, plus a demo troop
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 .venv/bin/python scripts/seed.py --demo
```

The emulator UI is at http://127.0.0.1:4000 and the guide at http://127.0.0.1:5000/guide.html.

## Test

```bash
scripts/test.sh
```

That runs ruff, the unit tests, the security rules tests (Firestore emulator) and end-to-end function tests
(Auth, Firestore and Functions emulators). Unit tests alone: `.venv/bin/pytest tests/unit`.

## Data model

See the spec for the full model. In short: `awards/{id}/versions/{v}` holds program content; everything about a
troop lives under `troops/{t}`. Login permissions come from `troops/{t}/access/{uid}`, which only the server writes.
Progress and blue cards share the id `{scoutId}_{awardId}`, which lets the rules check counselor assignments.

## Deploy

```bash
firebase use --add            # pick your Firebase project
.venv/bin/python scripts/seed.py --project <project-id>
firebase deploy --only firestore,functions,hosting
```

## Not built yet

- The client app (Flutter is the plan in the spec), sign-in and invites that write `access` documents.
- Requirement text for each badge. Only summaries are bundled; storing the official text waits on licensing.
- Gemini path drafting and requirement Q&A.
- Scoutbook Plus handoff report and the blue card PDF.

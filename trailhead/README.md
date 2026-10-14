# Trailhead

Scouts BSA advancement planning on Firebase: a React web app, with the backend in Python. It follows the
[product spec](https://claude.ai/code/artifact/ddbc6f94-4646-412f-bc8c-4e52f42509b3). Phase 2 makes it usable by a
pilot troop: sign-in, invites, and screens for Scouts, parents, leaders and counselors. Phase 3 adds troop awards,
path templates, a Gemini plan assistant and the Scoutbook Plus handoff report. Deploying is covered in
[DEPLOY.md](DEPLOY.md).

## What works today

| Piece                  | Where                              | What it does                                                                                                                                       |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app                | `app/`                             | Sign-in by email link, troop setup, roster and invites, Scout pages, path planner, badges, blue cards, counseling, events, messages                |
| Program content        | `functions/trailhead_core/content` | 138 merit badges (2026) with difficulty, Eagle status and timing constraints; rank timing rules                                                    |
| Rules engine           | `functions/trailhead_core`         | Checks a path to a rank: time in rank, badge counts, Eagle-required slots, tracking badges, prerequisites, age 18, workload; gives next steps      |
| Youth Protection       | `trailhead_core/ypt.py`            | Adds a parent or second trained adult to every adult–Scout message; blocks adults with expired training (parents with their own children excepted) |
| Requirement versioning | `trailhead_core/versioning.py`     | Moves progress to a new requirement version only where wording is unchanged; flags the rest                                                        |
| Security rules         | `firestore.rules`                  | Troop- and role-scoped access, append-only sign-offs, counselors limited to assigned badges, server-only messages, invites and feasibility         |
| Cloud Functions        | `functions/endpoints/`             | Troops, invites and Scouts; sign-offs; blue card completion; attendance logs; path checks; YPT-checked messaging                                   |
| Merit badge guide      | `app/public/guide.html`            | The printable card and table field guide                                                                                                           |

## How people use it

1. A leader signs in and creates the troop. Leaders need a Youth Protection training expiry date.
2. On **Roster**, the leader adds Scouts (birth month and year, current rank) and creates invite links for parents,
   Scouts 13 and older, counselors and other leaders. Each link works once and expires in 30 days.
3. Parents open their link, sign in and see their Scouts. They can add a sibling themselves.
4. A Scout or parent plans a **path** to a rank. The planner checks it live and explains what won't work.
5. From **Badges**, they start a blue card. A leader approves it and assigns a counselor under **Blue cards**.
6. The counselor signs requirements and marks the badge complete under **Counseling**.
7. Leaders sign off rank requirements and record ranks on a Scout's page, and take attendance at **Events**.
8. In the path planner, **Draft with AI** turns a goal in plain words into a plan. Gemini drafts it and the plan
   checker verifies it before anyone sees it. Leaders can also publish **Path templates** that Scouts start from.
9. Leaders create **Troop awards** with their own requirements. Editing one makes a new version; a leader moves
   each Scout to it, keeping what still matches and flagging what changed. Signing the last requirement completes it.
10. **Scoutbook** gives the advancement chair a report of everything signed since the last one, grouped by Scout,
    to enter in Scoutbook Plus. Troop awards are left out, since Scoutbook doesn't know them.

## Setup

Needs Python 3.12, Node 20+, Java 11+ (for the emulators), the Firebase CLI (`npm i -g firebase-tools`) and Google
Chrome for the browser tests.

```bash
cd trailhead
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
python3.12 -m venv functions/venv && functions/venv/bin/pip install -r functions/requirements.txt
npm --prefix app install
```

The functions venv must be built with Python 3.12, the deployed runtime. The emulator looks for `python3.12` in it.

## Run locally

```bash
firebase emulators:start --only auth,firestore,functions --project demo-trailhead
# in another shell
npm --prefix app run dev        # http://localhost:5173
```

The app talks to the emulators in development. Sign in with any email address: after "Email me a sign-in link",
use **Open sign-in link (local emulator)**, which picks up the link the Auth emulator would have emailed. The
emulator UI is at http://127.0.0.1:4000.

## Test

```bash
scripts/test.sh
```

That runs ruff and the Python unit tests, the security rules tests (Firestore emulator), end-to-end function tests
(Auth, Firestore and Functions emulators), then the app's typecheck, unit tests, build, and a Playwright test that
walks a leader, a parent and a counselor through a merit badge in a real browser.

## Data model

See the spec for the full model. In short: everything about a troop lives under `troops/{t}`. Login permissions come
from `troops/{t}/access/{uid}`, which only the server writes; `users/{uid}` lists a person's troops. Progress and
blue cards share the id `{scoutId}_{awardId}`, and each Scout's plan is `paths/{scoutId}`, which lets the rules
check access before a document exists. Badge and rank data is bundled with both the app and the functions.

## Deploy

Create a Firebase project with Email link sign-in enabled under Authentication, then:

```bash
firebase use --add                       # pick your Firebase project
cp app/.env.example app/.env.local       # fill in the web app config from the Firebase console
.venv/bin/python scripts/seed.py --project <project-id>   # load badges and ranks
firebase deploy --only firestore,functions,hosting
```

## Not built yet

- Requirement text for each badge. Requirements are signed by number, with a link to the official text; storing the
  official text waits on licensing.
- Gemini requirement Q&A (waits on the official requirement text). Plan drafting is built.
- Automatic Scoutbook Plus import (needs Scouting America certification) and the blue card PDF.
- Offline sign-off at camp (data already caches locally for reading), payments, the public troop website.

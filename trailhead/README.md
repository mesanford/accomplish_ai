# Forthright

Forthright is the product's public name. The code, this folder and settings such as `TRAILHEAD_*` still use the
earlier working name, Trailhead.

Scouts BSA advancement planning on Firebase: a React web app, with the backend in Python. It follows the
[product spec](https://claude.ai/code/artifact/ddbc6f94-4646-412f-bc8c-4e52f42509b3). Phase 2 makes it usable by a
pilot troop: sign-in, invites, and screens for Scouts, parents, leaders and counselors. Phase 3 adds troop awards,
path templates, a Claude plan assistant and the Scoutbook Plus handoff report. Deploying is covered in
[DEPLOY.md](DEPLOY.md).

## What works today

| Piece                  | Where                              | What it does                                                                                                                                       |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app                | `app/`                             | Sign-in by email link, troop setup, roster and invites, Scout pages, path planner, badges, blue cards, counseling, events, messages                |
| Program content        | `functions/trailhead_core/content` | 143 merit badges (2026) with difficulty, Eagle status and timing constraints; rank timing rules                                                    |
| Rules engine           | `functions/trailhead_core`         | Checks a path to a rank: time in rank, badge counts, Eagle-required slots, tracking badges, prerequisites, age 18, workload; gives next steps      |
| Youth Protection       | `trailhead_core/ypt.py`            | Adds a parent or second trained adult to every adult–Scout message; blocks adults with expired training (parents with their own children excepted); no Scout-only conversations |
| Requirement versioning | `trailhead_core/versioning.py`     | Moves progress to a new requirement version only where wording is unchanged; flags the rest                                                        |
| Security rules         | `firestore.rules`                  | Troop- and role-scoped access, append-only sign-offs, counselors limited to assigned badges, server-only messages, invites and feasibility         |
| Cloud Functions        | `functions/endpoints/`             | Troops, invites and Scouts; sign-offs; blue card completion; attendance logs; path checks; YPT-checked messaging                                   |
| Merit badge guide      | `app/public/guide.html`            | The printable card and table field guide                                                                                                           |

## How people use it

1. A leader signs in and creates the troop. Leaders need a Youth Protection training expiry date.
2. On **Roster**, the leader adds Scouts (birth month and year, current rank) and creates invite links for parents,
   Scouts 13 and older, counselors and other leaders. Each link works once and expires in 30 days.
3. Parents open their link, sign in, read a notice about what Trailhead keeps and tick a box to agree, then see their
   Scouts. They can add a sibling themselves, agreeing to the notice again. A parent can withdraw consent from the
   Scout's page, which tells leaders to remove the records. A leader adding a Scout who may be under 13 confirms the
   family's permission. The server records each (`troops/{t}/consents/{scoutId}`, server-written, visible to leaders
   and the family) with the notice version, in `CONSENT_NOTICE_VERSION`. Bump it when the notice's meaning changes.
   The confirmation email COPPA's "email plus" method calls for isn't sent yet: `send_consent_confirmation` in
   `functions/endpoints/consent.py` is the one place to add it.
4. A Scout or parent plans a **path** to a rank. The planner checks it live and explains what won't work.
5. From **Badges**, they start a blue card. A leader approves it and assigns a counselor under **Blue cards**.
6. The counselor signs requirements and marks the badge complete under **Counseling**.
7. Leaders sign off rank requirements and record ranks on a Scout's page, and take attendance at **Events**.
8. In the path planner, **Draft with AI** turns a goal in plain words into a plan. Claude drafts it and the plan
   checker verifies it before anyone sees it. Leaders can also publish **Path templates** that Scouts start from.
9. Leaders create **Troop awards** with their own requirements. Editing one makes a new version; a leader moves
   each Scout to it, keeping what still matches and flagging what changed. Signing the last requirement completes it.
10. **Scoutbook** gives the advancement chair a report of everything signed since the last one, grouped by Scout,
    to enter in Scoutbook Plus. Troop awards are left out, since Scoutbook doesn't know them.
11. Counselors outside the troop need no account: under **Blue cards** a leader assigns "Someone outside the troop"
    by name and signs requirements for them. A Scout's **paper blue card** can be recorded by a leader with each
    signed requirement, its date and a photo; unlike earlier advancement it goes in the next Scoutbook report, counted
    by when it was entered. Card photos live in Cloud Storage under `cards/{troop}/{scout}/{card}/`.
12. **Deleting data.** A leader uses *Remove from troop* on a Scout's page (`remove_scout`) to erase the Scout's
    records, files and login access. Anyone can delete their own account from the **Account** page
    (`delete_account`); a Scout's records stay with the troop, and the last leader of a troop that still has
    members is asked to make another leader first. Only the server deletes these documents; the rules refuse
    client deletes.
13. **Retention.** A nightly job (`apply_retention`, see [DEPLOY.md](DEPLOY.md#data-retention)) deletes data on the
    privacy policy's schedule. *Mark as left the troop* on a Scout's page (`mark_scout_left`) starts a 12-month
    clock, after which the Scout's records are deleted (or 12 months after they turn 18, if sooner). Leaders can
    delete a "Join us" request at any time (`delete_lead`). Opening a troop calls `record_activity`, which keeps
    `troops/{t}.lastActiveAt`; a troop nobody opens for 18 months is deleted (dry run until the operator turns it on).

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
firebase deploy --only firestore,storage,functions,hosting
```

## Not built yet

- Claude requirement Q&A. Plan drafting and the website About helper are built.
- Automatic Scoutbook Plus import (needs Scouting America certification) and the blue card PDF.
- Offline sign-off at camp (data already caches locally for reading) and payments.
- Deleting a whole troop yourself. Leaders can remove a Scout (`remove_scout`) and anyone can delete their account (`delete_account`), but removing a troop and its website is still by email request, as the privacy policy explains.
- Removing a Scout takes every live website photo that shows them down, but keeps draft photos that also show other Scouts. Their tag points at nobody, so the next publish leaves those photos out until a leader fixes the tags.

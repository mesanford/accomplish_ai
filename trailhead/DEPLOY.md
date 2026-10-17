# Deploying Trailhead

Trailhead runs as two Firebase projects: **staging** for trying changes and **production** for the pilot troop.
Do the one-time setup for each, then deploy with `scripts/deploy.sh`.

## One-time setup (for each project)

1. **Create the project** in the [Firebase console](https://console.firebase.google.com). Use names like
   `trailhead-staging` and `trailhead-prod`.
2. **Upgrade to the Blaze plan.** Cloud Functions require it. Set a budget alert in Google Cloud Billing; a pilot
   troop should cost a few dollars a month or less.
3. **Firestore:** create the database in Native mode, location `nam5 (us-central)`.
4. **Authentication:** under Sign-in method, enable **Email/Password** and turn on **Email link (passwordless
   sign-in)**. Under Settings → Authorized domains, add any custom domain you'll serve the app from.
5. **Web app config:** under Project settings → Your apps, add a Web app. Copy its config into
   `app/.env.staging` or `app/.env.production`, using `app/.env.example` as the template. These files are not
   committed.
6. **Link the project locally:** put the project ids in `.firebaserc` under `staging` and `production`, then run
   `firebase login` if you aren't signed in.
7. **Claude writing help:** see the Claude section below. Every project needs the `ANTHROPIC_API_KEY` secret set
   before functions deploy.

## Deploy

```bash
scripts/deploy.sh staging      # try it here first
scripts/deploy.sh production
```

The script runs every test, builds the app for that project, loads the badge and rank content, and deploys the
security rules, indexes, functions and hosting. The app is then live at `https://<project-id>.web.app`.

## After the first production deploy

- Sign in at the app's address and create the pilot troop. You become its first leader.
- Add Scouts on the Roster page and send invite links to parents, counselors and other leaders.

## Claude writing help

"Draft with AI" in the path planner, and the About us helper on the troop website, call Claude through the
Anthropic API from the Cloud Functions. Locally and in the emulator they use built-in practice drafts instead, so
development needs no API key (`scripts/test.sh` gives the emulator a stand-in key).

1. Create an API key in the [Anthropic Console](https://console.anthropic.com) for this project. Use a separate
   key per project so spending is easy to see and a leaked key is easy to revoke.
2. Store it as a Cloud Functions secret (this enables Secret Manager on first use):
   `firebase functions:secrets:set ANTHROPIC_API_KEY --project <project-id>`, then paste the key when asked.
3. Optional: set `ANTHROPIC_MODEL` in `functions/.env.<project-id>` (default `claude-sonnet-5-5`).
   If the key is not scoped to a workspace, also set `ANTHROPIC_WORKSPACE_ID` there; it is sent with every request.
4. To keep a project on the practice drafts, set `TRAILHEAD_FAKE_LLM=1` in its `functions/.env.<project-id>`. The
   secret must still exist, so store any stand-in value. Staging does this.

Each person can make 5 drafts a day and each troop 100 a month, which caps Claude at about $4 a troop a month. Usage counts are kept in `troops/{t}/usage`.

## Data retention

The `apply_retention` function runs every night at 03:30 US Central time (Cloud Scheduler; the first deploy may
ask to enable the Cloud Scheduler API). It enforces the privacy policy's retention schedule:

| What                    | Deleted                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| A Scout's records       | 12 months after a leader marks them as left the troop, or after they turn 18, if sooner |
| A conversation          | 24 months after its last message (the messages and the conversation)                    |
| A "Join us" request     | 12 months after it was sent                                                             |
| Daily AI draft counters | after 30 days                                                                           |
| A whole troop           | 18 months after anyone in it last opened the app (see the switch below)                 |

Each run is capped (20 Scouts, 200 conversations, 2 troops, and about 7 minutes); anything left over is picked up
the next night. The logs have one line per rule per troop (`retention rule=...`), with ids and counts, never names.

**Whole-troop deletion starts in dry run.** Until you turn it off, the job only logs what it would delete, as a
warning: `retention rule=troop troop=<id> dry_run=True last_active=<date> would_delete={...}`. Read those lines in
the Cloud Functions logs first. To turn dry run off, add this line to `functions/.env.<project-id>` and deploy the
functions again:

```
TRAILHEAD_RETENTION_DRY_RUN=false
```

Any other value, or none, keeps dry run on. To turn it back on, remove the line (or set it to `true`) and deploy.
The switch only affects whole troops; the other rules always run. Troops created before activity tracking existed
start their 18-month clock on the job's first run (`activityTrackedSince`), so no troop is deleted sooner than 18
months after this is first deployed.

Before the first production deploy, note that the Scout rule applies to existing records straight away: a Scout who
turned 18 more than 12 months ago is deleted on the first night.

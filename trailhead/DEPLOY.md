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
8. **Card payment secrets:** every project needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set before
   functions deploy, even while payments are off. Store a stand-in such as `unset` until Stripe is set up (see
   Card payments below).

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
| A Scout account entry   | 7 years after its date, even after the Scout was removed (then kept anonymized)         |

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

## Card payments (Stripe Connect)

Off by default (`PAYMENTS_MODE=off` in `functions/.env.<project-id>`): every payment screen is hidden and every
payment call refuses. Each troop, or its chartered organization, owns its own Stripe account and money; Forthright
is the Connect platform, never holds funds and takes no fee.

1. **Platform account.** Create a Stripe account for Forthright, then turn on Connect (Dashboard, Connect, Get
   started). Choose **Standard** accounts. Fill in the platform profile and branding Stripe shows troops during
   onboarding. Do all of this in test mode first.
2. **Webhook endpoint.** Dashboard, Developers, Webhooks, Add endpoint, choose **Events on connected accounts**:
   - URL: `https://us-central1-<project-id>.cloudfunctions.net/stripe_webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `account.updated`,
     `account.application.deauthorized`.
   Copy its signing secret (`whsec_...`).
3. **Secrets** (copy each value, then run; nothing is echoed or saved in the shell history):
   ```bash
   pbpaste | firebase functions:secrets:set STRIPE_SECRET_KEY --data-file - --project <project-id>
   pbpaste | firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --data-file - --project <project-id>
   ```
   Use the test key (`sk_test_...`, or a restricted `rk_test_...` key) with `PAYMENTS_MODE=test` and the live key
   with `PAYMENTS_MODE=live`. A key for the other mode is refused, so test setup can never take real money. Test and
   live have separate webhook endpoints and secrets.
4. **Turn it on:** set `PAYMENTS_MODE=test` (staging) or `live` (production) in `functions/.env.<project-id>`, and
   deploy the functions. The treasurer then uses **Connect Stripe** on Account settings.

Webhook answers: 400 means a bad signature, 500 asks Stripe to retry (an error, or a refund that arrived before its
payment), 200 everything else. A session whose account, amount or mode doesn't match its record is never credited;
it is marked "Needs the treasurer". Card payment records follow the ledger's 7-year retention.

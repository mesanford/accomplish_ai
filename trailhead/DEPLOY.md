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
security rules, indexes, functions and hosting. The app is then live at `https://<project-id>.web.app`, and
production is also at `https://forthrightapp.com` (see below).

Production deploys only what's on GitHub: the script stops unless you're on `main`, nothing is uncommitted and `main`
matches `origin/main`. After a production deploy it tags the commit `deploy/production-<UTC date and time>` and pushes
the tag, so `git tag -l 'deploy/production-*'` lists every production deploy and the newest is what's live. Staging
deploys whatever is in the folder.

Pushes and pull requests that touch `trailhead/` also run the quick checks on GitHub (`.github/workflows/forthright.yml`):
lint, Python unit tests, and the app's typecheck, unit tests and build. Nothing deploys from GitHub, and the emulator
tests only run locally, in `scripts/test.sh`.

## Where each project is served

| Project    | Firebase project id    | Address                             |
| ---------- | ---------------------- | ----------------------------------- |
| Staging    | `scout-app-d2282`      | `https://scout-app-d2282.web.app`   |
| Production | `scout-app-prod-d6a66` | `https://forthrightapp.com`         |

`forthrightapp.com` is a custom domain on production's default Hosting site, so one address serves both the
marketing pages (`/`, `/features`, `/pilot`, `/privacy`) and the signed-in app: `/` shows the marketing page to
visitors who aren't signed in and their troops to those who are. Things that depend on the domain:

- `APP_URL=https://forthrightapp.com` in `functions/.env.scout-app-prod-d6a66`. Email, push and calendar links use it.
- The canonical and share tags in `app/index.html` and `app/src/pages/Features.tsx` name `forthrightapp.com`.
- `forthrightapp.com` must be listed under Authentication → Settings → Authorized domains, or email-link sign-in fails
  there. `VITE_FIREBASE_AUTH_DOMAIN` stays `scout-app-prod-d6a66.firebaseapp.com`.
- Troops can't claim `forthrightapp.com`, `www.forthrightapp.com` or any subdomain of it for their own website
  (`app/src/lib/domains.ts` and the backend domain check). Troop domains use a separate Hosting site (see Troop
  domains below).

If the domain ever changes, update all of these together.

## After the first production deploy

- Sign in at the app's address and create the pilot troop. You become its first leader.
- Add Scouts on the Roster page and send invite links to parents, counselors and other leaders.

## Installing the app and push notifications

The app is installable (web app manifest and a service worker). Nothing to configure for that. Push notifications need
three things per project; without them the "Notify me on this device" option is hidden and nothing is sent.

1. Firebase console > Project settings > Cloud Messaging. Under **Web Push certificates**, choose **Generate key pair**
   and copy the key pair value into `VITE_FCM_VAPID_KEY` in `app/.env.<alias>`. Copy the **Sender ID** into
   `VITE_FIREBASE_MESSAGING_SENDER_ID` in the same file. Leave both empty to keep push off.
2. Make sure the **Firebase Cloud Messaging API** is enabled for the Google Cloud project (it is by default).
3. To send for real, add `PUSH_MODE=send` to `functions/.env.<project-id>` and deploy. Any other value, or none, only
   logs how many devices would have been notified (like `EMAIL_MODE`). `APP_URL` must be set, as for email, because
   notification links use it.

Deploy the indexes too: sign-in on a shared device looks up a device token across logins, which needs the single-field
`devices` index in `firestore.indexes.json`.

## Weekly digest and event alerts

Nothing to configure. `send_weekly_digest` (Sundays at 17:00 Central) and the `on_event_written_alerts` trigger deploy
with the other functions and send through the same email and push settings (`EMAIL_MODE`, `PUSH_MODE`, `APP_URL`,
the `RESEND_API_KEY` secret). On staging, where `EMAIL_MODE` is `log`, they only log what they would send.

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

## Troop domains (a troop's own web address)

A leader can show the troop website at a domain they own, such as `troop101springfield.org` (Website page, "Use your
own domain"). Forthright attaches the domain to one dedicated Hosting site; every request to that site goes to the
`site_shell` function, which looks the request's host up in `domains/{host}` and serves that troop's published site at
`/` and `/{page}`. Unknown hosts get a plain "This site isn't set up yet" page. The feature is **off until you turn it
on**, and staging and tests never call the live API.

### One-time setup (per project)

1. **Create the Hosting site** (once; the id must be 30 characters or fewer and globally unique):
   `firebase hosting:sites:create forthright-troops --project <project-id>`. Do not connect any domain to it by hand.
2. **Give the functions' service account permission.** The functions run as the project's default compute service
   account (`<project-number>-compute@developer.gserviceaccount.com`; check under Cloud Functions, `add_domain`,
   Details). Grant it **Firebase Hosting Admin** (`roles/firebasehosting.admin`), which covers the custom-domain
   calls. Nothing broader is required:
   `gcloud projects add-iam-policy-binding <project-id> --member=serviceAccount:<account> --role=roles/firebasehosting.admin`.
   The Firebase Hosting API (`firebasehosting.googleapis.com`) must be enabled (it is for any Firebase project).
3. **Settings** in `functions/.env.<project-id>` (the production file has them commented out):

   | Setting                 | Meaning                                                                                                   |
   | ----------------------- | --------------------------------------------------------------------------------------------------------- |
   | `DOMAINS_MODE`          | `off` (default: leaders are told it isn't turned on), `log` (a built-in fake; nothing is called) or `live` |
   | `TRAILHEAD_TROOPS_SITE` | The Hosting site id from step 1, for example `forthright-troops`                                          |
   | `TRAILHEAD_APP_HOSTS`   | Optional, comma-separated extra hostnames to treat as Forthright's own (not a troop's domain)             |

   Try `DOMAINS_MODE=log` on staging first: a domain whose first label ends in `-dns`, `-cert` or `-live` shows that
   stage, so you can click through every state without owning a domain.
4. **Deploy.** `scripts/deploy.sh` now also runs `scripts/deploy_troops_site.sh`, which copies the built app without
   `index.html` into `app/dist-troops` and deploys it to the troops site with two rewrites (`/cal/**` to
   `calendar_feed`, everything else to `site_shell`). It skips quietly when `TRAILHEAD_TROOPS_SITE` is not set. The
   `sync_domains` scheduled function (every hour) is deployed with the other functions.

### How a leader's domain goes live

The leader enters the domain; Forthright registers it with the Hosting API and shows the exact DNS records to add:
a TXT record that proves ownership, A records that point the domain at Hosting, and sometimes a certificate (ACME)
record. Status moves **waiting for DNS, verifying, issuing certificate, live**. The leader presses "Check again", and
`sync_domains` checks hourly. The certificate usually takes under an hour and can take 24. A domain still not live
after 7 days is detached and the Website page tells the leader. Removing the domain, unpublishing the site and the
18-month troop deletion all detach it. If Hosting refuses to release a domain, the record is kept as `pendingRemoval`
(and no longer served) and the hourly job retries.

### Limits and costs

- Each custom domain belongs to one Hosting site. Hosting documents a limit of **20 subdomains per apex domain** (for
  certificate minting); troops use different apex domains, so this does not bind. No overall per-site domain limit
  is documented: before onboarding many troops, ask Firebase support for the figure for your project, and watch the
  `add_domain` logs for quota errors. A project may have up to 36 Hosting sites.
- Hosting charges for storage and data transfer only (10 GB/month free, then $0.15 per GB on Blaze), plus one
  `site_shell` invocation per page view. Nothing is charged per domain.
- If the limits ever bind, put a CDN or proxy in front instead (Cloudflare for SaaS custom hostnames, or a Cloud Load
  Balancer with Certificate Manager). `endpoints/hosting_client.py` is the only file that talks to the provider.

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

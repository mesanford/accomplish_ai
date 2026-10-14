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
7. **Gemini plan assistant (optional):** see the Gemini section below.

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

## Gemini plan assistant

"Draft with AI" in the path planner calls Gemini on Vertex AI from the Cloud Functions. No API key is involved;
the functions use their own service account. Locally, and in the emulator, it uses a built-in practice planner
instead, so development needs no Google credentials.

1. Enable the Vertex AI API: `gcloud services enable aiplatform.googleapis.com --project <project-id>`.
2. Let the functions call it. 2nd-gen functions run as the default compute service account unless you set one:
   `gcloud projects add-iam-policy-binding <project-id> --member serviceAccount:<project-number>-compute@developer.gserviceaccount.com --role roles/aiplatform.user`.
3. Optional settings, as function environment variables: `GEMINI_MODEL` (default `gemini-2.5-flash`) and
   `GEMINI_LOCATION` (default `us-central1`). Check the model is offered in that region.
4. After the first deploy, try one draft in staging. The real Gemini call has only been tested against the
   practice planner so far.

Each person can make 20 drafts a day, so cost stays small. Usage counts are kept in `troops/{t}/usage`.

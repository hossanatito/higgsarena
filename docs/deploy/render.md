# Deploy HiggsArena to Render

Render runs the same Docker image as the VPS setup, so nothing behaves differently from a self-hosted install. The included `render.yaml` Blueprint creates everything: the web service, a Postgres database and a per-minute sweep.

## 1. Create the Blueprint

1. Push your fork to GitHub.
2. In Render, choose **New → Blueprint** and pick the repository.
3. Render reads `render.yaml` and asks for two values:
   - `OWNER_EMAILS`: your email (comma-separated for more owners).
   - `SWEEP_URL`: leave it for now if you don't know the address yet. You'll set it in step 3.
4. Apply. Render generates `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` for you and connects `DATABASE_URL` to the new database.

The container applies migrations and syncs the model catalog every time it starts, then serves on the address Render gives you (`https://<name>.onrender.com`). `APP_URL` defaults to that address.

Copy `ENCRYPTION_KEY` from the service's **Environment** tab and keep it safe outside Render. Without it, saved keys can't be decrypted.

## 2. Sign in

Open the site and **Create an account** with an email from `OWNER_EMAILS`. You become the owner.

## 3. Turn on the sweep

Open the **higgsarena-sweep** cron job → **Environment**, set `SWEEP_URL` to `https://<your-service>.onrender.com/api/cron/sweep`, and save. It runs every minute and exits; Render bills only the seconds it runs.

## 4. Custom domain

Add the domain under the web service's **Settings → Custom Domains**, then set `APP_URL` to `https://your-domain` and update `SWEEP_URL` to match. Update the callback URLs in Google, GitHub and the Higgsfield webhook settings too.

## Webhooks, email and storage

Same as any install: webhook URL `https://<your-domain>/api/webhooks/higgsfield` in the Higgsfield Console with the signing secret saved in **Admin → API keys**; email and storage under **Admin → Settings**.

## Plans and backups

- The free Postgres plan expires after 30 days. Use a paid plan for real work; paid plans include daily backups and point-in-time recovery.
- The `starter` web plan keeps the service always on. Free web services sleep, which delays webhooks and the first page load.

## Updating

Render redeploys on every push to the connected branch. Migrations run when the new container starts.

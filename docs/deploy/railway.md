# Deploy HiggsArena to Railway

Railway builds the same Docker image as the VPS setup. You create two services from your fork: the app, and a small cron service that calls the sweep.

## 1. App and database

1. **New Project → Deploy from GitHub repo** and pick your fork. Railway uses `railway.json` (Dockerfile build, health check on `/api/health`).
2. In the project, **+ Create → Database → PostgreSQL**.
3. Open the app service → **Variables** and add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (must be exactly 32 bytes) |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `OWNER_EMAILS` | Your email, comma-separated for more owners |
| `TRUST_PROXY` | `true` |

4. **Settings → Networking → Generate Domain**. `APP_URL` defaults to that domain, so you don't need to set it unless you add a custom one.

The container applies migrations and syncs the model catalog on every start. Keep `ENCRYPTION_KEY` somewhere safe outside Railway.

## 2. Sign in

Open the domain and **Create an account** with an email from `OWNER_EMAILS`. You become the owner.

## 3. The sweep

1. **+ Create → GitHub Repo**, pick the same fork again, and name the service `sweep`.
2. In its **Settings → Config-as-code**, set the file path to `railway.sweep.json`. It builds `scripts/sweep.Dockerfile` (just curl) and runs every 5 minutes, Railway's shortest cron interval.
3. In its **Variables**, add `CRON_SECRET` as `${{higgsarena.CRON_SECRET}}` (use your app service's name) and `SWEEP_URL` as `https://<your-domain>/api/cron/sweep`.

With webhooks set up, jobs still finish right away; the sweep is the safety net and runs mirroring and clean-up.

## 4. Custom domain

Add it under the app's **Settings → Networking**, set `APP_URL` to `https://your-domain`, and update `SWEEP_URL` and the Google, GitHub and Higgsfield callback URLs.

## Webhooks, email and storage

Same as any install: webhook URL `https://<your-domain>/api/webhooks/higgsfield` with the signing secret saved in **Admin → API keys**; email and storage under **Admin → Settings**.

## Backups

Railway's Postgres has scheduled backups on paid plans (**Database → Backups**). You can also run `pg_dump "$DATABASE_URL"` from your machine with the public connection URL.

## Updating

Railway redeploys on every push. Migrations run when the new container starts.

# Deploy HiggsArena to Vercel

Vercel runs HiggsArena as serverless functions. It works well, with three things to plan for: a hosted Postgres, the per-minute sweep (a Pro plan feature), and a few serverless limits listed at the end.

If you want the simplest setup with no limits, use the [VPS guide](../../README.md#deploy-to-a-vps-with-docker) instead.

## What you need

- A Vercel account. **Pro** is recommended: Hobby only runs cron jobs once a day (see [The sweep](#the-sweep)).
- A Postgres database reachable from the internet. [Neon](https://neon.tech) from the Vercel Marketplace is the easiest; Supabase also works.
- Your fork of this repository on GitHub.

## 1. Create the database

In your Vercel project, open **Storage → Create Database → Neon**, and connect it to the project. Neon adds two variables:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | The pooled connection the app uses |
| `DATABASE_URL_UNPOOLED` | A direct connection, used only for migrations |

Using Supabase or another host? Set `DATABASE_URL` to the pooled (transaction mode) URL and `DATABASE_URL_UNPOOLED` to the direct one. HiggsArena already disables prepared statements, so poolers work.

## 2. Import the project

**Add New → Project**, pick your fork, keep the detected Next.js settings. `vercel.json` sets the build command to `pnpm vercel-build`, which applies migrations, syncs the model catalog, then builds.

## 3. Environment variables

Add these under **Settings → Environment Variables**, scoped to **Production**:

| Variable | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (must be exactly 32 bytes) |
| `CRON_SECRET` | `openssl rand -hex 24`. Vercel sends it to the cron route automatically |
| `OWNER_EMAILS` | Your email, comma-separated for more owners |
| `TRUST_PROXY` | `true` |
| `DATABASE_POOL_MAX` | `2`. Each function instance keeps its own small pool |
| `APP_URL` | Optional. Defaults to your production `*.vercel.app` address. Set it when you add a custom domain |

Optional, same as on any host: `RESEND_API_KEY` or `BREVO_API_KEY` and `EMAIL_FROM`, `GOOGLE_CLIENT_ID`/`SECRET`, `GITHUB_CLIENT_ID`/`SECRET`, `HF_API_KEY_ID`/`SECRET`, `HF_WEBHOOK_SECRET`. You can also enter the Higgsfield key, email and storage in the app after the first sign-in.

Keep `ENCRYPTION_KEY` somewhere safe outside Vercel. Without it, saved keys can't be decrypted.

**Preview deployments.** A preview build runs migrations too. Don't point previews at your production database: either leave the database variables scoped to Production only, or let the Neon integration create a database branch per preview.

## 4. Deploy and sign in

Deploy, then open the site and **Create an account** with an email from `OWNER_EMAILS`. You become the owner. If the site shows a server error right after deploy, open **Logs**: HiggsArena prints exactly which setting is missing.

## 5. Webhooks

In the Higgsfield Console, set the webhook URL to `https://<your-domain>/api/webhooks/higgsfield` and save the signing secret (`whsec_…`) in **Admin → API keys**. Webhooks matter more on Vercel than elsewhere: they finish jobs the moment Higgsfield is done, even when nobody has the studio open.

## The sweep

The sweep (`/api/cron/sweep`) finishes jobs whose webhook never arrived, copies outputs to your storage when mirroring is on, refreshes character training and expires old override requests.

- **Pro:** `vercel.json` already schedules it every minute. Nothing to do.
- **Hobby:** Vercel rejects a deployment whose cron runs more than once a day. Change the schedule in `vercel.json` to `"0 4 * * *"`, then turn on the included GitHub workflow for a 5-minute sweep: in your fork add the repository variable `SWEEP_URL` (`https://<your-domain>/api/cron/sweep`) and the secret `CRON_SECRET` (same value as in Vercel). See `.github/workflows/sweep.yml`.

Jobs started in an open studio tab still finish on time without the sweep, because the studio checks its own jobs.

## Serverless limits to know

- **Submission limit is per instance.** *Max simultaneous submissions* (Admin → Output) is enforced inside each function instance. Under load Vercel runs several, so the real total can be higher. HiggsArena still backs off and retries when Higgsfield's queue is full, with the same idempotency key, so nothing is charged twice.
- **Function time.** The sweep can run up to 300 seconds, which needs Fluid compute (on by default for new projects). Mirroring many long videos may take several sweeps; that's expected.
- **Uploads** go straight from the browser to Higgsfield through presigned URLs, so Vercel's 4.5 MB request limit does not apply.
- **Region.** Put functions in the same region as the database (**Settings → Functions → Region**). Every request talks to Postgres.
- **Rate limits** are stored in Postgres, so they hold across instances.

## Updating

Push to your production branch. The build applies new migrations before the new version goes live.

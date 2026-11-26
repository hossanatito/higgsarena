# Security

HiggsArena holds your Higgsfield API keys and controls spending, so security
issues matter. Thank you for helping keep it safe.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub Security Advisories](https://github.com/hossanatito/higgsarena/security/advisories/new).
Include steps to reproduce, the affected version and the impact. We aim to
reply within 3 working days and to ship a fix for confirmed high-severity
issues within 14 days.

## How HiggsArena protects you

- **Keys stay on the server.** Every Higgsfield call happens in server-only
  modules; importing them into browser code fails the build. The browser
  uploads media straight to a presigned URL and never sees a credential.
- **Encrypted at rest.** Higgsfield keys, webhook secrets, Resend, Brevo and
  S3 keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY`. Each
  ciphertext is bound to its row and purpose, so a copied value won't decrypt
  elsewhere. Secrets are write-only in the UI; only a hint like `a1b2…9f0e`
  is shown and no route returns a decrypted secret.
- **Safe defaults.** `pnpm run setup` generates fresh secrets. In production
  the server refuses to start with a missing or demo secret, an `http://`
  `APP_URL`, or `DEMO_MODE`. Nobody becomes owner by signing up first: owners
  come from `OWNER_EMAILS` (with a verified email) or `pnpm admin:promote`.
  Sign-up is invite-only by default.
- **Web protections.** Per-request nonce CSP, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, strict referrer and permissions policies; origin checks on every
  state-changing API route; Zod validation on every input (model params are
  checked against the catalog schema and unknown fields dropped); server-side
  authorization on every request; Postgres-backed rate limits for auth,
  generation, upload and estimate routes.
- **Webhooks.** Standard Webhooks signature check on the raw body, a 5-minute
  timestamp window, dedupe on `webhook-id`, `400` on failure. Polling remains a
  fallback.
- **SSRF.** Output mirroring fetches only `https://` URLs and resolves DNS
  through a filter that blocks private, loopback, link-local and CGNAT ranges,
  including after redirects.
- **Presets can't be bypassed.** Locked preset fields are applied on the
  server for every generation, estimate and approved override, so editing a
  request by hand doesn't change a locked value.
- **Read-only links.** A shared collection link carries a random 192-bit
  token; only its SHA-256 is stored, so the link is shown once. Public pages
  show finished media only (no costs, people, request IDs or settings, and
  prompts only if the owner allows), send `noindex` and `no-referrer`, are
  rate limited per IP, can expire, and stop working the moment the link is
  turned off or replaced.
- **Accountability.** An audit log records key changes, role changes,
  restriction edits, overrides, invitations, model toggles and settings
  changes, with actor, time, IP and before/after values (secrets redacted).

## Pre-deploy checklist

- [ ] `pnpm run setup --production` (or `scripts/setup.sh`) generated `.env`; no demo values remain
- [ ] `APP_URL` is your `https://` domain and DNS points at the server
- [ ] `OWNER_EMAILS` lists only people who should own the instance
- [ ] `.env` is readable only by the deploy user (`chmod 600 .env`) and is not committed
- [ ] Sign-up policy is **invite only** (or allowed domains) and email verification is **on**
- [ ] An email provider is configured and the test email arrives
- [ ] Postgres is not published to the network (the Compose file binds it to `127.0.0.1`)
- [ ] UFW allows only ports 22, 80 and 443; SSH uses keys only
- [ ] The Higgsfield webhook signing secret (`whsec_…`) is saved in Admin → API keys
- [ ] Nightly backups are running and you have tested a restore
- [ ] You know how to rotate `ENCRYPTION_KEY` (README → Key rotation)

## Reviews

- **Internal review, November 2026.** We went through authentication and
  session handling, role checks on every admin action and API route,
  organization scoping of every query, key encryption and redaction,
  webhook verification, SSRF filtering, upload limits, CSP and headers,
  preset lock enforcement and the public collection pages. `pnpm
  check:secrets` crawls the app as each role and fails if a secret appears
  in any response. Findings were fixed before release.
- **External review.** HiggsArena has not had an independent third-party
  audit yet. If you deploy it for a large team or sensitive work, we
  recommend one. Reports from such reviews are welcome through the process
  above.

## Supported versions

Security fixes go into the latest release. Upgrade with
`git pull && docker compose --profile production up -d --build`.

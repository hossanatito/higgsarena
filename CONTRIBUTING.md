# Contributing to HiggsArena

Thanks for helping. HiggsArena is a single Next.js app, so getting set up is quick.

## Development setup

```bash
pnpm install
pnpm run setup                 # .env with fresh secrets
# in .env: DEMO_MODE=true and OWNER_EMAILS=owner@demo.local
pnpm db:up                     # Postgres in Docker on 127.0.0.1:5432
pnpm db:migrate && pnpm db:seed
pnpm dev
```

### Work without a Higgsfield key

`scripts/mock-higgsfield.ts` is a local stand-in for the Higgsfield API. It
implements submit, status, cancel, delete, estimate, uploads and Soul ID, and
can send signed webhooks.

```bash
pnpm mock:higgsfield           # http://127.0.0.1:4010
# in .env:
HF_API_BASE_URL=http://127.0.0.1:4010
HF_API_KEY_ID=mock
HF_API_KEY_SECRET=mock-secret
```

Jobs finish in about 6 seconds. A prompt containing `fail` fails and `nsfw` is
moderated. A key secret of `bad` returns 401, `broke` returns 403. Video
outputs need `ffmpeg` installed. The mock only works in development; in
production `http://` media is always rejected.

## Before you open a pull request

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm check:secrets
```

CI runs the same checks plus a dependency audit, gitleaks secret scanning, and
a crawl of every page and API as each demo role to make sure no secret ever
appears in a response.

## Code map

| Path | What lives there |
| --- | --- |
| `src/lib/higgsfield/` | Server-only Higgsfield client, error mapping, output parsing, webhook verification |
| `src/lib/catalog/` | Seed catalog, docs parser, JSON-schema → form fields, param validation |
| `src/lib/policy/` | Restriction engine (pure) and its database loaders |
| `src/lib/generations/` | Submit / poll / finalize, overrides, characters, mirroring, cron sweep |
| `src/lib/crypto/vault.ts` | AES-256-GCM secrets vault |
| `src/app/(app)/` | Studio, Library, Characters, Settings, Docs, Admin |
| `src/app/api/` | Route handlers (generations, estimate, uploads, webhooks, cron, health) |
| `scripts/` | Setup, migrations, seed, CLI tools, mock API, catalog pull |

Rules of thumb:

- Anything that decrypts or uses a secret imports `server-only`.
- Validate every input with Zod on the server. Never trust IDs from the client alone.
- Admin mutations write to the audit log with before/after values.
- Keep UI states complete: loading skeleton, empty state, inline errors, blocked-by-rule.

## Adding or fixing a model

Models are data, not code. Each workflow has an endpoint, an output type and a
JSON input schema; the studio builds its form from that schema.

**For everyone (one install):** Admin → Settings → Model catalog lets the owner
edit a model's fields, or add a custom model by pasting the endpoint and the
"Complete JSON schema" from its Higgsfield docs page.

**For the project (everyone's installs):**

```bash
pnpm catalog:pull              # re-reads docs.higgsfield.ai and rewrites src/lib/catalog/seed-catalog.json
git diff src/lib/catalog/seed-catalog.json
pnpm test                      # the catalog tests check every schema renders
```

Open a pull request with the diff. Installs pick it up with **Sync catalog**,
which adds new models and refreshes unedited ones without touching anyone's
toggles. If a field renders badly, the mapping lives in
`src/lib/catalog/schema-to-fields.ts`.

## Database changes

Edit `src/lib/db/schema.ts`, then `pnpm db:generate` to create a migration in
`drizzle/`. Commit both. Migrations run automatically when the Docker
container starts.

## Commit style

Small, focused commits with a message that says why. Please don't commit
`.env` files, keys, or generated media.

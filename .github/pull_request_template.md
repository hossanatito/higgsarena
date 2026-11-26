## What this changes

<!-- A short description of the change and why. -->

## How it was tested

- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] Tried it in the browser (desktop and phone width)
- [ ] For catalog changes: `pnpm catalog:pull` output reviewed

## Security checklist

- [ ] No secrets, keys or `.env` files committed
- [ ] New server code that touches secrets imports `server-only`
- [ ] New inputs are validated with Zod on the server
- [ ] Admin actions write to the audit log

/**
 * Automated secret-leak check (PRD acceptance: no API response, page source or
 * client bundle contains a decrypted secret).
 *
 *   pnpm build && pnpm check:secrets                    # client bundle only
 *   BASE_URL=http://localhost:3000 pnpm check:secrets   # also crawl a running app
 *
 * With BASE_URL it signs in as every demo user (DEMO_MODE=true) and fetches
 * each page and JSON endpoint, failing if any secret from .env appears.
 */
import "dotenv/config";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SECRET_KEYS = ["BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "ENCRYPTION_KEY_PREVIOUS", "HF_API_KEY_SECRET", "HF_WEBHOOK_SECRET", "CRON_SECRET", "RESEND_API_KEY", "BREVO_API_KEY", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_SECRET", "POSTGRES_PASSWORD"];
// Demo defaults (e.g. the local Postgres password "higgsarena") are public and
// would match ordinary page text, so only real secret values are checked.
const PUBLIC_DEFAULTS = new Set(["higgsarena"]);
const secrets = SECRET_KEYS.map((k) => [k, process.env[k]?.trim()] as const).filter((e): e is readonly [string, string] => !!e[1] && e[1].length >= 8 && !PUBLIC_DEFAULTS.has(e[1]));
// Code that must never reach the browser.
const CANARIES = ["aes-256-gcm", "higgsarena:hf-key", "Authorization: `Key", "api.brevo.com/v3/smtp"];

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`✗ ${msg}`);
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function scan(label: string, text: string) {
  for (const [k, v] of secrets) if (text.includes(v)) fail(`${label} contains ${k}`);
}

const staticDir = path.join(process.cwd(), ".next", "static");
if (!existsSync(staticDir)) {
  console.error("No .next/static found. Run `pnpm build` first.");
  process.exit(1);
}
const files = walk(staticDir).filter((f) => /\.(js|css|html|json|map)$/.test(f));
for (const f of files) {
  const text = readFileSync(f, "utf8");
  scan(`client bundle ${path.relative(process.cwd(), f)}`, text);
  for (const c of CANARIES) if (text.includes(c)) fail(`client bundle ${path.relative(process.cwd(), f)} contains server-only code (${c})`);
}
console.log(`Scanned ${files.length} client files for ${secrets.length} secrets and ${CANARIES.length} server-only markers.`);

async function crawl(base: string) {
  const users = ["owner@demo.local", "admin@demo.local", "member@demo.local"];
  const pages = ["/", "/studio", "/library", "/characters", "/settings", "/docs", "/admin", "/admin/analytics", "/admin/models", "/admin/members", "/admin/teams", "/admin/restrictions", "/admin/overrides", "/admin/keys", "/admin/output", "/admin/audit", "/admin/settings", "/admin/presets", "/collections", "/api/generations", "/api/notifications", "/api/characters", "/api/health", "/api/admin/export/generations", "/api/admin/export/audit"];
  for (const email of users) {
    const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: process.env.APP_URL ?? base }, body: JSON.stringify({ email, password: "arena-demo-password" }) });
    if (!res.ok) {
      fail(`could not sign in as ${email} (HTTP ${res.status}); run with DEMO_MODE=true and pnpm db:seed`);
      continue;
    }
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    let n = 0;
    for (const p of pages) {
      const r = await fetch(`${base}${p}`, { headers: { cookie }, redirect: "manual" });
      scan(`${email} ${p} (HTTP ${r.status})`, await r.text());
      n++;
    }
    const est = await fetch(`${base}/api/estimate`, { method: "POST", headers: { cookie, origin: process.env.APP_URL ?? base, "content-type": "application/json" }, body: JSON.stringify({ modelSlug: "z-image-turbo", params: { prompt: "leak check" } }) });
    scan(`${email} POST /api/estimate`, await est.text());
    console.log(`Checked ${n + 1} responses as ${email}.`);
  }
}

(async () => {
  if (process.env.BASE_URL) await crawl(process.env.BASE_URL.replace(/\/$/, ""));
  if (failures) {
    console.error(`\n${failures} leak(s) found.`);
    process.exit(1);
  }
  console.log("✓ No secrets found.");
})();

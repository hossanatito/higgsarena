/**
 * pnpm setup               copy .env.example to .env with fresh secrets
 * pnpm setup --production  also asks for APP_URL, OWNER_EMAILS and ACME_EMAIL
 *
 * Existing values are kept; only missing or demo values are replaced.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const DEMO = new Set(["demo-only-change-me-demo-only-change-me", "ZGVtby1vbmx5LWNoYW5nZS1tZS1kZW1vLW9ubHktMDA=", "demo-cron-secret-change-me", "higgsarena"]);
const production = process.argv.includes("--production");

function setVar(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}
function getVar(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
}

async function main() {
  if (!existsSync(".env")) {
    copyFileSync(".env.example", ".env");
    console.log("Created .env from .env.example");
  }
  let env = readFileSync(".env", "utf8");
  const fresh: Record<string, () => string> = {
    BETTER_AUTH_SECRET: () => randomBytes(32).toString("base64url"),
    ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
    CRON_SECRET: () => randomBytes(32).toString("base64url"),
  };
  if (production) fresh.POSTGRES_PASSWORD = () => randomBytes(24).toString("base64url");
  for (const [key, make] of Object.entries(fresh)) {
    const current = getVar(env, key);
    if (!current || DEMO.has(current)) {
      env = setVar(env, key, make());
      console.log(`Generated ${key}`);
    }
  }

  if (production) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q: string, current?: string) => (await rl.question(`${q}${current ? ` [${current}]` : ""}: `)).trim() || current || "";
    let domain = await ask("Domain for the studio (e.g. studio.example.com)", getVar(env, "DOMAIN") || undefined);
    domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const owners = await ask("Owner email(s), comma-separated", getVar(env, "OWNER_EMAILS") === "you@example.com" ? undefined : getVar(env, "OWNER_EMAILS"));
    const acme = await ask("Email for Let's Encrypt certificates", getVar(env, "ACME_EMAIL") || owners.split(",")[0]);
    rl.close();
    if (!domain || !owners) throw new Error("Domain and owner email are required.");
    const pg = getVar(env, "POSTGRES_PASSWORD")!;
    env = setVar(env, "DOMAIN", domain);
    env = setVar(env, "APP_URL", `https://${domain}`);
    env = setVar(env, "OWNER_EMAILS", owners);
    env = setVar(env, "ACME_EMAIL", acme);
    env = setVar(env, "TRUST_PROXY", "true");
    env = setVar(env, "DEMO_MODE", "false");
    env = setVar(env, "DATABASE_URL", `postgres://higgsarena:${pg}@db:5432/higgsarena`);
  }
  writeFileSync(".env", env, { mode: 0o600 });
  console.log(production ? "\n.env is ready for production. Next: docker compose --profile production up -d --build" : "\n.env is ready. Next: pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

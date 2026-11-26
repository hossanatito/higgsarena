/**
 * Bundled into dist/cli.mjs for the Docker image, which has no dev tooling.
 *   node dist/cli.mjs boot              migrations + catalog sync (runs on container start)
 *   node dist/cli.mjs promote <email>   same as pnpm admin:promote
 *   node dist/cli.mjs keys:rotate       same as pnpm keys:rotate
 */
import path from "node:path";
import { runMigrations } from "./migrate";
import { seed } from "./seed";
import { rotateKeys } from "./rotate-keys";
import { getEnv, EnvError } from "../src/lib/env";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    getEnv();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(e.message);
      console.error("\nFix .env and restart. See README → Troubleshooting.");
      process.exit(1);
    }
    throw e;
  }
  if (cmd === "boot") {
    await runMigrations(process.env.DATABASE_URL, path.resolve(process.cwd(), "drizzle"));
    console.log("[boot] migrations applied");
    await seed();
    process.exit(0);
  }
  if (cmd === "keys:rotate") {
    console.log(`Re-encrypted ${await rotateKeys()} record(s).`);
    process.exit(0);
  }
  if (cmd === "promote") {
    process.argv = [process.argv[0]!, "promote", ...rest];
    await import("./promote");
    return;
  }
  console.error("Usage: node dist/cli.mjs boot | promote <email> [--role owner|admin|member] | keys:rotate");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

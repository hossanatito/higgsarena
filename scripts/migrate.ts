/** Apply database migrations. Used by `pnpm db:migrate` and on Docker boot. */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

export async function runMigrations(url = process.env.DATABASE_URL, folder = path.resolve(process.cwd(), "drizzle")) {
  if (!url) throw new Error("DATABASE_URL is not set. Run `pnpm setup` first.");
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder: folder });
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => console.log("Migrations applied."))
    .catch((e) => {
      console.error("Migration failed:", e instanceof Error ? e.message : e);
      if (String(e).includes("ECONNREFUSED")) console.error("Is Postgres running? Try `pnpm db:up`.");
      process.exit(1);
    });
}

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __hfDb?: DB; __hfSql?: postgres.Sql };

function create(): DB {
  const client = postgres(getEnv().DATABASE_URL, { max: 10, prepare: false });
  globalForDb.__hfSql = client;
  return drizzle(client, { schema, casing: "snake_case" });
}

/** Lazily connected so `next build` never needs a database. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    globalForDb.__hfDb ??= create();
    const value = Reflect.get(globalForDb.__hfDb, prop);
    return typeof value === "function" ? value.bind(globalForDb.__hfDb) : value;
  },
});

export async function pingDb(): Promise<boolean> {
  globalForDb.__hfDb ??= create();
  await globalForDb.__hfSql!`select 1`;
  return true;
}

export { schema };

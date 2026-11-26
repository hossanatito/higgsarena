import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Fixed-window counter stored in Postgres so limits hold across restarts and
 * across several app containers.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into app_rate_limit (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when app_rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else app_rate_limit.count + 1 end,
      window_start = case when app_rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else app_rate_limit.window_start end
    returning count, window_start
  `);
  const row = rows[0]!;
  const count = Number(row.count);
  const started = new Date(row.window_start).getTime();
  const retryAfter = Math.max(1, Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000));
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
}

export const LIMITS = {
  generate: { limit: 30, window: 60 },
  estimate: { limit: 120, window: 60 },
  upload: { limit: 60, window: 60 },
  keyTest: { limit: 10, window: 60 },
  email: { limit: 10, window: 300 },
} as const;

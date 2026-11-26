import "server-only";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { appRateLimit, generation, webhookEvent } from "@/lib/db/schema";
import { getOrg } from "@/lib/org";
import { pendingCharacters, refreshCharacters } from "./characters";
import { mirrorGeneration } from "./mirror";
import { expireOverrides } from "./overrides";
import { dueGenerations, refreshGeneration } from "./service";

export type SweepReport = {
  polled: number;
  finished: number;
  mirrored: number;
  overridesExpired: number;
  charactersChecked: number;
};

/**
 * Background housekeeping, called every minute by the cron container:
 * finish stuck jobs, mirror outputs, expire override requests.
 */
export async function runSweep(): Promise<SweepReport> {
  const report: SweepReport = { polled: 0, finished: 0, mirrored: 0, overridesExpired: 0, charactersChecked: 0 };
  const due = await dueGenerations(50);
  for (const row of due) {
    report.polled++;
    const updated = await refreshGeneration(row);
    if (["completed", "failed", "nsfw", "canceled", "error"].includes(updated.status)) report.finished++;
  }

  const org = await getOrg();
  if (org.settings.mirrorOutputs) {
    const toMirror = await db
      .select()
      .from(generation)
      .where(and(eq(generation.status, "completed"), isNull(generation.mirroredAt), isNull(generation.deletedAt), gt(generation.expiresAt, new Date())))
      .limit(10);
    for (const row of toMirror) {
      try {
        if (await mirrorGeneration(row)) report.mirrored++;
      } catch (e) {
        console.error(`[sweep] mirror ${row.id} failed:`, e instanceof Error ? e.message : e);
      }
    }
  }

  report.overridesExpired = await expireOverrides();
  const chars = await pendingCharacters();
  report.charactersChecked = chars.length;
  await refreshCharacters(chars);

  // Housekeeping for dedupe and rate-limit tables.
  await db.delete(webhookEvent).where(lt(webhookEvent.receivedAt, new Date(Date.now() - 3 * 24 * 3600 * 1000)));
  await db.delete(appRateLimit).where(lt(appRateLimit.windowStart, new Date(Date.now() - 24 * 3600 * 1000)));
  return report;
}

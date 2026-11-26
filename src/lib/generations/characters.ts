import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiCredential, character, member } from "@/lib/db/schema";
import { clientFor } from "@/lib/credentials";
import { HiggsfieldError } from "@/lib/higgsfield/errors";
import type { Ctx } from "@/lib/session";
import { resolveCredential, type KeySource } from "./service";

export type Character = typeof character.$inferSelect;

export async function createCharacter(
  ctx: Ctx,
  input: { name: string; modelVersion: "v1" | "v2" | "cinema"; imageUrls: string[]; keySource?: KeySource },
): Promise<{ ok: true; character: Character } | { ok: false; message: string }> {
  const cred = await resolveCredential(ctx, input.keySource);
  if ("error" in cred) return { ok: false, message: cred.error };
  try {
    const res = await clientFor(cred.row).createCharacter({ name: input.name, modelVersion: input.modelVersion, imageUrls: input.imageUrls });
    const [row] = await db
      .insert(character)
      .values({
        organizationId: ctx.org.id,
        memberId: ctx.member.id,
        referenceId: res.id,
        name: input.name,
        modelVersion: input.modelVersion,
        status: res.status,
        thumbnailUrl: res.thumbnailUrl ?? null,
        failReason: res.failReason ?? null,
        imageCount: input.imageUrls.length,
        keySource: cred.source,
      })
      .returning();
    return { ok: true, character: row! };
  } catch (e) {
    if (e instanceof HiggsfieldError) {
      if (e.code === "rate_limited") {
        return { ok: false, message: `Higgsfield is already training the maximum number of characters for this account. Try again in ${e.retryAfterSeconds ?? 60} seconds.` };
      }
      return { ok: false, message: e.message };
    }
    throw e;
  }
}

/** Poll Higgsfield for characters still training. */
export async function refreshCharacters(rows: Character[]): Promise<Character[]> {
  const pending = rows.filter((r) => r.referenceId && ["not_ready", "queued", "in_progress"].includes(r.status));
  if (!pending.length) return rows;
  const [orgCred] = await db.select().from(apiCredential).where(and(eq(apiCredential.ownerType, "org"), isNull(apiCredential.userId)));
  const updated = new Map<string, Character>();
  for (const r of pending) {
    let cred = orgCred;
    if (r.keySource === "personal") {
      const [m] = await db.select({ userId: member.userId }).from(member).where(eq(member.id, r.memberId));
      cred = m ? (await db.select().from(apiCredential).where(and(eq(apiCredential.ownerType, "user"), eq(apiCredential.userId, m.userId))))[0] : undefined;
    }
    if (!cred) continue;
    try {
      const res = await clientFor(cred).getCharacter(r.referenceId!);
      const [u] = await db
        .update(character)
        .set({ status: res.status, thumbnailUrl: res.thumbnailUrl ?? r.thumbnailUrl, failReason: res.failReason ?? null, updatedAt: new Date() })
        .where(eq(character.id, r.id))
        .returning();
      updated.set(r.id, u!);
    } catch (e) {
      console.error("[characters] status check failed", e instanceof HiggsfieldError ? `${e.status} ${e.code}` : e);
    }
  }
  return rows.map((r) => updated.get(r.id) ?? r);
}

export async function pendingCharacters(): Promise<Character[]> {
  return db.select().from(character).where(inArray(character.status, ["not_ready", "queued", "in_progress"]));
}

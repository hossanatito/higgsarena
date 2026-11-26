import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, preset } from "@/lib/db/schema";
import { hasRole, type Ctx } from "@/lib/session";
import { canUsePreset } from "./core";

export type Preset = typeof preset.$inferSelect;

export type ClientPreset = {
  id: string;
  name: string;
  description: string | null;
  modelSlug: string;
  promptTemplate: string | null;
  params: Record<string, unknown>;
  lockedFields: string[];
};

export const toClientPreset = (p: Preset): ClientPreset => ({
  id: p.id,
  name: p.name,
  description: p.description,
  modelSlug: p.modelSlug,
  promptTemplate: p.promptTemplate,
  params: p.params,
  lockedFields: p.lockedFields,
});

export async function presetsFor(ctx: Ctx): Promise<Preset[]> {
  const rows = await db.select().from(preset).where(and(eq(preset.organizationId, ctx.org.id), isNull(preset.archivedAt))).orderBy(desc(preset.updatedAt));
  return rows.filter((p) => canUsePreset(p, ctx.teamIds, hasRole(ctx.role, "admin")));
}

/** A preset the caller may use, or undefined. */
export async function usablePreset(ctx: Pick<Ctx, "org" | "teamIds" | "role">, id: string): Promise<Preset | undefined> {
  const [p] = await db.select().from(preset).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id)));
  if (!p || !canUsePreset(p, ctx.teamIds, hasRole(ctx.role, "admin"))) return undefined;
  return p;
}

export async function presetUsage(orgId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: generation.presetId, n: sql<number>`count(*)` })
    .from(generation)
    .where(and(eq(generation.organizationId, orgId), sql`${generation.presetId} is not null`))
    .groupBy(generation.presetId);
  return new Map(rows.map((r) => [r.id!, Number(r.n)]));
}

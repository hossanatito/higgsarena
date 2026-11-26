import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, team, teamMember } from "@/lib/db/schema";
import { ApiError, hasRole, type Ctx } from "@/lib/session";
import type { DisplayOutput } from "./mirror";
import type { Generation } from "./service";

/**
 * Members see their own generations. Admins see everyone's. Teams with a
 * shared library let teammates view (not change) each other's results.
 */
export async function visibleMemberIds(ctx: Ctx): Promise<string[] | "all"> {
  if (hasRole(ctx.role, "admin")) return "all";
  if (!ctx.teamIds.length) return [ctx.member.id];
  const shared = await db
    .select({ id: team.id })
    .from(team)
    .where(and(inArray(team.id, ctx.teamIds), eq(team.sharedLibrary, true)));
  if (!shared.length) return [ctx.member.id];
  const mates = await db
    .select({ memberId: teamMember.memberId })
    .from(teamMember)
    .where(inArray(teamMember.teamId, shared.map((s) => s.id)));
  return [...new Set([ctx.member.id, ...mates.map((m) => m.memberId)])];
}

/** Load a generation the caller may see; `write` requires ownership or admin. */
export async function loadGeneration(ctx: Ctx, id: string, opts: { write?: boolean } = {}): Promise<Generation> {
  const [row] = await db
    .select()
    .from(generation)
    .where(and(eq(generation.id, id), eq(generation.organizationId, ctx.org.id), isNull(generation.deletedAt)));
  if (!row) throw new ApiError(404, "Generation not found.");
  const isOwner = row.memberId === ctx.member.id;
  if (opts.write) {
    if (!isOwner && !hasRole(ctx.role, "admin")) throw new ApiError(404, "Generation not found.");
    return row;
  }
  if (isOwner || hasRole(ctx.role, "admin")) return row;
  const visible = await visibleMemberIds(ctx);
  if (visible !== "all" && !visible.includes(row.memberId)) throw new ApiError(404, "Generation not found.");
  return row;
}

export type ClientGeneration = {
  id: string;
  memberId: string;
  mine: boolean;
  modelSlug: string;
  modelName: string;
  outputType: string;
  status: Generation["status"];
  prompt: string | null;
  params: Record<string, unknown>;
  outputs: DisplayOutput[];
  estimatedCostUsd: string | null;
  costUsd: string | null;
  costUnknown: boolean;
  keySource: "org" | "personal";
  error: string | null;
  requestId: string | null;
  expiresAt: string | null;
  mirrored: boolean;
  favorite: boolean;
  createdAt: string;
  completedAt: string | null;
};

/** The only shape of a generation that leaves the server. */
export function toClient(row: Omit<Generation, "outputs"> & { outputs: DisplayOutput[] }, ctx: Pick<Ctx, "member">): ClientGeneration {
  return {
    id: row.id,
    memberId: row.memberId,
    mine: row.memberId === ctx.member.id,
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    outputType: row.outputType,
    status: row.status,
    prompt: row.prompt,
    params: row.params,
    outputs: row.outputs,
    estimatedCostUsd: row.estimatedCostUsd,
    costUsd: row.costUsd,
    costUnknown: row.costUnknown,
    keySource: row.keySource,
    error: row.error,
    requestId: row.requestId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    mirrored: !!row.mirroredAt,
    favorite: row.favorite,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

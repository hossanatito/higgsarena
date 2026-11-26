import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, policy, team } from "@/lib/db/schema";
import type { Ctx } from "@/lib/session";
import { effectivePolicy, type BudgetUsage, type EffectivePolicy, type PolicyInput, type Usage } from "./engine";

export type PolicyRow = typeof policy.$inferSelect;

export const ACTIVE_STATUSES = ["submitting", "queued", "in_progress"] as const;

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function dayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type Who = Pick<Ctx, "org" | "member" | "teamIds">;

export async function loadPolicyInputs(who: Who): Promise<PolicyInput[]> {
  const scopeIds = [who.org.id, who.member.id, ...who.teamIds];
  const rows = await db.select().from(policy).where(and(eq(policy.organizationId, who.org.id), inArray(policy.scopeId, scopeIds)));
  const teams = who.teamIds.length ? await db.select({ id: team.id, name: team.name }).from(team).where(inArray(team.id, who.teamIds)) : [];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  return rows
    .filter((r) => (r.scope === "org" ? r.scopeId === who.org.id : r.scope === "member" ? r.scopeId === who.member.id : who.teamIds.includes(r.scopeId)))
    .map((r) => ({
      scope: r.scope,
      scopeId: r.scopeId,
      scopeName: r.scope === "org" ? who.org.name : r.scope === "team" ? (teamName.get(r.scopeId) ?? "team") : "personal",
      monthlyBudgetUsd: r.monthlyBudgetUsd,
      dailyGenerationLimit: r.dailyGenerationLimit,
      maxConcurrentJobs: r.maxConcurrentJobs,
      allowedModels: r.allowedModels,
      maxVideoDuration: r.maxVideoDuration,
      maxBatchSize: r.maxBatchSize,
      maxUploadMb: r.maxUploadMb,
      paused: r.paused,
    }));
}

export async function effectiveFor(who: Who): Promise<EffectivePolicy> {
  return effectivePolicy(await loadPolicyInputs(who));
}

export async function usageFor(who: Who): Promise<Usage> {
  const [row] = await db
    .select({
      today: sql<number>`count(*) filter (where ${generation.createdAt} >= ${dayStart().toISOString()}::timestamptz and ${generation.status} not in ('error'))`,
      active: sql<number>`count(*) filter (where ${generation.status} in ('submitting','queued','in_progress'))`,
    })
    .from(generation)
    .where(eq(generation.memberId, who.member.id));
  return { generationsToday: Number(row?.today ?? 0), activeJobs: Number(row?.active ?? 0) };
}

/**
 * Money committed this month for an org-key scope: recorded cost of finished
 * jobs plus the estimate of jobs still running. Personal-key spend is excluded.
 */
const committed = sql<string>`coalesce(sum(case when ${generation.status} in ('submitting','queued','in_progress') then coalesce(${generation.estimatedCostUsd}, 0) else coalesce(${generation.costUsd}, 0) end), 0)`;

export async function spendForScope(scope: "org" | "team" | "member", scopeId: string, orgId: string, since = monthStart()): Promise<number> {
  const scopeFilter =
    scope === "org" ? eq(generation.organizationId, scopeId) : scope === "member" ? eq(generation.memberId, scopeId) : sql`${generation.teamIds} @> array[${scopeId}]::text[]`;
  const [row] = await db
    .select({ total: committed })
    .from(generation)
    .where(and(eq(generation.organizationId, orgId), eq(generation.keySource, "org"), gte(generation.createdAt, since), scopeFilter));
  return Number(row?.total ?? 0);
}

export async function budgetUsage(who: Who, eff: EffectivePolicy): Promise<BudgetUsage[]> {
  return Promise.all(
    eff.budgets.map(async (b) => ({ source: b.source, limitUsd: b.limitUsd, spentUsd: await spendForScope(b.source.scope, b.source.scopeId, who.org.id) })),
  );
}

export async function getPolicy(orgId: string, scope: "org" | "team" | "member", scopeId: string): Promise<PolicyRow | undefined> {
  const [row] = await db.select().from(policy).where(and(eq(policy.organizationId, orgId), eq(policy.scope, scope), eq(policy.scopeId, scopeId)));
  return row;
}


import "server-only";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgetOverride, generation, member, policy, team, user } from "@/lib/db/schema";

/**
 * Every figure here is computed from `generation.cost_usd`, the cost HiggsArena
 * recorded for each job (the estimate for completed jobs, $0 otherwise). The
 * Higgsfield Console remains the billing record.
 */

export type Filters = {
  from: Date;
  to: Date;
  teamId?: string;
  memberId?: string;
  modelSlug?: string;
  keySource?: "org" | "personal";
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const get = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const from = get("from") ? new Date(`${get("from")}T00:00:00Z`) : defaultFrom;
  const to = get("to") ? new Date(new Date(`${get("to")}T00:00:00Z`).getTime() + 86_400_000) : new Date(now.getTime() + 60_000);
  const keySource = get("key");
  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? now : to,
    teamId: get("team"),
    memberId: get("member"),
    modelSlug: get("model"),
    keySource: keySource === "org" || keySource === "personal" ? keySource : undefined,
  };
}

function where(orgId: string, f: Filters): SQL {
  const parts: SQL[] = [eq(generation.organizationId, orgId), gte(generation.createdAt, f.from), lt(generation.createdAt, f.to)];
  if (f.memberId) parts.push(eq(generation.memberId, f.memberId));
  if (f.modelSlug) parts.push(eq(generation.modelSlug, f.modelSlug));
  if (f.keySource) parts.push(eq(generation.keySource, f.keySource));
  if (f.teamId) parts.push(sql`${generation.teamIds} @> array[${f.teamId}]::text[]`);
  return and(...parts)!;
}

const spend = sql<string>`coalesce(sum(${generation.costUsd}), 0)`;

export async function summary(orgId: string, f: Filters) {
  const [row] = await db
    .select({
      spend,
      count: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${generation.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${generation.status} = 'failed')`,
      nsfw: sql<number>`count(*) filter (where ${generation.status} = 'nsfw')`,
      canceled: sql<number>`count(*) filter (where ${generation.status} = 'canceled')`,
      errored: sql<number>`count(*) filter (where ${generation.status} = 'error')`,
      active: sql<number>`count(*) filter (where ${generation.status} in ('submitting','queued','in_progress'))`,
      unknownCost: sql<number>`count(*) filter (where ${generation.costUnknown})`,
    })
    .from(generation)
    .where(where(orgId, f));
  const n = (v: unknown) => Number(v ?? 0);
  const done = n(row?.completed) + n(row?.failed) + n(row?.nsfw);
  return {
    spendUsd: Number(row?.spend ?? 0),
    count: n(row?.count),
    completed: n(row?.completed),
    failed: n(row?.failed),
    nsfw: n(row?.nsfw),
    canceled: n(row?.canceled),
    errored: n(row?.errored),
    active: n(row?.active),
    unknownCost: n(row?.unknownCost),
    successRate: done ? n(row?.completed) / done : null,
  };
}

export async function dailySpend(orgId: string, f: Filters) {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${generation.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      image: sql<string>`coalesce(sum(${generation.costUsd}) filter (where ${generation.outputType} <> 'video'), 0)`,
      video: sql<string>`coalesce(sum(${generation.costUsd}) filter (where ${generation.outputType} = 'video'), 0)`,
    })
    .from(generation)
    .where(where(orgId, f))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const map = new Map(rows.map((r) => [r.day, { image: Number(r.image), video: Number(r.video) }]));
  const out: { label: string; image: number; video: number }[] = [];
  for (let t = Date.UTC(f.from.getUTCFullYear(), f.from.getUTCMonth(), f.from.getUTCDate()); t < f.to.getTime(); t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ label: key, ...(map.get(key) ?? { image: 0, video: 0 }) });
  }
  return out.slice(-366);
}

export async function monthlySpend(orgId: string, f: Omit<Filters, "from" | "to">) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${generation.createdAt} at time zone 'UTC'), 'YYYY-MM')`,
      image: sql<string>`coalesce(sum(${generation.costUsd}) filter (where ${generation.outputType} <> 'video'), 0)`,
      video: sql<string>`coalesce(sum(${generation.costUsd}) filter (where ${generation.outputType} = 'video'), 0)`,
    })
    .from(generation)
    .where(where(orgId, { ...f, from, to: new Date(now.getTime() + 60_000) }))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const map = new Map(rows.map((r) => [r.month, { image: Number(r.image), video: Number(r.video) }]));
  const out: { label: string; image: number; video: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({ label: key, ...(map.get(key) ?? { image: 0, video: 0 }) });
  }
  return out;
}

export async function byModel(orgId: string, f: Filters) {
  const rows = await db
    .select({
      slug: generation.modelSlug,
      name: sql<string>`max(${generation.modelName})`,
      spend,
      count: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${generation.status} = 'completed')`,
      finished: sql<number>`count(*) filter (where ${generation.status} in ('completed','failed','nsfw'))`,
      avgCost: sql<string>`coalesce(avg(${generation.costUsd}) filter (where ${generation.status} = 'completed'), 0)`,
      avgEstimate: sql<string>`coalesce(avg(${generation.estimatedCostUsd}), 0)`,
      medianSeconds: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${generation.completedAt} - ${generation.createdAt}))) filter (where ${generation.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${generation.status} = 'failed')`,
      nsfw: sql<number>`count(*) filter (where ${generation.status} = 'nsfw')`,
      canceled: sql<number>`count(*) filter (where ${generation.status} = 'canceled')`,
    })
    .from(generation)
    .where(where(orgId, f))
    .groupBy(generation.modelSlug)
    .orderBy(sql`3 desc`);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    spendUsd: Number(r.spend),
    count: Number(r.count),
    avgCostUsd: Number(r.avgCost),
    avgEstimateUsd: Number(r.avgEstimate),
    successRate: Number(r.finished) ? Number(r.completed) / Number(r.finished) : null,
    medianSeconds: r.medianSeconds === null ? null : Number(r.medianSeconds),
    completed: Number(r.completed),
    failed: Number(r.failed),
    nsfw: Number(r.nsfw),
    canceled: Number(r.canceled),
  }));
}

export async function byMember(orgId: string, f: Filters) {
  const rows = await db
    .select({
      memberId: generation.memberId,
      email: sql<string>`max(${user.email})`,
      name: sql<string>`max(${user.name})`,
      spend,
      count: sql<number>`count(*)`,
      budget: sql<string | null>`max(${policy.monthlyBudgetUsd})`,
    })
    .from(generation)
    .innerJoin(member, eq(member.id, generation.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(policy, and(eq(policy.scope, "member"), eq(policy.scopeId, generation.memberId)))
    .where(where(orgId, f))
    .groupBy(generation.memberId)
    .orderBy(sql`4 desc`);
  return rows.map((r) => ({ memberId: r.memberId, email: r.email, name: r.name, spendUsd: Number(r.spend), count: Number(r.count), budgetUsd: r.budget === null ? null : Number(r.budget) }));
}

export async function byTeam(orgId: string, f: Filters) {
  const rows = await db.execute<{ team_id: string; name: string; spend: string; count: number; budget: string | null }>(sql`
    select t.id as team_id, t.name, coalesce(sum(g.cost_usd), 0) as spend, count(g.id)::int as count, max(p.monthly_budget_usd) as budget
    from ${team} t
    left join ${generation} g on g.team_ids @> array[t.id]::text[]
      and g.organization_id = ${orgId} and g.created_at >= ${f.from.toISOString()}::timestamptz and g.created_at < ${f.to.toISOString()}::timestamptz
      ${f.memberId ? sql`and g.member_id = ${f.memberId}` : sql``}
      ${f.modelSlug ? sql`and g.model_slug = ${f.modelSlug}` : sql``}
      ${f.keySource ? sql`and g.key_source = ${f.keySource}` : sql``}
    left join ${policy} p on p.scope = 'team' and p.scope_id = t.id
    where t.organization_id = ${orgId} ${f.teamId ? sql`and t.id = ${f.teamId}` : sql``}
    group by t.id, t.name
    order by 3 desc
  `);
  return rows.map((r) => ({ teamId: r.team_id, name: r.name, spendUsd: Number(r.spend), count: Number(r.count), budgetUsd: r.budget === null ? null : Number(r.budget) }));
}

/** Projected month-end org-key spend at the current pace. */
export async function burn(orgId: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ spend })
    .from(generation)
    .where(and(eq(generation.organizationId, orgId), eq(generation.keySource, "org"), gte(generation.createdAt, start)));
  const [orgPolicy] = await db.select({ budget: policy.monthlyBudgetUsd }).from(policy).where(and(eq(policy.scope, "org"), eq(policy.scopeId, orgId)));
  const spent = Number(row?.spend ?? 0);
  const elapsedDays = Math.max(1 / 24, (now.getTime() - start.getTime()) / 86_400_000);
  const totalDays = (end.getTime() - start.getTime()) / 86_400_000;
  return { spentUsd: spent, projectedUsd: (spent / elapsedDays) * totalDays, budgetUsd: orgPolicy?.budget ? Number(orgPolicy.budget) : null, daysLeft: Math.ceil((end.getTime() - now.getTime()) / 86_400_000) };
}

export async function overrideStats(orgId: string, f: Filters) {
  const [row] = await db
    .select({
      requests: sql<number>`count(*)`,
      approved: sql<number>`count(*) filter (where ${budgetOverride.status} = 'approved')`,
      declined: sql<number>`count(*) filter (where ${budgetOverride.status} = 'declined')`,
      expired: sql<number>`count(*) filter (where ${budgetOverride.status} = 'expired')`,
      pending: sql<number>`count(*) filter (where ${budgetOverride.status} = 'pending')`,
      approvedUsd: sql<string>`coalesce(sum(${budgetOverride.amountUsd}) filter (where ${budgetOverride.status} = 'approved'), 0)`,
    })
    .from(budgetOverride)
    .where(and(eq(budgetOverride.organizationId, orgId), gte(budgetOverride.createdAt, f.from), lt(budgetOverride.createdAt, f.to)));
  return {
    requests: Number(row?.requests ?? 0),
    approved: Number(row?.approved ?? 0),
    declined: Number(row?.declined ?? 0),
    expired: Number(row?.expired ?? 0),
    pending: Number(row?.pending ?? 0),
    approvedUsd: Number(row?.approvedUsd ?? 0),
  };
}

/** Rows behind the dashboards, for CSV export. */
export async function exportRows(orgId: string, f: Filters) {
  return db
    .select({
      id: generation.id,
      createdAt: generation.createdAt,
      completedAt: generation.completedAt,
      member: user.email,
      teams: generation.teamIds,
      model: generation.modelSlug,
      outputType: generation.outputType,
      status: generation.status,
      keySource: generation.keySource,
      estimatedCostUsd: generation.estimatedCostUsd,
      costUsd: generation.costUsd,
      costUnknown: generation.costUnknown,
      requestId: generation.requestId,
      overrideId: generation.overrideId,
    })
    .from(generation)
    .innerJoin(member, eq(member.id, generation.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(where(orgId, f))
    .orderBy(generation.createdAt)
    .limit(100_000);
}

/** RFC 4180 CSV, with formula-injection protection for spreadsheet apps. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n") + "\r\n";
}


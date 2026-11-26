import "server-only";
import { after } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, member, policy, team, user } from "@/lib/db/schema";
import { appUrl } from "@/lib/env";
import { templates } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email";
import { notifyAdmins, once } from "@/lib/notifications";
import { crossedThresholds } from "@/lib/policy/engine";
import { monthStart, spendForScope } from "@/lib/policy/load";
import { getOrg } from "@/lib/org";
import { mirrorGeneration } from "./mirror";
import type { Generation } from "./service";

/** Work that follows a terminal status: alerts, notices, mirroring. */
export async function afterFinish(row: Generation) {
  const org = await getOrg();
  await Promise.allSettled([
    budgetAlerts(row, org.id, org.name),
    failureRateAlert(row, org.id, org.settings.failureAlertThreshold),
    finishNotice(row),
  ]);
  if (row.status === "completed" && org.settings.mirrorOutputs) {
    const job = () =>
      mirrorGeneration(row).catch((e) =>
        console.error(`[mirror] ${row.id} failed (the sweep will retry):`, e instanceof Error ? e.message : e),
      );
    try {
      after(job);
    } catch {
      void job();
    }
  }
}

async function scopeLabel(scope: "org" | "team" | "member", id: string, orgName: string): Promise<string> {
  if (scope === "org") return orgName;
  if (scope === "team") {
    const [t] = await db.select({ name: team.name }).from(team).where(eq(team.id, id));
    return `Team ${t?.name ?? ""}`.trim();
  }
  const [m] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.id, id));
  return `Member ${m?.email ?? ""}`.trim();
}

async function budgetAlerts(row: Generation, orgId: string, orgName: string) {
  if (row.status !== "completed" || row.keySource !== "org" || !row.costUsd) return;
  const cost = Number(row.costUsd);
  if (cost <= 0) return;
  const month = monthStart().toISOString().slice(0, 7);
  const scopes: { scope: "org" | "team" | "member"; id: string }[] = [
    { scope: "org", id: orgId },
    { scope: "member", id: row.memberId },
    ...row.teamIds.map((id) => ({ scope: "team" as const, id })),
  ];
  for (const s of scopes) {
    const [p] = await db
      .select({ budget: policy.monthlyBudgetUsd })
      .from(policy)
      .where(and(eq(policy.scope, s.scope), eq(policy.scopeId, s.id)));
    if (!p?.budget) continue;
    const limit = Number(p.budget);
    const spent = await spendForScope(s.scope, s.id, orgId);
    for (const t of crossedThresholds(limit, spent - cost, spent)) {
      const pct = Math.round(t * 100);
      const label = await scopeLabel(s.scope, s.id, orgName);
      await once(`budget:${s.scope}:${s.id}:${month}:${pct}`, () =>
        notifyAdmins(
          orgId,
          {
            kind: "budget",
            title: `${label} reached ${pct}% of its monthly budget`,
            body: `$${spent.toFixed(2)} of $${limit.toFixed(2)} this month.`,
            href: "/admin/analytics",
          },
          templates.budget({
            scope: label,
            percent: pct,
            spent: `$${spent.toFixed(2)}`,
            limit: `$${limit.toFixed(2)}`,
            url: appUrl("/admin/analytics"),
          }),
        ),
      );
    }
  }
}

async function failureRateAlert(row: Generation, orgId: string, threshold: number) {
  if (row.status !== "failed" || threshold <= 0) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [stats] = await db
    .select({
      total: sql<number>`count(*) filter (where ${generation.status} in ('completed','failed','nsfw'))`,
      failed: sql<number>`count(*) filter (where ${generation.status} = 'failed')`,
    })
    .from(generation)
    .where(and(eq(generation.modelSlug, row.modelSlug), gte(generation.createdAt, since)));
  const total = Number(stats?.total ?? 0);
  const failed = Number(stats?.failed ?? 0);
  if (total < 5 || failed / total < threshold) return;
  const day = new Date().toISOString().slice(0, 10);
  await once(`model-failing:${row.modelSlug}:${day}`, () =>
    notifyAdmins(
      orgId,
      {
        kind: "model_failing",
        title: `${row.modelName} is failing often`,
        body: `${failed} of ${total} jobs failed in 24 hours.`,
        href: "/admin/models",
      },
      templates.modelFailing({
        model: row.modelName,
        rate: `${Math.round((failed / total) * 100)}%`,
        url: appUrl("/admin/models"),
      }),
    ),
  );
}

/** Optional per-user email for long video jobs. */
async function finishNotice(row: Generation) {
  if (row.outputType !== "video") return;
  if (Date.now() - row.createdAt.getTime() < 60_000) return;
  const [m] = await db
    .select({ notify: member.notifyOnFinish, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.id, row.memberId));
  if (!m?.notify) return;
  await sendEmail(m.email, templates.generationFinished({ model: row.modelName, status: row.status, url: appUrl("/library") }));
}

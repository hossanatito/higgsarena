import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgetOverride } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { templates } from "@/lib/email/templates";
import { notifyAdmins, notifyUsers } from "@/lib/notifications";
import type { Ctx } from "@/lib/session";
import { actorOf } from "@/lib/session";
import { contextForMember, prepareGeneration, submitGeneration, type KeySource } from "./service";

export type Override = typeof budgetOverride.$inferSelect;

const OVERRIDE_TTL_MS = 24 * 60 * 60 * 1000;
const usd = (v: string | number | null) => `$${Number(v ?? 0).toFixed(2)}`;

/**
 * A member asks to run one blocked job. The server re-checks the job itself,
 * so the amount and the rule come from the server, never from the browser.
 */
export async function requestOverride(
  ctx: Ctx,
  input: { modelSlug: string; params: Record<string, unknown>; keySource?: KeySource; presetId?: string; presetVars?: Record<string, string>; note?: string },
): Promise<{ ok: true; override: Override } | { ok: false; message: string }> {
  const result = await prepareGeneration(ctx, input);
  if (result.ok) return { ok: false, message: "This job is within budget now. Generate it directly." };
  if (result.kind !== "blocked" || !result.overridable || result.estimateUsd === null) {
    return { ok: false, message: result.kind === "blocked" ? result.reason.message : result.message };
  }
  const [row] = await db
    .insert(budgetOverride)
    .values({
      organizationId: ctx.org.id,
      memberId: ctx.member.id,
      modelSlug: input.modelSlug,
      params: input.params,
      keySource: input.keySource ?? "org",
      presetId: input.presetId ?? null,
      presetVars: input.presetVars ?? null,
      amountUsd: result.estimateUsd.toFixed(5),
      note: input.note?.slice(0, 500) || null,
      blockedBy: result.reason,
      expiresAt: new Date(Date.now() + OVERRIDE_TTL_MS),
    })
    .returning();
  await notifyAdmins(
    ctx.org.id,
    {
      kind: "override_requested",
      title: `${ctx.user.name || ctx.user.email} requested a budget override`,
      body: `${usd(result.estimateUsd)} · ${result.reason.message}`,
      href: "/admin/overrides",
    },
    templates.overrideRequested({
      member: ctx.user.name || ctx.user.email,
      model: input.modelSlug,
      amount: usd(result.estimateUsd),
      rule: result.reason.message,
      note: input.note,
      url: appUrl("/admin/overrides"),
    }),
  );
  return { ok: true, override: row! };
}

export async function decideOverride(
  admin: Ctx,
  overrideId: string,
  decision: "approve" | "decline",
  note?: string,
): Promise<{ ok: true; override: Override } | { ok: false; message: string }> {
  const [row] = await db
    .select()
    .from(budgetOverride)
    .where(and(eq(budgetOverride.id, overrideId), eq(budgetOverride.organizationId, admin.org.id)));
  if (!row) return { ok: false, message: "Override request not found." };
  if (row.status !== "pending") return { ok: false, message: `This request is already ${row.status}.` };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(budgetOverride).set({ status: "expired" }).where(eq(budgetOverride.id, row.id));
    return { ok: false, message: "This request expired after 24 hours." };
  }

  // Claim the decision first so two admins can't approve the same request twice.
  const [claimed] = await db
    .update(budgetOverride)
    .set({
      status: decision === "approve" ? "approved" : "declined",
      decidedBy: admin.user.id,
      decidedAt: new Date(),
      decisionNote: note?.slice(0, 500) || null,
    })
    .where(and(eq(budgetOverride.id, row.id), eq(budgetOverride.status, "pending")))
    .returning();
  if (!claimed) return { ok: false, message: "Another admin already decided this request." };

  const memberCtx = await contextForMember(row.memberId);
  let final = claimed;
  if (decision === "approve") {
    if (!memberCtx) {
      await db.update(budgetOverride).set({ status: "pending", decidedBy: null, decidedAt: null }).where(eq(budgetOverride.id, row.id));
      return { ok: false, message: "That member is suspended or no longer exists." };
    }
    const prepared = await prepareGeneration(
      memberCtx,
      { modelSlug: row.modelSlug, params: row.params, keySource: row.keySource, presetId: row.presetId ?? undefined, presetVars: row.presetVars ?? undefined },
      { skipBudget: true },
    );
    if (!prepared.ok) {
      await db.update(budgetOverride).set({ status: "pending", decidedBy: null, decidedAt: null }).where(eq(budgetOverride.id, row.id));
      return { ok: false, message: prepared.kind === "blocked" ? prepared.reason.message : prepared.message };
    }
    const gen = await submitGeneration(memberCtx, prepared.prepared, { overrideId: row.id });
    const [withResult] = await db
      .update(budgetOverride)
      .set({ resultGenerationId: gen.id, amountUsd: prepared.prepared.estimateUsd?.toFixed(5) ?? row.amountUsd })
      .where(eq(budgetOverride.id, row.id))
      .returning();
    final = withResult ?? final;
  }

  await audit(actorOf(admin), decision === "approve" ? "override.approve" : "override.decline", { type: "budget_override", id: row.id }, { status: "pending" }, {
    status: final!.status,
    amountUsd: final!.amountUsd,
    memberId: row.memberId,
    model: row.modelSlug,
    rule: row.blockedBy.rule,
    note: note ?? null,
  });

  if (memberCtx) {
    await notifyUsers(
      [memberCtx.user.id],
      {
        kind: decision === "approve" ? "override_approved" : "override_declined",
        title: decision === "approve" ? "Your override was approved" : "Your override was declined",
        body: `${row.modelSlug} · ${usd(final!.amountUsd)}${note ? ` · “${note}”` : ""}`,
        href: "/studio",
      },
      templates.overrideDecided({ approved: decision === "approve", model: row.modelSlug, amount: usd(final!.amountUsd), note, url: appUrl("/studio") }),
    );
  }
  return { ok: true, override: final! };
}

/** Requests expire after 24 hours if nobody acts. */
export async function expireOverrides(): Promise<number> {
  const rows = await db
    .update(budgetOverride)
    .set({ status: "expired" })
    .where(and(eq(budgetOverride.status, "pending"), lt(budgetOverride.expiresAt, new Date())))
    .returning({ id: budgetOverride.id, memberId: budgetOverride.memberId });
  return rows.length;
}


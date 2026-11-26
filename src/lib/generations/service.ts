import "server-only";
import { and, eq, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiCredential, generation, member, teamMember, user, type BlockReason, type OutputFile } from "@/lib/db/schema";
import { getOrg } from "@/lib/org";
import { deleteMirrored } from "./mirror";
import { getModel, type ModelRow } from "@/lib/catalog/repo";
import { promptOf, validateParams } from "@/lib/catalog/validate";
import { checkBudgets, checkRestrictions } from "@/lib/policy/engine";
import { budgetUsage, effectiveFor, usageFor } from "@/lib/policy/load";
import {
  clientFor,
  getOrgCredentialRow,
  getPersonalCredentialRow,
  markCredential,
  webhookSecrets,
  type CredentialRow,
} from "@/lib/credentials";
import { HiggsfieldError } from "@/lib/higgsfield/errors";
import { submitSemaphore, type StatusResult } from "@/lib/higgsfield/client";
import { isTerminal } from "@/lib/higgsfield/outputs";
import { appUrl, getEnv } from "@/lib/env";
import { insecureMediaOrigin } from "@/lib/env-check";
import type { Ctx } from "@/lib/session";
import { notifyAdmins, once } from "@/lib/notifications";
import { templates } from "@/lib/email/templates";
import { afterFinish } from "./after-finish";
import { usablePreset } from "@/lib/presets/repo";
import { applyPresetLocks, missingVariables, promptLocked } from "@/lib/presets/core";

export type Generation = typeof generation.$inferSelect;
export type KeySource = "org" | "personal";

export type Prepared = {
  model: ModelRow;
  params: Record<string, unknown>;
  credential: CredentialRow;
  keySource: KeySource;
  estimateUsd: number | null;
  costUnknown: boolean;
  presetId: string | null;
};

export type GenerateInput = {
  modelSlug: string;
  params: Record<string, unknown>;
  keySource?: KeySource;
  presetId?: string;
  presetVars?: Record<string, string>;
};

export type PrepareResult =
  | { ok: true; prepared: Prepared; remainingUsd: number | null }
  | { ok: false; kind: "invalid"; errors: Record<string, string>; message: string }
  | { ok: false; kind: "blocked"; reason: BlockReason; estimateUsd: number | null; overridable: boolean }
  | { ok: false; kind: "unavailable"; message: string };

/** Pick the key to use: personal only when admins allow it and the member saved one. */
export async function resolveCredential(ctx: Pick<Ctx, "org" | "user">, wanted?: KeySource): Promise<{ row: CredentialRow; source: KeySource } | { error: string }> {
  const personalAllowed = ctx.org.settings.personalKeysAllowed;
  const personal = personalAllowed ? await getPersonalCredentialRow(ctx.org.id, ctx.user.id) : undefined;
  if (wanted === "personal") {
    if (!personalAllowed) return { error: "Personal keys are turned off by your admins." };
    if (!personal) return { error: "Add your own Higgsfield key in Settings first." };
    return { row: personal, source: "personal" };
  }
  const org = await getOrgCredentialRow(ctx.org.id);
  if (org) return { row: org, source: "org" };
  if (personal && wanted !== "org") return { row: personal, source: "personal" };
  return { error: "No Higgsfield key is set up yet. An admin can add one in Admin → API keys." };
}

/**
 * Everything that must pass before a job is sent to Higgsfield:
 * model enabled, schema, restrictions, estimate, budget.
 */
export async function prepareGeneration(
  ctx: Ctx,
  input: GenerateInput,
  opts: { skipBudget?: boolean; skipEstimate?: boolean } = {},
): Promise<PrepareResult> {
  const model = await getModel(input.modelSlug);
  if (!model || !model.enabled || model.category === "character") {
    return { ok: false, kind: "unavailable", message: "That model is not available. An admin may have turned it off." };
  }
  // Brand presets: locked settings are re-applied here, so the browser can't override them.
  let rawParams = input.params ?? {};
  let presetId: string | null = null;
  if (input.presetId) {
    const p = await usablePreset(ctx, input.presetId);
    if (!p) return { ok: false, kind: "unavailable", message: "That preset is no longer available to you." };
    if (p.modelSlug !== model.slug) return { ok: false, kind: "invalid", errors: {}, message: `The ${p.name} preset is for a different model.` };
    if (promptLocked(p) && missingVariables(p.promptTemplate, input.presetVars ?? {}).length) {
      const missing = missingVariables(p.promptTemplate, input.presetVars ?? {});
      return { ok: false, kind: "invalid", errors: { prompt: `Fill in ${missing.join(", ")}` }, message: `Fill in ${missing.join(", ")} for the ${p.name} preset.` };
    }
    rawParams = applyPresetLocks(p, rawParams, input.presetVars ?? {});
    presetId = p.id;
  }
  const validated = validateParams(model.fields, rawParams, { allowHttpOrigin: insecureMediaOrigin() });
  if (!validated.ok) {
    return { ok: false, kind: "invalid", errors: validated.errors, message: Object.values(validated.errors)[0] ?? "Check the highlighted fields." };
  }
  const params = validated.params;
  const eff = await effectiveFor(ctx);
  const usage = await usageFor(ctx);
  const restricted = checkRestrictions(eff, { modelSlug: model.slug, modelName: model.family, outputType: model.outputType, params }, usage);
  if (restricted) return { ok: false, kind: "blocked", reason: restricted, estimateUsd: null, overridable: false };

  const cred = await resolveCredential(ctx, input.keySource);
  if ("error" in cred) return { ok: false, kind: "unavailable", message: cred.error };

  let estimateUsd: number | null = null;
  let costUnknown = false;
  if (!opts.skipEstimate) {
    try {
      estimateUsd = Number(await clientFor(cred.row).estimate(model.endpoint, params));
    } catch (e) {
      if (e instanceof HiggsfieldError && (e.code === "bad_request" || e.code === "validation")) {
        return { ok: false, kind: "invalid", errors: {}, message: e.message };
      }
      await handleKeyError(ctx.org.id, cred.row, e);
      if (ctx.org.settings.estimateFailurePolicy === "block") {
        return { ok: false, kind: "unavailable", message: `Could not get a cost estimate, so the job was not sent. ${e instanceof Error ? e.message : ""}`.trim() };
      }
      costUnknown = true;
    }
  }

  let remainingUsd: number | null = null;
  if (cred.source === "org") {
    const budgets = await budgetUsage(ctx, eff);
    if (budgets.length) remainingUsd = Math.min(...budgets.map((b) => b.limitUsd - b.spentUsd));
    if (!opts.skipBudget && estimateUsd !== null) {
      const blocked = checkBudgets(budgets, estimateUsd);
      if (blocked) return { ok: false, kind: "blocked", reason: blocked, estimateUsd, overridable: true };
    }
  }
  return { ok: true, prepared: { model, params, credential: cred.row, keySource: cred.source, estimateUsd, costUnknown, presetId }, remainingUsd };
}

async function handleKeyError(orgId: string, cred: CredentialRow, e: unknown) {
  if (!(e instanceof HiggsfieldError)) return;
  if (e.code !== "unauthorized" && e.code !== "insufficient_balance") return;
  await markCredential(cred.id, { lastError: e.message });
  if (cred.ownerType !== "org") return;
  const day = new Date().toISOString().slice(0, 10);
  await once(`key:${cred.id}:${e.code}:${day}`, () =>
    notifyAdmins(
      orgId,
      { kind: "key_problem", title: e.code === "unauthorized" ? "Higgsfield key rejected (401)" : "Higgsfield balance or key problem (403)", body: e.message, href: "/admin/keys" },
      templates.keyProblem({ problem: e.message, url: appUrl("/admin/keys") }),
    ),
  );
}

async function webhookUrlFor(ctx: Pick<Ctx, "org">, cred: CredentialRow): Promise<string | undefined> {
  const env = getEnv();
  if (!env.APP_URL.startsWith("https://") || cred.ownerType !== "org") return undefined;
  const secrets = await webhookSecrets(ctx.org.id);
  if (!secrets.length) return undefined;
  return appUrl("/api/webhooks/higgsfield");
}

/** Create the generation row and send it to Higgsfield. */
export async function submitGeneration(ctx: Ctx, p: Prepared, opts: { overrideId?: string } = {}): Promise<Generation> {
  const idempotencyKey = crypto.randomUUID();
  const [row] = await db
    .insert(generation)
    .values({
      organizationId: ctx.org.id,
      memberId: ctx.member.id,
      userId: ctx.user.id,
      teamIds: ctx.teamIds,
      modelSlug: p.model.slug,
      modelName: p.model.name,
      outputType: p.model.outputType,
      idempotencyKey,
      status: "submitting",
      prompt: promptOf(p.params) ?? null,
      params: p.params,
      estimatedCostUsd: p.estimateUsd !== null ? p.estimateUsd.toFixed(5) : null,
      costUnknown: p.costUnknown,
      keySource: p.keySource,
      credentialId: p.credential.id,
      overrideId: opts.overrideId ?? null,
      presetId: p.presetId,
    })
    .returning();
  return sendToHiggsfield(row!, p.credential, p.model, ctx);
}

/** Send (or re-send, with the same Idempotency-Key) a row in `submitting`. */
export async function sendToHiggsfield(row: Generation, cred: CredentialRow, model: ModelRow, ctx: Pick<Ctx, "org">): Promise<Generation> {
  const client = clientFor(cred);
  const webhookUrl = await webhookUrlFor(ctx, cred);
  try {
    const res = await submitSemaphore(ctx.org.settings.submitConcurrency).run(() =>
      client.submit(model.endpoint, row.params, {
        idempotencyKey: row.idempotencyKey,
        webhookUrl,
        expiresAfterSeconds: ctx.org.settings.retentionSeconds ?? undefined,
      }),
    );
    await markCredential(cred.id, { lastUsedAt: new Date(), lastError: null });
    const [updated] = await db
      .update(generation)
      .set({ requestId: res.requestId, status: res.status === "in_progress" ? "in_progress" : "queued", correlationId: res.correlationId, webhookUsed: !!webhookUrl, nextPollAt: new Date(Date.now() + 3000), pollAttempts: 0, error: null })
      .where(eq(generation.id, row.id))
      .returning();
    return updated!;
  } catch (e) {
    const err = e instanceof HiggsfieldError ? e : new HiggsfieldError({ status: 0, code: "unknown" });
    if (e instanceof HiggsfieldError) console.error(`[higgsfield] submit ${model.endpoint}: ${err.status} ${err.code} correlation=${err.correlationId ?? "-"}`, HiggsfieldError.detailText(err.detail) ?? "");
    else console.error("[higgsfield] submit failed", e);
    await handleKeyError(ctx.org.id, cred, err);
    // Ambiguous or queue-full failures stay in `submitting`; the sweep re-sends
    // with the same Idempotency-Key, which never creates a duplicate.
    if (err.retryable && row.pollAttempts < 8) {
      const wait = (err.retryAfterSeconds ?? Math.min(60, 5 * 2 ** row.pollAttempts)) * 1000;
      const [updated] = await db
        .update(generation)
        .set({ status: "submitting", error: err.message, pollAttempts: row.pollAttempts + 1, nextPollAt: new Date(Date.now() + wait), correlationId: err.correlationId ?? row.correlationId })
        .where(eq(generation.id, row.id))
        .returning();
      return updated!;
    }
    const [updated] = await db
      .update(generation)
      .set({ status: "error", error: err.message, costUsd: "0", completedAt: new Date(), correlationId: err.correlationId ?? row.correlationId })
      .where(eq(generation.id, row.id))
      .returning();
    return updated!;
  }
}

function pollDelayMs(attempts: number): number {
  // 3s, 4s, 5s … while a user is watching, capped at 30s.
  return Math.min(30_000, 3000 + attempts * 1000) + Math.floor(Math.random() * 500);
}

/** Poll Higgsfield once if this row is due. Safe to call often. */
export async function refreshGeneration(row: Generation, opts: { force?: boolean } = {}): Promise<Generation> {
  if (isTerminal(row.status) || row.status === "error") return row;
  if (!opts.force && row.nextPollAt && row.nextPollAt.getTime() > Date.now()) return row;

  // Claim the poll slot so concurrent viewers don't all hit Higgsfield.
  const [claimed] = await db
    .update(generation)
    .set({ nextPollAt: new Date(Date.now() + pollDelayMs(row.pollAttempts + 1)), pollAttempts: row.pollAttempts + 1 })
    .where(and(eq(generation.id, row.id), or(isNull(generation.nextPollAt), lte(generation.nextPollAt, new Date(opts.force ? Date.now() + 60_000 : Date.now())))))
    .returning();
  if (!claimed) return row;

  const cred = await credentialFor(row);
  if (!cred) {
    const [updated] = await db.update(generation).set({ status: "error", error: "The key used for this job was removed.", costUsd: "0", completedAt: new Date() }).where(eq(generation.id, row.id)).returning();
    return updated!;
  }

  if (claimed.status === "submitting") {
    const model = await getModel(row.modelSlug);
    if (!model) return claimed;
    const org = await orgOf(row.organizationId);
    return sendToHiggsfield(claimed, cred, model, { org });
  }
  if (!claimed.requestId) return claimed;
  try {
    const status = await clientFor(cred).status(claimed.requestId);
    if (isTerminal(status.status)) return (await finalizeGeneration(claimed.requestId, status)) ?? claimed;
    if (status.status === "in_progress" && claimed.status !== "in_progress") {
      const [updated] = await db.update(generation).set({ status: "in_progress", startedAt: new Date() }).where(eq(generation.id, row.id)).returning();
      return updated!;
    }
    return claimed;
  } catch (e) {
    if (e instanceof HiggsfieldError) console.error(`[higgsfield] status ${claimed.requestId}: ${e.status} ${e.code} correlation=${e.correlationId ?? "-"}`);
    return claimed;
  }
}

async function credentialFor(row: Generation): Promise<CredentialRow | undefined> {
  if (!row.credentialId) return undefined;
  const [cred] = await db.select().from(apiCredential).where(eq(apiCredential.id, row.credentialId));
  return cred;
}

async function orgOf(orgId: string) {
  const org = await getOrg();
  if (org.id !== orgId) throw new Error("Organization mismatch");
  return org;
}

/**
 * Record a terminal status. Idempotent: a webhook and a poll can race, and
 * only the first one to arrive updates the row.
 * Cost: the estimate for `completed`, $0 for failed, nsfw and canceled.
 */
export async function finalizeGeneration(requestId: string, result: Pick<StatusResult, "status" | "outputs" | "error" | "expiresAt">): Promise<Generation | undefined> {
  const [current] = await db.select().from(generation).where(eq(generation.requestId, requestId));
  if (!current) return undefined;
  if (isTerminal(current.status)) return current;
  const completed = result.status === "completed";
  const outputs: OutputFile[] = completed ? result.outputs : [];
  const costUsd = completed ? (current.estimatedCostUsd ?? null) : "0";
  const [updated] = await db
    .update(generation)
    .set({
      status: result.status as Generation["status"],
      outputs,
      error: result.status === "failed" ? (result.error ?? "Generation failed") : result.status === "nsfw" ? "Rejected by content moderation" : null,
      costUsd,
      costUnknown: completed ? current.costUnknown || current.estimatedCostUsd === null : false,
      expiresAt: result.expiresAt ?? (completed ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null),
      completedAt: new Date(),
      nextPollAt: null,
    })
    .where(and(eq(generation.id, current.id), notInArray(generation.status, ["completed", "failed", "nsfw", "canceled", "error"])))
    .returning();
  if (!updated) return (await db.select().from(generation).where(eq(generation.id, current.id)))[0];
  await afterFinish(updated).catch((e) => console.error("[generation] after-finish failed", e));
  return updated;
}

export async function cancelGeneration(row: Generation): Promise<{ ok: boolean; message?: string; row: Generation }> {
  if (row.status === "submitting" && !row.requestId) {
    const [u] = await db.update(generation).set({ status: "canceled", costUsd: "0", completedAt: new Date() }).where(eq(generation.id, row.id)).returning();
    return { ok: true, row: u! };
  }
  if (row.status !== "queued" || !row.requestId) return { ok: false, message: "Only queued jobs can be canceled.", row };
  const cred = await credentialFor(row);
  if (!cred) return { ok: false, message: "The key used for this job was removed.", row };
  const ok = await clientFor(cred).cancel(row.requestId);
  if (!ok) return { ok: false, message: "Higgsfield already started this job, so it can't be canceled.", row };
  const updated = await finalizeGeneration(row.requestId, { status: "canceled", outputs: [] });
  return { ok: true, row: updated ?? row };
}

/** Soft-delete locally and remove the data from Higgsfield (DELETE /requests/{id}). */
export async function deleteGeneration(row: Generation): Promise<void> {
  if (row.requestId && (isTerminal(row.status) || row.status === "error")) {
    const cred = await credentialFor(row);
    if (cred) {
      try {
        await clientFor(cred).deleteRequest(row.requestId);
      } catch (e) {
        console.error("[higgsfield] delete failed", e instanceof HiggsfieldError ? `${e.status} ${e.code}` : e);
      }
    }
  }
  await deleteMirrored(row).catch(() => undefined);
  await db.update(generation).set({ deletedAt: new Date(), favorite: false }).where(eq(generation.id, row.id));
}

/** Rows the cron sweep should look at. */
export async function dueGenerations(limit = 50): Promise<Generation[]> {
  return db
    .select()
    .from(generation)
    .where(and(inArray(generation.status, ["submitting", "queued", "in_progress"]), or(isNull(generation.nextPollAt), lte(generation.nextPollAt, new Date()))))
    .orderBy(generation.nextPollAt)
    .limit(limit);
}

/** Build a context for a member who is not the caller (override approvals). */
export async function contextForMember(memberId: string): Promise<Ctx | undefined> {
  const [m] = await db.select().from(member).where(eq(member.id, memberId));
  if (!m || m.suspendedAt) return undefined;
  const [u] = await db.select().from(user).where(eq(user.id, m.userId));
  if (!u) return undefined;
  const teams = await db.select({ teamId: teamMember.teamId }).from(teamMember).where(eq(teamMember.memberId, m.id));
  return {
    user: { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, image: u.image },
    member: m,
    org: await getOrg(),
    role: m.role,
    teamIds: teams.map((t) => t.teamId),
    sessionId: "",
  };
}


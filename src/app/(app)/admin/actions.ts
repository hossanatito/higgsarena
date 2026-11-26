"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invitation, member, model, policy, session, team, teamMember, user, type Role } from "@/lib/db/schema";
import { requireContext, actorOf, hasRole, type Ctx } from "@/lib/session";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { templates } from "@/lib/email/templates";
import { INVITE_TTL_MS, newInviteToken } from "@/lib/invitations";
import { clientFor, deleteCredential, getOrgCredentialRow, markCredential, parseKeyPair, saveCredential } from "@/lib/credentials";
import { HiggsfieldError } from "@/lib/higgsfield/errors";
import { hitRateLimit, LIMITS } from "@/lib/rate-limit";
import { updateOrgSettings } from "@/lib/org";
import { syncCatalog } from "@/lib/catalog/repo";
import { schemaToFields } from "@/lib/catalog/schema-to-fields";
import type { FieldSpec } from "@/lib/catalog/types";
import { decideOverride } from "@/lib/generations/overrides";
import { getSetting, saveSetting } from "@/lib/settings";
import { storageClient, testStorage } from "@/lib/storage/s3";

export type ActionResult = { ok: boolean; message: string; data?: Record<string, unknown> };

const ok = (message: string, data?: Record<string, unknown>): ActionResult => ({ ok: true, message, data });
const fail = (message: string): ActionResult => ({ ok: false, message });
const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function admin(min: Role = "admin"): Promise<Ctx> {
  return requireContext(min);
}

function revalidate(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

export async function setModelFlag(slug: string, flag: "enabled" | "featured", value: boolean): Promise<ActionResult> {
  const ctx = await admin();
  const [before] = await db.select().from(model).where(eq(model.slug, slug));
  if (!before) return fail("Model not found.");
  await db.update(model).set({ [flag]: value, updatedAt: new Date() }).where(eq(model.slug, slug));
  await audit(actorOf(ctx), `model.${flag === "enabled" ? (value ? "enable" : "disable") : value ? "feature" : "unfeature"}`, { type: "model", id: slug }, { [flag]: before[flag] }, { [flag]: value });
  revalidate("/admin/models", "/studio");
  return ok(`${before.name} ${flag === "enabled" ? (value ? "enabled" : "disabled") : value ? "featured" : "unfeatured"}.`);
}

const FieldSpecSchema: z.ZodType<FieldSpec> = z.object({
  name: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  kind: z.enum(["prompt", "text", "textarea", "number", "integer", "boolean", "select", "image", "images", "video", "videos", "audio", "audios", "character", "ids", "json"]),
  label: z.string().min(1).max(80),
  group: z.enum(["main", "settings", "advanced"]),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  default: z.unknown().optional(),
  options: z.array(z.union([z.string(), z.number()])).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  minItems: z.number().int().optional(),
  maxItems: z.number().int().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
}) as z.ZodType<FieldSpec>;

const ModelEdit = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(["image", "edit", "video", "motion"]),
  outputType: z.enum(["image", "video", "audio"]),
  endpoint: z.string().trim().min(1).max(200).regex(/^[a-z0-9][a-z0-9._\-/]*$/i, "Endpoint must be a path like vendor/model/version"),
  docsUrl: z.string().trim().url().optional().or(z.literal("")),
});

function parseFields(raw: string): FieldSpec[] {
  const json = JSON.parse(raw);
  // Accept either our field list or a raw JSON schema from the Higgsfield docs.
  if (json && !Array.isArray(json) && typeof json === "object" && "properties" in json) return schemaToFields(json);
  return z.array(FieldSpecSchema).max(80).parse(json);
}

export async function saveModel(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin("owner");
  const slug = str(f, "slug");
  const [before] = await db.select().from(model).where(eq(model.slug, slug));
  if (!before) return fail("Model not found.");
  const parsed = ModelEdit.safeParse({ name: str(f, "name"), description: str(f, "description") || undefined, category: str(f, "category"), outputType: str(f, "outputType"), endpoint: str(f, "endpoint"), docsUrl: str(f, "docsUrl") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the fields.");
  let fields: FieldSpec[];
  try {
    fields = parseFields(str(f, "fields"));
  } catch (e) {
    return fail(`Fields must be valid JSON: ${e instanceof Error ? e.message.slice(0, 200) : ""}`);
  }
  await db
    .update(model)
    .set({ ...parsed.data, docsUrl: parsed.data.docsUrl || null, description: parsed.data.description ?? null, fields, userEdited: true, verified: f.get("verified") === "on", updatedAt: new Date() })
    .where(eq(model.slug, slug));
  await audit(actorOf(ctx), "model.edit", { type: "model", id: slug }, { name: before.name, endpoint: before.endpoint, fieldCount: before.fields.length }, { ...parsed.data, fieldCount: fields.length });
  revalidate("/admin/models", "/admin/settings", "/studio");
  return ok("Model saved. Sync catalog will no longer overwrite it.");
}

export async function addCustomModel(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin("owner");
  const parsed = ModelEdit.safeParse({ name: str(f, "name"), description: str(f, "description") || undefined, category: str(f, "category"), outputType: str(f, "outputType"), endpoint: str(f, "endpoint").replace(/^https:\/\/api\.higgsfield\.ai\//, "").replace(/^\//, ""), docsUrl: str(f, "docsUrl") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the fields.");
  let fields: FieldSpec[];
  try {
    fields = parseFields(str(f, "fields") || '[{"name":"prompt","kind":"prompt","label":"Prompt","group":"main","required":true}]');
  } catch (e) {
    return fail(`Fields must be valid JSON: ${e instanceof Error ? e.message.slice(0, 200) : ""}`);
  }
  const slug = `custom-${parsed.data.endpoint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 100);
  const inserted = await db
    .insert(model)
    .values({ slug, name: parsed.data.name, family: parsed.data.name, provider: "Custom", category: parsed.data.category, mode: parsed.data.category === "video" ? "text-to-video" : "text-to-image", endpoint: parsed.data.endpoint, outputType: parsed.data.outputType, description: parsed.data.description ?? null, fields, docsUrl: parsed.data.docsUrl || null, verified: false, enabled: false, isCustom: true, userEdited: true, sortOrder: 5000 })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return fail("A model with that endpoint already exists.");
  await audit(actorOf(ctx), "model.add_custom", { type: "model", id: slug }, null, { ...parsed.data, fieldCount: fields.length });
  revalidate("/admin/models", "/admin/settings");
  return ok(`Added ${parsed.data.name}. It starts disabled; enable it in Models once you've checked the fields.`);
}

export async function syncCatalogAction(): Promise<ActionResult> {
  const ctx = await admin("owner");
  const r = await syncCatalog();
  await audit(actorOf(ctx), "model.sync_catalog", { type: "catalog" }, null, { added: r.added.length, updated: r.updated.length, skipped: r.skipped.length });
  revalidate("/admin/models", "/admin/settings", "/studio");
  return ok(`Catalog synced: ${r.added.length} added, ${r.updated.length} updated, ${r.skipped.length} kept as you edited them.`);
}

/* ------------------------------------------------------------------ */
/* Members and invitations                                             */
/* ------------------------------------------------------------------ */

const InviteInput = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["member", "admin"]), teamIds: z.array(z.string()).max(50) });

export async function inviteMember(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin();
  const rl = await hitRateLimit(`invite:${ctx.user.id}`, 30, 3600);
  if (!rl.ok) return fail("You've sent a lot of invitations. Try again later.");
  const parsed = InviteInput.safeParse({ email: str(f, "email"), role: str(f, "role") || "member", teamIds: f.getAll("teamIds").map(String) });
  if (!parsed.success) return fail("Enter a valid email address.");
  if (parsed.data.role === "admin" && !hasRole(ctx.role, "owner")) return fail("Only owners can invite admins.");
  const [existing] = await db.select({ id: member.id }).from(member).innerJoin(user, eq(user.id, member.userId)).where(and(eq(member.organizationId, ctx.org.id), eq(user.email, parsed.data.email)));
  if (existing) return fail("That person is already a member.");
  const validTeams = parsed.data.teamIds.length ? (await db.select({ id: team.id }).from(team).where(and(eq(team.organizationId, ctx.org.id), inArray(team.id, parsed.data.teamIds)))).map((t) => t.id) : [];
  // One live invitation per email: revoke older ones.
  await db.update(invitation).set({ revokedAt: new Date() }).where(and(eq(invitation.email, parsed.data.email), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
  const { token, tokenHash } = newInviteToken();
  const [inv] = await db.insert(invitation).values({ organizationId: ctx.org.id, email: parsed.data.email, role: parsed.data.role, teamIds: validTeams, tokenHash, invitedBy: ctx.user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) }).returning();
  const url = appUrl(`/invite/${token}`);
  const sent = await sendEmail(parsed.data.email, templates.invite({ url, inviter: ctx.user.name || ctx.user.email, org: ctx.org.name, role: parsed.data.role }));
  await audit(actorOf(ctx), "invite.create", { type: "invitation", id: inv!.id }, null, { email: parsed.data.email, role: parsed.data.role, teams: validTeams.length, emailed: sent.ok });
  revalidate("/admin/members");
  return sent.ok ? ok(`Invitation sent to ${parsed.data.email}.`, { url: sent.attempts[0]?.provider === "console" ? url : undefined }) : ok(`Invitation created, but the email could not be sent. Share this link directly: ${url}`, { url });
}

export async function resendInvite(id: string): Promise<ActionResult> {
  const ctx = await admin();
  const [inv] = await db.select().from(invitation).where(and(eq(invitation.id, id), eq(invitation.organizationId, ctx.org.id)));
  if (!inv || inv.acceptedAt || inv.revokedAt) return fail("That invitation can't be resent.");
  const { token, tokenHash } = newInviteToken();
  await db.update(invitation).set({ tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) }).where(eq(invitation.id, id));
  const url = appUrl(`/invite/${token}`);
  const sent = await sendEmail(inv.email, templates.invite({ url, inviter: ctx.user.name || ctx.user.email, org: ctx.org.name, role: inv.role }));
  await audit(actorOf(ctx), "invite.resend", { type: "invitation", id }, null, { email: inv.email });
  revalidate("/admin/members");
  return sent.ok ? ok(`Sent a new link to ${inv.email}. The old link no longer works.`) : ok(`New link created but email failed. Share it directly: ${url}`, { url });
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const ctx = await admin();
  const [inv] = await db.update(invitation).set({ revokedAt: new Date() }).where(and(eq(invitation.id, id), eq(invitation.organizationId, ctx.org.id), isNull(invitation.acceptedAt))).returning();
  if (!inv) return fail("Invitation not found.");
  await audit(actorOf(ctx), "invite.revoke", { type: "invitation", id }, { email: inv.email }, null);
  revalidate("/admin/members");
  return ok("Invitation revoked.");
}

async function targetMember(ctx: Ctx, memberId: string) {
  const [m] = await db.select().from(member).where(and(eq(member.id, memberId), eq(member.organizationId, ctx.org.id)));
  return m;
}

async function ownerCount(orgId: string) {
  return (await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, orgId), eq(member.role, "owner"), isNull(member.suspendedAt)))).length;
}

export async function changeRole(memberId: string, role: Role): Promise<ActionResult> {
  const ctx = await admin();
  const m = await targetMember(ctx, memberId);
  if (!m) return fail("Member not found.");
  if (m.id === ctx.member.id) return fail("You can't change your own role.");
  const isOwner = hasRole(ctx.role, "owner");
  if (!isOwner && (m.role !== "member" || role !== "member")) return fail("Only owners can change admin or owner roles.");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(ctx.org.id)) <= 1) return fail("There must be at least one owner.");
  await db.update(member).set({ role }).where(eq(member.id, m.id));
  await audit(actorOf(ctx), "member.role_change", { type: "member", id: m.id }, { role: m.role }, { role });
  revalidate("/admin/members");
  return ok(`Role changed to ${role}.`);
}

export async function transferOwnership(memberId: string): Promise<ActionResult> {
  const ctx = await admin("owner");
  const m = await targetMember(ctx, memberId);
  if (!m || m.suspendedAt) return fail("Pick an active member.");
  if (m.id === ctx.member.id) return fail("You already own this studio.");
  await db.transaction(async (tx) => {
    await tx.update(member).set({ role: "owner" }).where(eq(member.id, m.id));
    await tx.update(member).set({ role: "admin" }).where(eq(member.id, ctx.member.id));
  });
  await audit(actorOf(ctx), "member.transfer_ownership", { type: "member", id: m.id }, { owner: ctx.member.id }, { owner: m.id });
  revalidate("/admin/members");
  return ok("Ownership transferred. You are now an admin. Note: anyone in OWNER_EMAILS is promoted back to owner when they sign in.");
}

export async function setSuspended(memberId: string, suspended: boolean): Promise<ActionResult> {
  const ctx = await admin();
  const m = await targetMember(ctx, memberId);
  if (!m) return fail("Member not found.");
  if (m.id === ctx.member.id) return fail("You can't suspend yourself.");
  if (m.role !== "member" && !hasRole(ctx.role, "owner")) return fail("Only owners can suspend admins or owners.");
  if (m.role === "owner" && suspended && (await ownerCount(ctx.org.id)) <= 1) return fail("You can't suspend the last owner.");
  await db.update(member).set({ suspendedAt: suspended ? new Date() : null }).where(eq(member.id, m.id));
  if (suspended) {
    await db.delete(session).where(eq(session.userId, m.userId));
  }
  await audit(actorOf(ctx), suspended ? "member.suspend" : "member.unsuspend", { type: "member", id: m.id }, { suspended: !!m.suspendedAt }, { suspended });
  revalidate("/admin/members");
  return ok(suspended ? "Member suspended and signed out." : "Member reactivated.");
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const ctx = await admin();
  const m = await targetMember(ctx, memberId);
  if (!m) return fail("Member not found.");
  if (m.id === ctx.member.id) return fail("You can't remove yourself.");
  if (m.role !== "member" && !hasRole(ctx.role, "owner")) return fail("Only owners can remove admins or owners.");
  if (m.role === "owner" && (await ownerCount(ctx.org.id)) <= 1) return fail("You can't remove the last owner.");
  // Keep generations for cost history: suspend and detach from teams instead of deleting.
  await db.delete(teamMember).where(eq(teamMember.memberId, m.id));
  await db.update(member).set({ suspendedAt: new Date(), role: "member" }).where(eq(member.id, m.id));
  await db.delete(session).where(eq(session.userId, m.userId));
  await audit(actorOf(ctx), "member.remove", { type: "member", id: m.id }, { role: m.role }, { removed: true });
  revalidate("/admin/members", "/admin/teams");
  return ok("Member removed. Their past generations stay in the cost history.");
}

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

export async function createTeam(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin();
  const name = str(f, "name").slice(0, 80);
  if (!name) return fail("Give the team a name.");
  const [t] = await db.insert(team).values({ organizationId: ctx.org.id, name }).returning();
  await audit(actorOf(ctx), "team.create", { type: "team", id: t!.id }, null, { name });
  revalidate("/admin/teams");
  return ok(`Team ${name} created.`);
}

export async function updateTeam(teamId: string, patch: { name?: string; sharedLibrary?: boolean }): Promise<ActionResult> {
  const ctx = await admin();
  const [before] = await db.select().from(team).where(and(eq(team.id, teamId), eq(team.organizationId, ctx.org.id)));
  if (!before) return fail("Team not found.");
  const next = { name: patch.name?.trim().slice(0, 80) || before.name, sharedLibrary: patch.sharedLibrary ?? before.sharedLibrary };
  await db.update(team).set(next).where(eq(team.id, teamId));
  await audit(actorOf(ctx), "team.update", { type: "team", id: teamId }, { name: before.name, sharedLibrary: before.sharedLibrary }, next);
  revalidate("/admin/teams");
  return ok("Team updated.");
}

export async function deleteTeam(teamId: string): Promise<ActionResult> {
  const ctx = await admin();
  const [t] = await db.delete(team).where(and(eq(team.id, teamId), eq(team.organizationId, ctx.org.id))).returning();
  if (!t) return fail("Team not found.");
  await db.delete(policy).where(and(eq(policy.scope, "team"), eq(policy.scopeId, teamId)));
  await audit(actorOf(ctx), "team.delete", { type: "team", id: teamId }, { name: t.name }, null);
  revalidate("/admin/teams");
  return ok(`Team ${t.name} deleted.`);
}

export async function setTeamMember(teamId: string, memberId: string, add: boolean): Promise<ActionResult> {
  const ctx = await admin();
  const [t] = await db.select().from(team).where(and(eq(team.id, teamId), eq(team.organizationId, ctx.org.id)));
  const m = await targetMember(ctx, memberId);
  if (!t || !m) return fail("Team or member not found.");
  if (add) await db.insert(teamMember).values({ teamId, memberId }).onConflictDoNothing();
  else await db.delete(teamMember).where(and(eq(teamMember.teamId, teamId), eq(teamMember.memberId, memberId)));
  await audit(actorOf(ctx), add ? "team.add_member" : "team.remove_member", { type: "team", id: teamId }, null, { memberId });
  revalidate("/admin/teams", "/admin/members");
  return ok(add ? "Added to team." : "Removed from team.");
}

/* ------------------------------------------------------------------ */
/* Restrictions                                                        */
/* ------------------------------------------------------------------ */

const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(1_000_000).nullable());
const PolicyInput = z.object({
  scope: z.enum(["org", "team", "member"]),
  scopeId: z.string().min(1),
  monthlyBudgetUsd: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).max(10_000_000).nullable()),
  dailyGenerationLimit: optInt,
  maxConcurrentJobs: optInt,
  maxVideoDuration: optInt,
  maxBatchSize: optInt,
  maxUploadMb: optInt,
  paused: z.boolean(),
  allowedModels: z.array(z.string()).max(500).nullable(),
});

export async function savePolicy(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin();
  const restrictModels = f.get("restrictModels") === "on";
  const parsed = PolicyInput.safeParse({
    scope: str(f, "scope"),
    scopeId: str(f, "scopeId"),
    monthlyBudgetUsd: str(f, "monthlyBudgetUsd"),
    dailyGenerationLimit: str(f, "dailyGenerationLimit"),
    maxConcurrentJobs: str(f, "maxConcurrentJobs"),
    maxVideoDuration: str(f, "maxVideoDuration"),
    maxBatchSize: str(f, "maxBatchSize"),
    maxUploadMb: str(f, "maxUploadMb"),
    paused: f.get("paused") === "on",
    allowedModels: restrictModels ? f.getAll("allowedModels").map(String) : null,
  });
  if (!parsed.success) return fail(parsed.error.issues[0] ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` : "Check the values.");
  const p = parsed.data;
  // Scope ids must belong to this org.
  if (p.scope === "org" && p.scopeId !== ctx.org.id) return fail("Invalid scope.");
  if (p.scope === "team" && !(await db.select({ id: team.id }).from(team).where(and(eq(team.id, p.scopeId), eq(team.organizationId, ctx.org.id)))).length) return fail("Team not found.");
  if (p.scope === "member" && !(await targetMember(ctx, p.scopeId))) return fail("Member not found.");
  if (restrictModels && (!p.allowedModels || p.allowedModels.length === 0)) return fail("Pick at least one allowed model, or turn the model restriction off.");
  const [before] = await db.select().from(policy).where(and(eq(policy.scope, p.scope), eq(policy.scopeId, p.scopeId)));
  const values = {
    monthlyBudgetUsd: p.monthlyBudgetUsd === null ? null : p.monthlyBudgetUsd.toFixed(5),
    dailyGenerationLimit: p.dailyGenerationLimit,
    maxConcurrentJobs: p.maxConcurrentJobs,
    maxVideoDuration: p.maxVideoDuration,
    maxBatchSize: p.maxBatchSize,
    maxUploadMb: p.maxUploadMb,
    paused: p.paused,
    allowedModels: p.allowedModels,
    updatedAt: new Date(),
  };
  await db.insert(policy).values({ organizationId: ctx.org.id, scope: p.scope, scopeId: p.scopeId, ...values }).onConflictDoUpdate({ target: [policy.scope, policy.scopeId], set: values });
  const strip = (r: typeof before) => (r ? { monthlyBudgetUsd: r.monthlyBudgetUsd, dailyGenerationLimit: r.dailyGenerationLimit, maxConcurrentJobs: r.maxConcurrentJobs, maxVideoDuration: r.maxVideoDuration, maxBatchSize: r.maxBatchSize, maxUploadMb: r.maxUploadMb, paused: r.paused, allowedModels: r.allowedModels?.length ?? null } : null);
  await audit(actorOf(ctx), "restriction.update", { type: `policy:${p.scope}`, id: p.scopeId }, strip(before), { ...values, allowedModels: p.allowedModels?.length ?? null, updatedAt: undefined });
  revalidate("/admin/restrictions", "/studio", "/admin");
  return ok("Restrictions saved.");
}

export async function clearPolicy(scope: "team" | "member", scopeId: string): Promise<ActionResult> {
  const ctx = await admin();
  const [before] = await db.delete(policy).where(and(eq(policy.organizationId, ctx.org.id), eq(policy.scope, scope), eq(policy.scopeId, scopeId))).returning();
  if (before) await audit(actorOf(ctx), "restriction.clear", { type: `policy:${scope}`, id: scopeId }, { monthlyBudgetUsd: before.monthlyBudgetUsd, paused: before.paused }, null);
  revalidate("/admin/restrictions");
  return ok("Rules removed. The organization defaults apply.");
}

/* ------------------------------------------------------------------ */
/* Overrides                                                           */
/* ------------------------------------------------------------------ */

export async function decideOverrideAction(id: string, decision: "approve" | "decline", note?: string): Promise<ActionResult> {
  const ctx = await admin();
  const r = await decideOverride(ctx, id, decision, note);
  revalidate("/admin/overrides", "/admin");
  return r.ok ? ok(decision === "approve" ? "Approved. The job was submitted." : "Declined.") : fail(r.message);
}

/* ------------------------------------------------------------------ */
/* API keys and output settings                                        */
/* ------------------------------------------------------------------ */

export async function saveOrgKey(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin();
  const keyId = str(f, "keyId");
  const webhookSecret = str(f, "webhookSecret");
  if (!keyId && !webhookSecret) return fail("Enter a key, a webhook secret, or both.");
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) return fail("The webhook signing secret starts with whsec_.");
  const existing = await getOrgCredentialRow(ctx.org.id);
  let key;
  if (keyId) {
    key = parseKeyPair(keyId, str(f, "keySecret") || undefined);
    if (!key.secret) return fail("Enter the key secret too (or paste id:secret).");
  }
  if (!existing && !key) return fail("Add the API key first, then the webhook secret.");
  const row = await saveCredential({ orgId: ctx.org.id, ownerType: "org", userId: null, key, webhookSecret: webhookSecret || undefined });
  await audit(actorOf(ctx), key ? (existing ? "org_key.rotate" : "org_key.add") : "webhook_secret.save", { type: "api_credential", id: row.id }, existing ? { keyHint: existing.keyHint, webhookSecretHint: existing.webhookSecretHint } : null, { keyHint: row.keyHint, webhookSecretHint: row.webhookSecretHint });
  revalidate("/admin/keys", "/studio", "/admin");
  if (key) {
    const tested = await testOrgKey();
    return tested.ok ? ok("Key saved and verified.") : ok(`Key saved, but the test failed: ${tested.message}`);
  }
  return ok("Webhook secret saved.");
}

export async function testOrgKey(): Promise<ActionResult> {
  const ctx = await admin();
  const rl = await hitRateLimit(`keytest:${ctx.user.id}`, LIMITS.keyTest.limit, LIMITS.keyTest.window);
  if (!rl.ok) return fail("Too many tests. Wait a minute.");
  const row = await getOrgCredentialRow(ctx.org.id);
  if (!row) return fail("No organization key saved.");
  try {
    const r = await clientFor(row).verify();
    await markCredential(row.id, { lastVerifiedAt: new Date(), lastError: null });
    revalidate("/admin/keys");
    return ok(`Key works. (Sample estimate: $${r.sampleEstimateUsd})`);
  } catch (e) {
    const message = e instanceof HiggsfieldError ? e.message : "Could not reach Higgsfield.";
    await markCredential(row.id, { lastError: message });
    revalidate("/admin/keys");
    return fail(message);
  }
}

export async function removeOrgKey(what: "key" | "webhook"): Promise<ActionResult> {
  const ctx = await admin();
  const row = await getOrgCredentialRow(ctx.org.id);
  if (!row) return fail("Nothing to remove.");
  if (what === "webhook") {
    await saveCredential({ orgId: ctx.org.id, ownerType: "org", userId: null, webhookSecret: null });
    await audit(actorOf(ctx), "webhook_secret.remove", { type: "api_credential", id: row.id }, { webhookSecretHint: row.webhookSecretHint }, null);
  } else {
    await deleteCredential(row.id);
    await audit(actorOf(ctx), "org_key.remove", { type: "api_credential", id: row.id }, { keyHint: row.keyHint }, null);
  }
  revalidate("/admin/keys", "/studio");
  return ok(what === "webhook" ? "Webhook secret removed. HiggsArena will poll for results." : "Organization key removed.");
}

const OutputInput = z.object({
  personalKeysAllowed: z.boolean(),
  retentionSeconds: z.number().int().min(3600).max(7 * 24 * 3600).nullable(),
  mirrorOutputs: z.boolean(),
  estimateFailurePolicy: z.enum(["block", "allow"]),
  failureAlertThreshold: z.number().min(0).max(1),
  submitConcurrency: z.number().int().min(1).max(100),
});

/** Each form lists the settings it controls in a hidden `fields` input; others keep their value. */
export async function saveOrgSettings(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin();
  const controls = new Set(str(f, "fields").split(",").filter(Boolean));
  const cur = ctx.org.settings;
  const hours = str(f, "retentionHours");
  const candidate = {
    personalKeysAllowed: controls.has("personalKeysAllowed") ? f.get("personalKeysAllowed") === "on" : cur.personalKeysAllowed,
    retentionSeconds: controls.has("retentionSeconds") ? (hours ? Math.round(Number(hours) * 3600) : null) : cur.retentionSeconds,
    mirrorOutputs: controls.has("mirrorOutputs") ? f.get("mirrorOutputs") === "on" : cur.mirrorOutputs,
    estimateFailurePolicy: controls.has("estimateFailurePolicy") ? str(f, "estimateFailurePolicy") || "block" : cur.estimateFailurePolicy,
    failureAlertThreshold: controls.has("failureAlertThreshold") ? Number(str(f, "failureAlertThreshold") || "50") / 100 : cur.failureAlertThreshold,
    submitConcurrency: controls.has("submitConcurrency") ? Number(str(f, "submitConcurrency") || "8") : cur.submitConcurrency,
  };
  const parsed = OutputInput.safeParse(candidate);
  if (!parsed.success) return fail(parsed.error.issues[0]?.path[0] === "retentionSeconds" ? "Retention must be between 1 hour and 7 days (168 hours)." : "Check the values.");
  if (parsed.data.mirrorOutputs && !cur.mirrorOutputs && !(await storageClient())) return fail("Set up storage in Admin → Settings before turning on mirroring.");
  const next = await updateOrgSettings(ctx.org.id, parsed.data);
  await audit(actorOf(ctx), "settings.output", { type: "organization", id: ctx.org.id }, cur as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
  revalidate("/admin/keys", "/admin/output", "/settings", "/studio");
  return ok("Settings saved.");
}

export async function dismissSetup(): Promise<ActionResult> {
  const ctx = await admin();
  await updateOrgSettings(ctx.org.id, { setupDismissed: true });
  revalidate("/admin");
  return ok("Hidden.");
}

/* ------------------------------------------------------------------ */
/* Instance settings (owner only)                                      */
/* ------------------------------------------------------------------ */

const provider = z.enum(["resend", "brevo"]).nullable();
const EmailInput = z.object({ primary: provider, fallback: provider, fromName: z.string().max(80), fromAddress: z.string().email().or(z.literal("")), replyTo: z.string().email().or(z.literal("")) });

export async function saveEmailSettings(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin("owner");
  const parsed = EmailInput.safeParse({ primary: str(f, "primary") || null, fallback: str(f, "fallback") || null, fromName: str(f, "fromName"), fromAddress: str(f, "fromAddress"), replyTo: str(f, "replyTo") });
  if (!parsed.success) return fail("Check the email addresses.");
  if (parsed.data.primary && !parsed.data.fromAddress) return fail("Add a from address. It must be on a domain verified with your provider.");
  if (parsed.data.fallback && parsed.data.fallback === parsed.data.primary) parsed.data.fallback = null;
  const before = await getSetting("email");
  await saveSetting("email", parsed.data, { resendApiKey: f.get("clearResend") === "on" ? null : str(f, "resendApiKey"), brevoApiKey: f.get("clearBrevo") === "on" ? null : str(f, "brevoApiKey") }, ctx.user.id);
  const after = await getSetting("email");
  await audit(actorOf(ctx), "settings.email", { type: "instance_setting", id: "email" }, { ...before.value, keys: before.hints }, { ...after.value, keys: after.hints });
  revalidate("/admin/settings");
  return ok("Email settings saved.");
}

export async function sendTestEmail(which: "primary" | "resend" | "brevo"): Promise<ActionResult> {
  const ctx = await admin("owner");
  const rl = await hitRateLimit(`testmail:${ctx.user.id}`, LIMITS.email.limit, LIMITS.email.window);
  if (!rl.ok) return fail("Too many test emails. Wait a few minutes.");
  const r = await sendEmail(ctx.user.email, templates.test(), which === "primary" ? {} : { only: which });
  await audit(actorOf(ctx), "settings.email_test", { type: "instance_setting", id: "email" }, null, { attempts: r.attempts });
  const trail = r.attempts.map((a) => `${a.provider}: ${a.ok ? "sent" : a.error}`).join("; ");
  return r.ok ? ok(`Test email sent to ${ctx.user.email}. (${trail})`) : fail(`Sending failed. ${trail}`);
}

const StorageInput = z.object({ enabled: z.boolean(), endpoint: z.string().url().or(z.literal("")), region: z.string().max(40), bucket: z.string().max(100), publicBaseUrl: z.string().url().or(z.literal("")), forcePathStyle: z.boolean() });

export async function saveStorageSettings(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin("owner");
  const parsed = StorageInput.safeParse({ enabled: f.get("enabled") === "on", endpoint: str(f, "endpoint"), region: str(f, "region") || "auto", bucket: str(f, "bucket"), publicBaseUrl: str(f, "publicBaseUrl"), forcePathStyle: f.get("forcePathStyle") === "on" });
  if (!parsed.success) return fail("Check the endpoint and public URL. They must be full URLs.");
  if (parsed.data.enabled && !parsed.data.bucket) return fail("Enter a bucket name.");
  if (parsed.data.publicBaseUrl && !parsed.data.publicBaseUrl.startsWith("https://")) return fail("The public base URL must use https://.");
  const before = await getSetting("storage");
  await saveSetting("storage", parsed.data, { accessKeyId: str(f, "accessKeyId"), secretAccessKey: str(f, "secretAccessKey") }, ctx.user.id);
  const after = await getSetting("storage");
  await audit(actorOf(ctx), "settings.storage", { type: "instance_setting", id: "storage" }, { ...before.value, keys: before.hints }, { ...after.value, keys: after.hints });
  if (!parsed.data.enabled && ctx.org.settings.mirrorOutputs) await updateOrgSettings(ctx.org.id, { mirrorOutputs: false });
  revalidate("/admin/settings", "/admin/output");
  return ok("Storage settings saved.");
}

export async function testStorageAction(): Promise<ActionResult> {
  await admin("owner");
  const ready = await storageClient();
  if (!ready) return fail("Storage is off or incomplete. Save the bucket, keys and turn it on first.");
  try {
    await testStorage(ready);
    return ok("Connection works: wrote and deleted a test object.");
  } catch (e) {
    return fail(`Connection failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}`);
  }
}

const SignupInput = z.object({ policy: z.enum(["open", "invite", "domains"]), domains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).max(50), requireVerification: z.boolean() });

export async function saveSignupSettings(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const ctx = await admin("owner");
  const parsed = SignupInput.safeParse({
    policy: str(f, "policy"),
    domains: str(f, "domains").split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean),
    requireVerification: f.get("requireVerification") === "on",
  });
  if (!parsed.success) return fail("Check the domain list (e.g. example.com, studio.example.org).");
  if (parsed.data.policy === "domains" && !parsed.data.domains.length) return fail("Add at least one allowed domain.");
  const before = await getSetting("signup");
  await saveSetting("signup", parsed.data, undefined, ctx.user.id);
  await audit(actorOf(ctx), "settings.signup", { type: "instance_setting", id: "signup" }, before.value as unknown as Record<string, unknown>, parsed.data);
  revalidate("/admin/settings");
  return ok("Sign-up policy saved.");
}

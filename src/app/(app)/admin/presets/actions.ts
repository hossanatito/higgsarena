"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { preset, team } from "@/lib/db/schema";
import { actorOf, requireContext } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getModel } from "@/lib/catalog/repo";
import { validateParams } from "@/lib/catalog/validate";
import { insecureMediaOrigin } from "@/lib/env-check";

export type PresetResult = { ok: boolean; message: string; id?: string };

const NameSchema = z.string().trim().min(1, "Give the preset a name.").max(80);

async function cleanParams(modelSlug: string, params: Record<string, unknown>) {
  const model = await getModel(modelSlug);
  if (!model) return { error: "That model no longer exists." } as const;
  // Prompt lives in the template; required fields are not required for a preset.
  const fields = model.fields.filter((f) => f.kind !== "prompt").map((f) => ({ ...f, required: false }));
  const v = validateParams(fields, params, { allowHttpOrigin: insecureMediaOrigin() });
  if (!v.ok) return { error: Object.values(v.errors)[0] ?? "Some settings are invalid." } as const;
  return { model, params: v.params } as const;
}

/** "Save as preset" from the studio: captures the model, settings and prompt. */
export async function createPresetFromStudio(input: { name: string; modelSlug: string; params: Record<string, unknown>; prompt?: string }): Promise<PresetResult> {
  const ctx = await requireContext("admin");
  const name = NameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, message: name.error.issues[0]!.message };
  const cleaned = await cleanParams(input.modelSlug, input.params ?? {});
  if ("error" in cleaned) return { ok: false, message: cleaned.error ?? "Invalid settings." };
  const [row] = await db
    .insert(preset)
    .values({
      organizationId: ctx.org.id,
      name: name.data,
      modelSlug: cleaned.model.slug,
      promptTemplate: input.prompt?.trim().slice(0, 8000) || null,
      params: cleaned.params,
      createdBy: ctx.user.id,
    })
    .returning();
  await audit(actorOf(ctx), "preset.create", { type: "preset", id: row!.id }, null, { name: row!.name, model: row!.modelSlug });
  revalidatePath("/admin/presets");
  return { ok: true, message: "Preset saved.", id: row!.id };
}

/** "Update preset" from the studio: replaces the model's starting values. */
export async function updatePresetValues(id: string, input: { modelSlug: string; params: Record<string, unknown>; prompt?: string }): Promise<PresetResult> {
  const ctx = await requireContext("admin");
  const [before] = await db.select().from(preset).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id)));
  if (!before) return { ok: false, message: "Preset not found." };
  const cleaned = await cleanParams(input.modelSlug, input.params ?? {});
  if ("error" in cleaned) return { ok: false, message: cleaned.error ?? "Invalid settings." };
  const modelChanged = cleaned.model.slug !== before.modelSlug;
  const fieldNames = new Set(cleaned.model.fields.map((f) => f.name));
  await db
    .update(preset)
    .set({
      modelSlug: cleaned.model.slug,
      params: cleaned.params,
      promptTemplate: input.prompt !== undefined ? input.prompt.trim().slice(0, 8000) || null : before.promptTemplate,
      // Locks only make sense for fields the model has.
      lockedFields: modelChanged ? before.lockedFields.filter((f) => f === "prompt" || fieldNames.has(f)) : before.lockedFields,
      updatedAt: new Date(),
    })
    .where(eq(preset.id, id));
  await audit(actorOf(ctx), "preset.update_values", { type: "preset", id }, { model: before.modelSlug, params: before.params }, { model: cleaned.model.slug, params: cleaned.params });
  revalidatePath("/admin/presets");
  revalidatePath(`/admin/presets/${id}`);
  return { ok: true, message: "Preset updated with the current settings.", id };
}

const Details = z.object({
  name: NameSchema,
  description: z.string().trim().max(300).optional(),
  promptTemplate: z.string().max(8000).optional(),
  lockedFields: z.array(z.string().max(80)).max(80),
  teamIds: z.array(z.string()).max(50),
});

export async function savePresetDetails(_: PresetResult | null, f: FormData): Promise<PresetResult> {
  const ctx = await requireContext("admin");
  const id = String(f.get("id") ?? "");
  const [before] = await db.select().from(preset).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id)));
  if (!before) return { ok: false, message: "Preset not found." };
  const parsed = Details.safeParse({
    name: f.get("name"),
    description: (f.get("description") as string) || undefined,
    promptTemplate: (f.get("promptTemplate") as string) ?? undefined,
    lockedFields: f.getAll("lockedFields").map(String),
    teamIds: f.getAll("teamIds").map(String),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the fields." };
  const model = await getModel(before.modelSlug);
  const allowed = new Set(["prompt", ...(model?.fields.map((x) => x.name) ?? [])]);
  const lockedFields = parsed.data.lockedFields.filter((x) => allowed.has(x));
  if (lockedFields.includes("prompt") && !parsed.data.promptTemplate?.trim()) return { ok: false, message: "Add a prompt template before locking the prompt." };
  const validTeams = parsed.data.teamIds.length
    ? (await db.select({ id: team.id }).from(team).where(and(eq(team.organizationId, ctx.org.id), inArray(team.id, parsed.data.teamIds)))).map((t) => t.id)
    : [];
  const next = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    promptTemplate: parsed.data.promptTemplate?.trim() || null,
    lockedFields,
    teamIds: validTeams,
    updatedAt: new Date(),
  };
  await db.update(preset).set(next).where(eq(preset.id, id));
  await audit(actorOf(ctx), "preset.update", { type: "preset", id }, { name: before.name, lockedFields: before.lockedFields, teamIds: before.teamIds }, { name: next.name, lockedFields, teamIds: validTeams });
  revalidatePath("/admin/presets");
  revalidatePath(`/admin/presets/${id}`);
  return { ok: true, message: "Preset saved." };
}

export async function setPresetArchived(id: string, archived: boolean): Promise<PresetResult> {
  const ctx = await requireContext("admin");
  const [row] = await db.update(preset).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id))).returning();
  if (!row) return { ok: false, message: "Preset not found." };
  await audit(actorOf(ctx), archived ? "preset.archive" : "preset.restore", { type: "preset", id }, null, { name: row.name });
  revalidatePath("/admin/presets");
  return { ok: true, message: archived ? "Preset archived. Members no longer see it." : "Preset restored." };
}

export async function deletePreset(id: string): Promise<PresetResult> {
  const ctx = await requireContext("admin");
  const [row] = await db.delete(preset).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id))).returning();
  if (!row) return { ok: false, message: "Preset not found." };
  await audit(actorOf(ctx), "preset.delete", { type: "preset", id }, { name: row.name, model: row.modelSlug }, null);
  revalidatePath("/admin/presets");
  redirect("/admin/presets");
}

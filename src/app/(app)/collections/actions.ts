"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { collection, collectionItem } from "@/lib/db/schema";
import { actorOf, requireContext } from "@/lib/session";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { canEdit, getCollection, listCollections, newShareToken } from "@/lib/collections";
import { loadGeneration } from "@/lib/generations/access";
import { hitRateLimit } from "@/lib/rate-limit";

export type CollectionResult = { ok: boolean; message: string; id?: string; url?: string };

const Name = z.string().trim().min(1, "Give the collection a name.").max(80);

export async function createCollection(input: { name: string; description?: string; visibility?: "private" | "team"; addGenerationId?: string }): Promise<CollectionResult> {
  const ctx = await requireContext();
  const rl = await hitRateLimit(`coll:${ctx.user.id}`, 60, 3600);
  if (!rl.ok) return { ok: false, message: "You've created a lot of collections. Try again later." };
  const name = Name.safeParse(input.name);
  if (!name.success) return { ok: false, message: name.error.issues[0]!.message };
  const [row] = await db
    .insert(collection)
    .values({ organizationId: ctx.org.id, ownerMemberId: ctx.member.id, name: name.data, description: input.description?.trim().slice(0, 300) || null, visibility: input.visibility === "team" ? "team" : "private" })
    .returning();
  if (input.addGenerationId) {
    try {
      const g = await loadGeneration(ctx, input.addGenerationId);
      await db.insert(collectionItem).values({ collectionId: row!.id, generationId: g.id, addedBy: ctx.user.id }).onConflictDoNothing();
    } catch {
      // The result is not visible to the caller: create the empty collection anyway.
    }
  }
  revalidatePath("/collections");
  return { ok: true, message: `Created ${row!.name}.`, id: row!.id };
}

async function editable(id: string) {
  const ctx = await requireContext();
  const c = await getCollection(ctx, id);
  if (!c || !canEdit(ctx, c)) return { ctx, c: undefined } as const;
  return { ctx, c } as const;
}

export async function updateCollection(id: string, patch: { name?: string; description?: string | null; visibility?: "private" | "team" }): Promise<CollectionResult> {
  const { ctx, c } = await editable(id);
  if (!c) return { ok: false, message: "Collection not found." };
  const next: Partial<typeof collection.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const n = Name.safeParse(patch.name);
    if (!n.success) return { ok: false, message: n.error.issues[0]!.message };
    next.name = n.data;
  }
  if (patch.description !== undefined) next.description = patch.description?.trim().slice(0, 300) || null;
  if (patch.visibility) next.visibility = patch.visibility === "team" ? "team" : "private";
  await db.update(collection).set(next).where(eq(collection.id, id));
  if (patch.visibility && patch.visibility !== c.visibility) {
    await audit(actorOf(ctx), "collection.visibility", { type: "collection", id }, { visibility: c.visibility }, { visibility: next.visibility });
  }
  revalidatePath(`/collections/${id}`);
  revalidatePath("/collections");
  return { ok: true, message: "Saved." };
}

export async function deleteCollection(id: string): Promise<CollectionResult> {
  const { ctx, c } = await editable(id);
  if (!c) return { ok: false, message: "Collection not found." };
  await db.delete(collection).where(eq(collection.id, id));
  await audit(actorOf(ctx), "collection.delete", { type: "collection", id }, { name: c.name, shared: !!c.shareTokenHash }, null);
  revalidatePath("/collections");
  redirect("/collections");
}

/** Collections the caller can add to, with whether this result is already in each. */
export async function collectionsForPicker(generationId: string): Promise<{ id: string; name: string; count: number; has: boolean }[]> {
  const ctx = await requireContext();
  const all = (await listCollections(ctx)).filter((c) => c.mine || ctx.role !== "member");
  const inRows = await db.select({ id: collectionItem.collectionId }).from(collectionItem).where(eq(collectionItem.generationId, generationId));
  const has = new Set(inRows.map((r) => r.id));
  return all.map((c) => ({ id: c.id, name: c.name, count: c.count, has: has.has(c.id) }));
}

export async function setInCollection(collectionId: string, generationId: string, add: boolean): Promise<CollectionResult> {
  const { ctx, c } = await editable(collectionId);
  if (!c) return { ok: false, message: "Collection not found." };
  if (add) {
    let g;
    try {
      g = await loadGeneration(ctx, generationId);
    } catch {
      return { ok: false, message: "You can't add that result." };
    }
    const [top] = await db.select({ p: sql<number>`coalesce(max(${collectionItem.position}), 0)` }).from(collectionItem).where(eq(collectionItem.collectionId, collectionId));
    await db.insert(collectionItem).values({ collectionId, generationId: g.id, addedBy: ctx.user.id, position: Number(top?.p ?? 0) + 1 }).onConflictDoNothing();
  } else {
    await db.delete(collectionItem).where(and(eq(collectionItem.collectionId, collectionId), eq(collectionItem.generationId, generationId)));
  }
  await db.update(collection).set({ updatedAt: new Date() }).where(eq(collection.id, collectionId));
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true, message: add ? `Added to ${c.name}.` : `Removed from ${c.name}.` };
}

const ShareInput = z.object({ expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]), showPrompts: z.boolean() });

/**
 * Create (or replace) the read-only link. The token is returned once; only
 * its hash is stored, so creating a new link always invalidates the old one.
 */
export async function createShareLink(id: string, input: { expiresInDays: 7 | 30 | 90 | null; showPrompts: boolean }): Promise<CollectionResult> {
  const { ctx, c } = await editable(id);
  if (!c) return { ok: false, message: "Collection not found." };
  const parsed = ShareInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick how long the link should work." };
  const { token, hash } = newShareToken();
  const expires = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null;
  await db.update(collection).set({ shareTokenHash: hash, shareExpiresAt: expires, shareShowPrompts: parsed.data.showPrompts, shareCreatedAt: new Date(), updatedAt: new Date() }).where(eq(collection.id, id));
  await audit(actorOf(ctx), c.shareTokenHash ? "collection.share_rotate" : "collection.share_create", { type: "collection", id }, null, { expiresAt: expires?.toISOString() ?? "never", showPrompts: parsed.data.showPrompts });
  revalidatePath(`/collections/${id}`);
  return { ok: true, message: "Link created. Copy it now: for security it can't be shown again.", url: appUrl(`/s/${token}`) };
}

export async function updateShareOptions(id: string, showPrompts: boolean): Promise<CollectionResult> {
  const { ctx, c } = await editable(id);
  if (!c || !c.shareTokenHash) return { ok: false, message: "This collection has no link." };
  await db.update(collection).set({ shareShowPrompts: showPrompts }).where(eq(collection.id, id));
  await audit(actorOf(ctx), "collection.share_options", { type: "collection", id }, { showPrompts: c.shareShowPrompts }, { showPrompts });
  revalidatePath(`/collections/${id}`);
  return { ok: true, message: showPrompts ? "The link now shows prompts and models." : "The link now shows media only." };
}

export async function disableShareLink(id: string): Promise<CollectionResult> {
  const { ctx, c } = await editable(id);
  if (!c) return { ok: false, message: "Collection not found." };
  await db.update(collection).set({ shareTokenHash: null, shareExpiresAt: null, shareCreatedAt: null }).where(eq(collection.id, id));
  await audit(actorOf(ctx), "collection.share_disable", { type: "collection", id }, { shared: true }, { shared: false });
  revalidatePath(`/collections/${id}`);
  return { ok: true, message: "Link turned off. Anyone who had it can no longer open the collection." };
}

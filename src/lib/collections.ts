import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { collection, collectionItem, generation, member, user } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto/vault";
import { hasRole, type Ctx } from "@/lib/session";
import { withDisplayUrls } from "@/lib/generations/mirror";

export type Collection = typeof collection.$inferSelect;

/**
 * Collections group results into boards.
 * - private: the owner (and admins) can see it
 * - team: everyone in the studio can view it; only the owner and admins edit
 * A read-only link lets anyone with the link view it, signed in or not.
 */
export function canView(ctx: Pick<Ctx, "member" | "role">, c: Collection): boolean {
  return c.ownerMemberId === ctx.member.id || hasRole(ctx.role, "admin") || c.visibility === "team";
}
export function canEdit(ctx: Pick<Ctx, "member" | "role">, c: Collection): boolean {
  return c.ownerMemberId === ctx.member.id || hasRole(ctx.role, "admin");
}

export async function getCollection(ctx: Ctx, id: string): Promise<Collection | undefined> {
  const [c] = await db.select().from(collection).where(and(eq(collection.id, id), eq(collection.organizationId, ctx.org.id)));
  return c && canView(ctx, c) ? c : undefined;
}

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "team";
  shared: boolean;
  mine: boolean;
  owner: string;
  count: number;
  covers: { url: string; kind: string }[];
  updatedAt: Date;
};

export async function listCollections(ctx: Ctx): Promise<CollectionSummary[]> {
  const admin = hasRole(ctx.role, "admin");
  const rows = await db
    .select({ c: collection, ownerName: user.name, ownerEmail: user.email })
    .from(collection)
    .innerJoin(member, eq(member.id, collection.ownerMemberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(collection.organizationId, ctx.org.id), admin ? undefined : or(eq(collection.ownerMemberId, ctx.member.id), eq(collection.visibility, "team"))))
    .orderBy(desc(collection.updatedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.c.id);
  const counts = await db
    .select({ id: collectionItem.collectionId, n: sql<number>`count(*)` })
    .from(collectionItem)
    .innerJoin(generation, eq(generation.id, collectionItem.generationId))
    .where(and(inArray(collectionItem.collectionId, ids), isNull(generation.deletedAt)))
    .groupBy(collectionItem.collectionId);
  const countBy = new Map(counts.map((c) => [c.id, Number(c.n)]));
  // Up to four recent completed outputs per collection for the cover mosaic.
  const coverRows = await db
    .select({ cid: collectionItem.collectionId, g: generation })
    .from(collectionItem)
    .innerJoin(generation, eq(generation.id, collectionItem.generationId))
    .where(and(inArray(collectionItem.collectionId, ids), isNull(generation.deletedAt), eq(generation.status, "completed")))
    .orderBy(desc(collectionItem.addedAt));
  const display = await withDisplayUrls(coverRows.map((r) => r.g));
  const covers = new Map<string, { url: string; kind: string }[]>();
  coverRows.forEach((r, i) => {
    const list = covers.get(r.cid) ?? [];
    const o = display[i]!.outputs.find((x) => x.kind === "image" || x.kind === "video");
    if (o && list.length < 4) list.push({ url: o.displayUrl, kind: o.kind });
    covers.set(r.cid, list);
  });
  return rows.map(({ c, ownerName, ownerEmail }) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    visibility: c.visibility,
    shared: !!c.shareTokenHash && (!c.shareExpiresAt || c.shareExpiresAt.getTime() > Date.now()),
    mine: c.ownerMemberId === ctx.member.id,
    owner: ownerName || ownerEmail,
    count: countBy.get(c.id) ?? 0,
    covers: covers.get(c.id) ?? [],
    updatedAt: c.updatedAt,
  }));
}

/** Generations in a collection, newest first. */
export async function collectionGenerations(collectionId: string) {
  const rows = await db
    .select({ g: generation, addedAt: collectionItem.addedAt })
    .from(collectionItem)
    .innerJoin(generation, eq(generation.id, collectionItem.generationId))
    .where(and(eq(collectionItem.collectionId, collectionId), isNull(generation.deletedAt)))
    .orderBy(desc(collectionItem.position), desc(collectionItem.addedAt));
  return rows.map((r) => r.g);
}

/* ------------------------------------------------------------------ */
/* Read-only links                                                     */
/* ------------------------------------------------------------------ */

/** A new link token. Only its SHA-256 is stored, so the link is shown once. */
export function newShareToken(): { token: string; hash: string } {
  const token = randomToken(24);
  return { token, hash: sha256(token) };
}

export function shareActive(c: Pick<Collection, "shareTokenHash" | "shareExpiresAt">, now = Date.now()): boolean {
  return !!c.shareTokenHash && (!c.shareExpiresAt || c.shareExpiresAt.getTime() > now);
}

export async function collectionByShareToken(token: string): Promise<Collection | undefined> {
  if (!token || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) return undefined;
  const [c] = await db.select().from(collection).where(eq(collection.shareTokenHash, sha256(token)));
  return c && shareActive(c) ? c : undefined;
}

export type PublicItem = {
  id: string;
  outputType: string;
  aspect: string | null;
  media: { kind: string; url: string }[];
  prompt: string | null;
  model: string | null;
};

/**
 * What a read-only link shows: finished media only. No costs, people,
 * request IDs or settings. Prompts and model names only if the owner opts in.
 */
export async function publicItems(c: Collection): Promise<PublicItem[]> {
  const gens = (await collectionGenerations(c.id)).filter((g) => g.status === "completed" && g.outputs.length);
  const display = await withDisplayUrls(gens);
  return display.map((g) => ({
    id: g.id,
    outputType: g.outputType,
    aspect: typeof g.params.aspect_ratio === "string" ? g.params.aspect_ratio : null,
    media: g.outputs.filter((o) => o.kind === "image" || o.kind === "video").map((o) => ({ kind: o.kind, url: o.displayUrl })),
    prompt: c.shareShowPrompts ? g.prompt : null,
    model: c.shareShowPrompts ? g.modelName.split(" · ")[0]! : null,
  }));
}

import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { model } from "@/lib/db/schema";
import seed from "./seed-catalog.json";
import { schemaToFields } from "./schema-to-fields";
import type { SeedModel } from "./types";

export type ModelRow = typeof model.$inferSelect;

/** JSON.stringify with sorted keys: jsonb does not keep key order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export const SEED_MODELS = (seed as { models: SeedModel[] }).models;

function rowFromSeed(m: SeedModel): typeof model.$inferInsert {
  return {
    slug: m.slug,
    name: m.name,
    family: m.family,
    provider: m.provider,
    category: m.category,
    mode: m.mode,
    endpoint: m.endpoint,
    outputType: m.outputType,
    description: m.description ?? null,
    notes: m.notes ?? null,
    fields: schemaToFields(m.inputSchema),
    inputSchema: m.inputSchema,
    docsUrl: m.docsUrl,
    verified: m.verified,
    // Verified schemas ship enabled; unverified ones wait for the owner.
    enabled: m.verified,
    featured: m.featured,
    sortOrder: m.sortOrder,
    isCustom: false,
  };
}

/**
 * Sync catalog: add new seed entries and refresh schemas of entries the owner
 * has not edited. Owner toggles (enabled, featured) are never overwritten.
 */
export async function syncCatalog(): Promise<{ added: string[]; updated: string[]; skipped: string[] }> {
  const existing = new Map((await db.select().from(model)).map((r) => [r.slug, r]));
  const added: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const m of SEED_MODELS) {
    const row = rowFromSeed(m);
    const current = existing.get(m.slug);
    if (!current) {
      await db.insert(model).values(row).onConflictDoNothing();
      added.push(m.slug);
    } else if (current.userEdited || current.isCustom) {
      skipped.push(m.slug);
    } else {
      const changed = stable(current.inputSchema) !== stable(row.inputSchema) || current.endpoint !== row.endpoint || current.notes !== row.notes || current.name !== row.name;
      if (changed) {
        await db
          .update(model)
          .set({ name: row.name, family: row.family, provider: row.provider, category: row.category, mode: row.mode, endpoint: row.endpoint, outputType: row.outputType, description: row.description, notes: row.notes, fields: row.fields, inputSchema: row.inputSchema, docsUrl: row.docsUrl, verified: row.verified, updatedAt: new Date() })
          .where(eq(model.slug, m.slug));
        updated.push(m.slug);
      }
    }
  }
  return { added, updated, skipped };
}

export async function listModels(): Promise<ModelRow[]> {
  return db.select().from(model).orderBy(asc(model.sortOrder), asc(model.name));
}

export async function getModel(slug: string): Promise<ModelRow | undefined> {
  const [row] = await db.select().from(model).where(eq(model.slug, slug));
  return row;
}

/** Fields safe to send to the browser (no internal notes beyond docs text). */
export type PublicModel = Pick<ModelRow, "slug" | "name" | "family" | "provider" | "category" | "mode" | "outputType" | "description" | "notes" | "fields" | "docsUrl" | "featured" | "verified" | "sortOrder"> & { workflow: string };

export function toPublicModel(m: ModelRow): PublicModel {
  return {
    slug: m.slug,
    name: m.name,
    family: m.family,
    workflow: m.name.split(" · ")[1] ?? m.mode,
    provider: m.provider,
    category: m.category,
    mode: m.mode,
    outputType: m.outputType,
    description: m.description,
    notes: m.notes,
    fields: m.fields,
    docsUrl: m.docsUrl,
    featured: m.featured,
    verified: m.verified,
    sortOrder: m.sortOrder,
  };
}

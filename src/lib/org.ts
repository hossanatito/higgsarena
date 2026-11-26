import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { DEFAULT_ORG_SETTINGS, organization, policy, type OrgSettings } from "@/lib/db/schema";

export type Org = typeof organization.$inferSelect;

/** v1 runs a single organization per install. It is created on first use. */
export async function getOrg(): Promise<Org> {
  const [row] = await db.select().from(organization).limit(1);
  if (row) return { ...row, settings: { ...DEFAULT_ORG_SETTINGS, ...row.settings } };
  const [created] = await db
    .insert(organization)
    .values({ name: "HiggsArena", slug: "default", settings: DEFAULT_ORG_SETTINGS })
    .onConflictDoNothing()
    .returning();
  const org = created ?? (await db.select().from(organization).limit(1))[0]!;
  await ensureOrgPolicy(org.id);
  return { ...org, settings: { ...DEFAULT_ORG_SETTINGS, ...org.settings } };
}

/** Defaults for new members until admins change them (PRD §17). */
export async function ensureOrgPolicy(orgId: string) {
  await db
    .insert(policy)
    .values({ organizationId: orgId, scope: "org", scopeId: orgId, dailyGenerationLimit: 50, maxConcurrentJobs: 3, maxUploadMb: 50 })
    .onConflictDoNothing();
}

export async function updateOrgSettings(orgId: string, patch: Partial<OrgSettings>): Promise<OrgSettings> {
  const [row] = await db.select().from(organization).where(eq(organization.id, orgId));
  const next = { ...DEFAULT_ORG_SETTINGS, ...row!.settings, ...patch };
  await db.update(organization).set({ settings: next }).where(eq(organization.id, orgId));
  return next;
}

/**
 * pnpm db:seed
 *  - creates the organization and its default restrictions
 *  - loads the model catalog (new entries only; your toggles are kept)
 *  - stores the bootstrap Higgsfield key from .env, encrypted
 *  - with DEMO_MODE=true, creates demo users and a team
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { account, member, policy, team, teamMember, user } from "../src/lib/db/schema";
import { syncCatalog } from "../src/lib/catalog/repo";
import { getOrgCredentialRow } from "../src/lib/credentials";
import { getEnv } from "../src/lib/env";
import { getOrg } from "../src/lib/org";

export const DEMO_PASSWORD = "arena-demo-password";
const DEMO_USERS = [
  { email: "owner@demo.local", name: "Olivia Owner", role: "owner" as const },
  { email: "admin@demo.local", name: "Adam Admin", role: "admin" as const },
  { email: "member@demo.local", name: "Mia Member", role: "member" as const },
  { email: "freelancer@demo.local", name: "Felix Freelancer", role: "member" as const },
];

export async function seed({ quiet = false } = {}) {
  const log = (...a: unknown[]) => !quiet && console.log(...a);
  const env = getEnv();
  const org = await getOrg();
  log(`Organization: ${org.name}`);
  const catalog = await syncCatalog();
  log(`Catalog: ${catalog.added.length} added, ${catalog.updated.length} updated, ${catalog.skipped.length} kept as edited`);
  const cred = await getOrgCredentialRow(org.id);
  if (cred) log(`Organization Higgsfield key: ${cred.keyHint}`);

  if (env.DEMO_MODE) {
    if (env.NODE_ENV === "production") throw new Error("DEMO_MODE is blocked in production.");
    const hash = await hashPassword(DEMO_PASSWORD);
    const ids: Record<string, string> = {};
    for (const d of DEMO_USERS) {
      let [u] = await db.select().from(user).where(eq(user.email, d.email));
      if (!u) {
        [u] = await db.insert(user).values({ id: crypto.randomUUID(), email: d.email, name: d.name, emailVerified: true }).returning();
        await db.insert(account).values({ id: crypto.randomUUID(), accountId: u!.id, providerId: "credential", userId: u!.id, password: hash });
      }
      let [m] = await db.select().from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, u!.id)));
      if (!m) [m] = await db.insert(member).values({ organizationId: org.id, userId: u!.id, role: d.role }).returning();
      ids[d.email] = m!.id;
    }
    let [freelancers] = await db.select().from(team).where(eq(team.name, "Freelancers"));
    if (!freelancers) {
      [freelancers] = await db.insert(team).values({ organizationId: org.id, name: "Freelancers" }).returning();
      await db.insert(policy).values({ organizationId: org.id, scope: "team", scopeId: freelancers!.id, monthlyBudgetUsd: "25", dailyGenerationLimit: 40, maxVideoDuration: 10 }).onConflictDoNothing();
    }
    let [marketing] = await db.select().from(team).where(eq(team.name, "Marketing"));
    if (!marketing) {
      [marketing] = await db.insert(team).values({ organizationId: org.id, name: "Marketing" }).returning();
      await db.insert(policy).values({ organizationId: org.id, scope: "team", scopeId: marketing!.id, monthlyBudgetUsd: "250" }).onConflictDoNothing();
    }
    await db.insert(teamMember).values({ teamId: freelancers!.id, memberId: ids["freelancer@demo.local"]! }).onConflictDoNothing();
    await db.insert(teamMember).values({ teamId: marketing!.id, memberId: ids["member@demo.local"]! }).onConflictDoNothing();
    log(`Demo users ready (password: ${DEMO_PASSWORD}): ${DEMO_USERS.map((d) => d.email).join(", ")}`);
  }
}

if (process.argv[1]?.includes("seed")) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Seed failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}

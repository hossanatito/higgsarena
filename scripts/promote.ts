/**
 * pnpm admin:promote <email> [--role owner|admin|member]
 * Changes a signed-up user's role. Owners can also come from OWNER_EMAILS.
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { auditLog, member, user } from "../src/lib/db/schema";
import { getOrg } from "../src/lib/org";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const roleIdx = process.argv.indexOf("--role");
  const role = (roleIdx > 0 ? process.argv[roleIdx + 1] : "owner") as "owner" | "admin" | "member";
  if (!email || !["owner", "admin", "member"].includes(role)) {
    console.error("Usage: pnpm admin:promote <email> [--role owner|admin|member]");
    process.exit(1);
  }
  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) {
    console.error(`No user with email ${email}. They need to sign up first (add them to OWNER_EMAILS or invite them).`);
    process.exit(1);
  }
  const org = await getOrg();
  const [m] = await db.select().from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, u.id)));
  if (m) await db.update(member).set({ role, suspendedAt: null }).where(eq(member.id, m.id));
  else await db.insert(member).values({ organizationId: org.id, userId: u.id, role });
  await db.insert(auditLog).values({ organizationId: org.id, actorEmail: "cli", action: "member.role_change", targetType: "user", targetId: u.id, before: { role: m?.role ?? null }, after: { role } });
  console.log(`${email} is now ${role}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

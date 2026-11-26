import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSent, member, notification, user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import type { Email } from "@/lib/email/templates";

export type Notice = { kind: string; title: string; body?: string; href?: string };

export async function notifyUsers(userIds: string[], notice: Notice, email?: Email) {
  if (!userIds.length) return;
  await db.insert(notification).values(userIds.map((userId) => ({ userId, ...notice })));
  if (email) {
    const rows = await db.select({ email: user.email }).from(user).where(inArray(user.id, userIds));
    await Promise.allSettled(rows.map((r) => sendEmail(r.email, email)));
  }
}

export async function adminUserIds(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, orgId), inArray(member.role, ["owner", "admin"]), isNull(member.suspendedAt)));
  return rows.map((r) => r.userId);
}

export async function notifyAdmins(orgId: string, notice: Notice, email?: Email) {
  await notifyUsers(await adminUserIds(orgId), notice, email);
}

/** Runs `fn` only the first time `key` is seen. Used to dedupe alerts. */
export async function once(key: string, fn: () => Promise<void>) {
  const inserted = await db.insert(alertSent).values({ key }).onConflictDoNothing().returning();
  if (inserted.length) await fn();
}

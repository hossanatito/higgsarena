import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation, member, team, teamMember } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto/vault";

export type Invitation = typeof invitation.$inferSelect;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomToken(32);
  return { token, tokenHash: sha256(token) };
}

export async function findInvitationByToken(token: string): Promise<Invitation | undefined> {
  if (!token || token.length > 200) return undefined;
  const [row] = await db.select().from(invitation).where(eq(invitation.tokenHash, sha256(token)));
  return row;
}

export function invitationState(inv: Invitation): "valid" | "accepted" | "revoked" | "expired" {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() < Date.now()) return "expired";
  return "valid";
}

/** Single use: marks the invitation accepted and creates the membership. */
export async function acceptInvitation(inv: Invitation, userId: string) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invitation)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitation.id, inv.id), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
      .returning();
    if (!claimed) return undefined;
    let [m] = await tx.select().from(member).where(and(eq(member.organizationId, inv.organizationId), eq(member.userId, userId)));
    if (!m) {
      [m] = await tx.insert(member).values({ organizationId: inv.organizationId, userId, role: inv.role === "owner" ? "admin" : inv.role }).returning();
    }
    const validTeams = inv.teamIds.length
      ? (await tx.select({ id: team.id }).from(team).where(eq(team.organizationId, inv.organizationId))).filter((t) => inv.teamIds.includes(t.id))
      : [];
    for (const t of validTeams) {
      await tx.insert(teamMember).values({ teamId: t.id, memberId: m!.id }).onConflictDoNothing();
    }
    return m;
  });
}

import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation, member, teamMember, type Role } from "@/lib/db/schema";
import { getAuth, signupAllowed } from "@/lib/auth";
import { getEnv, isProduction } from "@/lib/env";
import { getOrg, type Org } from "@/lib/org";
import { getSetting } from "@/lib/settings";
import { acceptInvitation } from "@/lib/invitations";

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean; image?: string | null };
export type Member = typeof member.$inferSelect;

export type Ctx = {
  user: SessionUser;
  member: Member;
  org: Org;
  role: Role;
  teamIds: string[];
  sessionId: string;
};

export type ContextState =
  | { state: "signed-out" }
  | { state: "no-access"; user: SessionUser }
  | { state: "unverified"; user: SessionUser }
  | { state: "suspended"; user: SessionUser }
  | ({ state: "ok" } & Ctx);

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };
export const hasRole = (role: Role, min: Role) => RANK[role] >= RANK[min];

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

/** Resolve who is calling and what they may do. Memoised per request. */
export const getContext = cache(async (): Promise<ContextState> => {
  const session = await getSession();
  if (!session) return { state: "signed-out" };
  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email.toLowerCase(),
    name: session.user.name,
    emailVerified: session.user.emailVerified,
    image: session.user.image,
  };
  const org = await getOrg();
  const signup = (await getSetting("signup")).value;
  const isOwnerEmail = getEnv().OWNER_EMAILS.includes(user.email);
  // Owners are promoted only with a verified email in production, so nobody
  // can claim an owner address on a fresh instance.
  const ownerEligible = isOwnerEmail && (user.emailVerified || !isProduction());

  let [m] = await db.select().from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, user.id)));

  if (ownerEligible && (!m || m.role !== "owner")) {
    if (m) [m] = await db.update(member).set({ role: "owner" }).where(eq(member.id, m.id)).returning();
    else [m] = await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "owner" }).onConflictDoNothing().returning();
    m ??= (await db.select().from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, user.id))))[0];
  }

  if (!m && user.emailVerified) {
    const [invite] = await db
      .select()
      .from(invitation)
      .where(and(eq(invitation.email, user.email), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
      .limit(1);
    if (invite) m = await acceptInvitation(invite, user.id);
  }

  if (!m && signup.policy !== "invite" && (user.emailVerified || !signup.requireVerification) && (await signupAllowed(user.email))) {
    [m] = await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "member" }).onConflictDoNothing().returning();
  }

  if (signup.requireVerification && !user.emailVerified && !(m?.role === "owner" && !isProduction())) {
    return { state: "unverified", user };
  }
  if (!m) return { state: "no-access", user };
  if (m.suspendedAt) return { state: "suspended", user };

  const teams = await db.select({ teamId: teamMember.teamId }).from(teamMember).where(eq(teamMember.memberId, m.id));
  return { state: "ok", user, member: m, org, role: m.role, teamIds: teams.map((t) => t.teamId), sessionId: session.session.id };
});

/** For pages and server actions: redirects when the caller may not continue. */
export async function requireContext(min: Role = "member"): Promise<Ctx> {
  const c = await getContext();
  if (c.state === "signed-out") redirect("/sign-in");
  if (c.state === "unverified") redirect("/verify-email");
  if (c.state === "no-access" || c.state === "suspended") redirect(`/no-access?reason=${c.state}`);
  if (!hasRole(c.role, min)) redirect("/studio");
  return c;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

/** For API routes: throws ApiError instead of redirecting. */
export async function apiContext(min: Role = "member"): Promise<Ctx> {
  const c = await getContext();
  if (c.state === "signed-out") throw new ApiError(401, "Sign in to continue.");
  if (c.state === "unverified") throw new ApiError(403, "Verify your email address first.");
  if (c.state !== "ok") throw new ApiError(403, "Your account does not have access to this studio.");
  if (!hasRole(c.role, min)) throw new ApiError(403, "You don't have permission to do that.");
  return c;
}

export const actorOf = (c: Ctx) => ({ userId: c.user.id, email: c.user.email, orgId: c.org.id });

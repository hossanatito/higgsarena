import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { templates } from "@/lib/email/templates";
import { passwordProblem } from "@/lib/passwords";
import { getSetting } from "@/lib/settings";

/** May this email create an account under the current sign-up policy? */
export async function signupAllowed(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (getEnv().OWNER_EMAILS.includes(e)) return true;
  const [invite] = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(and(eq(schema.invitation.email, e), isNull(schema.invitation.acceptedAt), isNull(schema.invitation.revokedAt), gt(schema.invitation.expiresAt, new Date())))
    .limit(1);
  if (invite) return true;
  const { value } = await getSetting("signup");
  if (value.policy === "open") return true;
  if (value.policy === "domains") {
    const domain = e.split("@")[1] ?? "";
    return value.domains.map((d) => d.toLowerCase().replace(/^@/, "")).includes(domain);
  }
  return false;
}

function createAuth() {
  const env = getEnv();
  const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }

  return betterAuth({
    appName: "HiggsArena",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.APP_URL).origin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Verification is enforced by HiggsArena itself (see session.ts) so the
      // owner can switch it on or off at runtime in Admin → Settings.
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(user.email, templates.resetPassword(url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }, request) => {
        // Skip the email when verification is switched off, unless the user
        // asked for it explicitly from the "verify your email" screen.
        const { value } = await getSetting("signup");
        if (!value.requireVerification && !request?.url?.includes("/send-verification-email")) return;
        await sendEmail(user.email, templates.verify(url));
      },
    },
    socialProviders,
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "github", "email-password"] },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
        "/send-verification-email": { window: 300, max: 3 },
        "/change-password": { window: 300, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https://"),
      ipAddress: env.TRUST_PROXY ? { ipAddressHeaders: ["x-forwarded-for"] } : { ipAddressHeaders: ["x-real-ip"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: env.APP_URL.startsWith("https://") },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (ctx.path === "/sign-up/email" || ctx.path === "/reset-password" || ctx.path === "/change-password") {
          const password = (body.password ?? body.newPassword) as string | undefined;
          if (typeof password === "string") {
            const problem = passwordProblem(password, { email: typeof body.email === "string" ? body.email : undefined });
            if (problem) throw new APIError("BAD_REQUEST", { message: problem });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            if (!(await signupAllowed(u.email))) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is by invitation only. Ask an admin to invite this email address.",
              });
            }
            return { data: { ...u, email: u.email.toLowerCase() } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __hfAuth?: Auth };

/** Created lazily so `next build` never needs secrets or a database. */
export function getAuth(): Auth {
  g.__hfAuth ??= createAuth();
  return g.__hfAuth;
}

export function enabledSocialProviders(): { google: boolean; github: boolean } {
  const env = getEnv();
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) };
}

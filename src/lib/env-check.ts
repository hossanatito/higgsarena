/** Pure configuration checks, shared by the server, the CLI and tests. */
import { z } from "zod";

/**
 * Values that ship in .env.example. The production server refuses to start
 * while any of them is still in use.
 */
export const DEMO_VALUES = new Set([
  "demo-only-change-me-demo-only-change-me",
  "ZGVtby1vbmx5LWNoYW5nZS1tZS1kZW1vLW9ubHktMDA=",
  "demo-cron-secret-change-me",
]);

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url("APP_URL must be a full URL such as https://studio.example.com"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "ENCRYPTION_KEY must be 32 random bytes, base64 encoded (run pnpm setup)"),
  ENCRYPTION_KEY_PREVIOUS: optional,
  OWNER_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  DEMO_MODE: bool,
  HF_API_KEY_ID: optional,
  HF_API_KEY_SECRET: optional,
  HF_WEBHOOK_SECRET: optional,
  HF_API_BASE_URL: z.string().url().default("https://api.higgsfield.ai"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  RESEND_API_KEY: optional,
  BREVO_API_KEY: optional,
  EMAIL_FROM: optional,
  CRON_SECRET: optional,
  ACME_EMAIL: optional,
  TRUST_PROXY: bool,
});

export type Env = z.infer<typeof schema>;


export class EnvError extends Error {
  constructor(public problems: string[]) {
    super(`HiggsArena configuration problem:\n - ${problems.join("\n - ")}`);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return parsed.data;
}

export function productionProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.NODE_ENV !== "production") return problems;
  if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL must use https:// in production");
  if (DEMO_VALUES.has(env.BETTER_AUTH_SECRET)) problems.push("BETTER_AUTH_SECRET is still the demo value");
  if (DEMO_VALUES.has(env.ENCRYPTION_KEY)) problems.push("ENCRYPTION_KEY is still the demo value");
  if (env.ENCRYPTION_KEY_PREVIOUS && DEMO_VALUES.has(env.ENCRYPTION_KEY_PREVIOUS))
    problems.push("ENCRYPTION_KEY_PREVIOUS is the demo value");
  if (!env.CRON_SECRET) problems.push("CRON_SECRET is required in production");
  else if (DEMO_VALUES.has(env.CRON_SECRET) || env.CRON_SECRET.length < 24)
    problems.push("CRON_SECRET must be a random value of 24+ characters");
  if (env.DEMO_MODE) problems.push("DEMO_MODE cannot be enabled in production");
  if (env.OWNER_EMAILS.length === 0) problems.push("OWNER_EMAILS must list at least one owner email");
  return problems;
}

/**
 * Development only: allow http:// media when HF_API_BASE_URL points at the
 * local mock (scripts/mock-higgsfield.ts). Always false in production.
 */
export function insecureMediaOrigin(source: Record<string, string | undefined> = process.env): string | null {
  if (source.NODE_ENV === "production") return null;
  const base = source.HF_API_BASE_URL ?? "";
  const m = base.match(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/);
  return m ? m[0] : null;
}

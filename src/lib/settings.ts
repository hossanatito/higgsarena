import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceSetting } from "@/lib/db/schema";
import { decrypt, encrypt, hint } from "@/lib/crypto/vault";

export type EmailSettings = {
  primary: "resend" | "brevo" | null;
  fallback: "resend" | "brevo" | null;
  fromName: string;
  fromAddress: string;
  replyTo: string;
};
export type EmailSecrets = { resendApiKey?: string; brevoApiKey?: string };

export type StorageSettings = {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
};
export type StorageSecrets = { accessKeyId?: string; secretAccessKey?: string };

export type SignupSettings = {
  policy: "open" | "invite" | "domains";
  domains: string[];
  requireVerification: boolean;
};

type Defs = {
  email: { value: EmailSettings; secrets: EmailSecrets };
  storage: { value: StorageSettings; secrets: StorageSecrets };
  signup: { value: SignupSettings; secrets: Record<string, never> };
};
export type SettingKey = keyof Defs;

const DEFAULTS: { [K in SettingKey]: Defs[K]["value"] } = {
  email: { primary: null, fallback: null, fromName: "HiggsArena", fromAddress: "", replyTo: "" },
  storage: { enabled: false, endpoint: "", region: "auto", bucket: "", publicBaseUrl: "", forcePathStyle: false },
  signup: { policy: "invite", domains: [], requireVerification: process.env.NODE_ENV === "production" },
};

export async function getSetting<K extends SettingKey>(key: K): Promise<{ value: Defs[K]["value"]; hints: Record<string, string>; hasSecrets: boolean }> {
  const [row] = await db.select().from(instanceSetting).where(eq(instanceSetting.key, key));
  return {
    value: { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as Defs[K]["value"],
    hints: row?.secretHints ?? {},
    hasSecrets: !!row?.secretEnc,
  };
}

/** Server-only: decrypted secrets for a setting. Never send the result to the browser. */
export async function getSettingSecrets<K extends SettingKey>(key: K): Promise<Defs[K]["secrets"]> {
  const [row] = await db.select().from(instanceSetting).where(eq(instanceSetting.key, key));
  if (!row?.secretEnc) return {} as Defs[K]["secrets"];
  return JSON.parse(decrypt(row.secretEnc, "instance-setting", key)) as Defs[K]["secrets"];
}

/**
 * Save a setting. Secrets are merged: a missing or empty secret keeps the
 * stored one, `null` removes it.
 */
export async function saveSetting<K extends SettingKey>(
  key: K,
  value: Defs[K]["value"],
  secrets: { [S in keyof Defs[K]["secrets"]]?: string | null } | undefined,
  userId: string | null,
) {
  const existing = await getSettingSecrets(key);
  const [row] = await db.select().from(instanceSetting).where(eq(instanceSetting.key, key));
  const merged: Record<string, string> = { ...(existing as Record<string, string>) };
  const hints: Record<string, string> = { ...(row?.secretHints ?? {}) };
  for (const [k, v] of Object.entries(secrets ?? {})) {
    if (v === null) {
      delete merged[k];
      delete hints[k];
    } else if (typeof v === "string" && v.trim() !== "") {
      merged[k] = v.trim();
      hints[k] = hint(v);
    }
  }
  const secretEnc = Object.keys(merged).length ? encrypt(JSON.stringify(merged), "instance-setting", key) : null;
  await db
    .insert(instanceSetting)
    .values({ key, value: value as Record<string, unknown>, secretEnc, secretHints: hints, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: instanceSetting.key,
      set: { value: value as Record<string, unknown>, secretEnc, secretHints: hints, updatedBy: userId, updatedAt: new Date() },
    });
}

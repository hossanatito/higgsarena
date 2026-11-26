import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiCredential } from "@/lib/db/schema";
import { decrypt, encrypt, hint } from "@/lib/crypto/vault";
import { HiggsfieldClient, type HfCredentials } from "@/lib/higgsfield/client";

export type CredentialRow = typeof apiCredential.$inferSelect;

/** Public view of a credential. Safe to send to the browser. */
export type CredentialSummary = {
  id: string;
  keyHint: string;
  webhookSecretHint: string | null;
  lastVerifiedAt: Date | null;
  lastUsedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

export function summarise(row: CredentialRow): CredentialSummary {
  return {
    id: row.id,
    keyHint: row.keyHint,
    webhookSecretHint: row.webhookSecretHint,
    lastVerifiedAt: row.lastVerifiedAt,
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

/** Accepts "id:secret" or separate fields. */
export function parseKeyPair(keyId: string, keySecret?: string): HfCredentials {
  if (!keySecret && keyId.includes(":")) {
    const [id, ...rest] = keyId.split(":");
    return { id: id!.trim(), secret: rest.join(":").trim() };
  }
  return { id: keyId.trim(), secret: (keySecret ?? "").trim() };
}

export async function getOrgCredentialRow(orgId: string): Promise<CredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(apiCredential)
    .where(and(eq(apiCredential.organizationId, orgId), eq(apiCredential.ownerType, "org"), isNull(apiCredential.userId)));
  if (row) return row;
  // Bootstrap from .env on first run.
  if (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET) {
    return saveCredential({
      orgId,
      ownerType: "org",
      userId: null,
      key: { id: process.env.HF_API_KEY_ID, secret: process.env.HF_API_KEY_SECRET },
      webhookSecret: process.env.HF_WEBHOOK_SECRET || undefined,
    });
  }
  return undefined;
}

export async function getPersonalCredentialRow(orgId: string, userId: string): Promise<CredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(apiCredential)
    .where(and(eq(apiCredential.organizationId, orgId), eq(apiCredential.ownerType, "user"), eq(apiCredential.userId, userId)));
  return row;
}

export function decryptKey(row: CredentialRow): HfCredentials {
  return JSON.parse(decrypt(row.keyEnc, "hf-key", row.id)) as HfCredentials;
}

export function decryptWebhookSecret(row: CredentialRow): string | undefined {
  return row.webhookSecretEnc ? decrypt(row.webhookSecretEnc, "hf-webhook-secret", row.id) : undefined;
}

export function clientFor(row: CredentialRow): HiggsfieldClient {
  return new HiggsfieldClient(decryptKey(row));
}

export async function saveCredential(input: {
  orgId: string;
  ownerType: "org" | "user";
  userId: string | null;
  key?: HfCredentials;
  /** undefined keeps the stored secret, null removes it. */
  webhookSecret?: string | null;
}): Promise<CredentialRow> {
  const existing =
    input.ownerType === "org" ? await rawOrgRow(input.orgId) : await getPersonalCredentialRow(input.orgId, input.userId!);
  const id = existing?.id ?? crypto.randomUUID();
  const patch: Partial<typeof apiCredential.$inferInsert> = { updatedAt: new Date() };
  if (input.key) {
    patch.keyEnc = encrypt(JSON.stringify(input.key), "hf-key", id);
    patch.keyHint = `${hint(input.key.id)} · ${hint(input.key.secret)}`;
    patch.lastVerifiedAt = null;
    patch.lastError = null;
  }
  if (input.webhookSecret === null) {
    patch.webhookSecretEnc = null;
    patch.webhookSecretHint = null;
  } else if (input.webhookSecret) {
    patch.webhookSecretEnc = encrypt(input.webhookSecret.trim(), "hf-webhook-secret", id);
    patch.webhookSecretHint = hint(input.webhookSecret);
  }
  if (existing) {
    const [row] = await db.update(apiCredential).set(patch).where(eq(apiCredential.id, id)).returning();
    return row!;
  }
  if (!input.key) throw new Error("A key is required for a new credential");
  const [row] = await db
    .insert(apiCredential)
    .values({
      id,
      organizationId: input.orgId,
      ownerType: input.ownerType,
      userId: input.userId,
      keyEnc: patch.keyEnc!,
      keyHint: patch.keyHint!,
      webhookSecretEnc: patch.webhookSecretEnc ?? null,
      webhookSecretHint: patch.webhookSecretHint ?? null,
    })
    .returning();
  return row!;
}

async function rawOrgRow(orgId: string) {
  const [row] = await db
    .select()
    .from(apiCredential)
    .where(and(eq(apiCredential.organizationId, orgId), eq(apiCredential.ownerType, "org"), isNull(apiCredential.userId)));
  return row;
}

export async function deleteCredential(id: string) {
  await db.delete(apiCredential).where(eq(apiCredential.id, id));
}

export async function markCredential(id: string, patch: { lastVerifiedAt?: Date; lastUsedAt?: Date; lastError?: string | null }) {
  await db.update(apiCredential).set(patch).where(eq(apiCredential.id, id));
}

/** Webhook secrets to try when verifying a delivery. */
export async function webhookSecrets(orgId: string): Promise<string[]> {
  const out: string[] = [];
  const row = await rawOrgRow(orgId);
  if (row) {
    const s = decryptWebhookSecret(row);
    if (s) out.push(s);
  }
  if (process.env.HF_WEBHOOK_SECRET && !out.includes(process.env.HF_WEBHOOK_SECRET)) out.push(process.env.HF_WEBHOOK_SECRET);
  return out;
}

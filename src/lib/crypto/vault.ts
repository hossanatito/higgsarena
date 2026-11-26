import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM secrets vault.
 *
 * Every ciphertext is bound to a purpose and a row id through GCM's
 * additional authenticated data, so a value copied into another row or
 * another column will not decrypt.
 *
 * Format: v1.<keyId>.<iv>.<tag>.<ciphertext>   (base64url parts)
 */

export type Purpose =
  | "hf-key"
  | "hf-webhook-secret"
  | "instance-setting";

type Keyring = { current: Buffer; previous?: Buffer };

function decodeKey(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (base64)");
  return key;
}

export function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

let keyringOverride: Keyring | undefined;

/** For key rotation scripts and tests. */
export function setKeyring(current: string, previous?: string) {
  keyringOverride = { current: decodeKey(current), previous: previous ? decodeKey(previous) : undefined };
}

function keyring(): Keyring {
  if (keyringOverride) return keyringOverride;
  const current = process.env.ENCRYPTION_KEY;
  if (!current) throw new Error("ENCRYPTION_KEY is not set");
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS || undefined;
  return { current: decodeKey(current), previous: previous ? decodeKey(previous) : undefined };
}

const aad = (purpose: Purpose, rowId: string) => Buffer.from(`higgsarena:${purpose}:${rowId}`, "utf8");

export function encrypt(plaintext: string, purpose: Purpose, rowId: string): string {
  const { current } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current, iv);
  cipher.setAAD(aad(purpose, rowId));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", keyId(current), iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, purpose: Purpose, rowId: string): string {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unrecognised ciphertext format");
  const [, kid, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
  const ring = keyring();
  const candidates = [ring.current, ring.previous].filter((k): k is Buffer => !!k);
  const key = candidates.find((k) => keyId(k) === kid);
  if (!key) throw new Error("No encryption key matches this ciphertext (set ENCRYPTION_KEY_PREVIOUS?)");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAAD(aad(purpose, rowId));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

/** True when the value was encrypted with an older key and should be re-encrypted. */
export function needsRotation(payload: string): boolean {
  const kid = payload.split(".")[1];
  return kid !== keyId(keyring().current);
}

/** A short, non-reversible hint such as `a1b2…9f0e`. */
export function hint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

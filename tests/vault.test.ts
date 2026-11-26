import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { decrypt, encrypt, hint, keyId, needsRotation, setKeyring } from "@/lib/crypto/vault";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

describe("vault (AES-256-GCM)", () => {
  beforeEach(() => setKeyring(k1));

  it("round-trips a secret", () => {
    const ct = encrypt("id:secret-value", "hf-key", "row-1");
    expect(ct).not.toContain("secret-value");
    expect(decrypt(ct, "hf-key", "row-1")).toBe("id:secret-value");
  });

  it("produces a different ciphertext each time", () => {
    expect(encrypt("x", "hf-key", "r")).not.toBe(encrypt("x", "hf-key", "r"));
  });

  it("binds the ciphertext to its row", () => {
    const ct = encrypt("s", "hf-key", "row-1");
    expect(() => decrypt(ct, "hf-key", "row-2")).toThrow();
  });

  it("binds the ciphertext to its purpose", () => {
    const ct = encrypt("s", "hf-key", "row-1");
    expect(() => decrypt(ct, "hf-webhook-secret", "row-1")).toThrow();
  });

  it("detects tampering", () => {
    const ct = encrypt("secret", "hf-key", "r").split(".");
    const body = Buffer.from(ct[4]!, "base64url");
    body[0] = body[0]! ^ 1;
    ct[4] = body.toString("base64url");
    expect(() => decrypt(ct.join("."), "hf-key", "r")).toThrow();
  });

  it("decrypts with ENCRYPTION_KEY_PREVIOUS during rotation", () => {
    const old = encrypt("rotate-me", "instance-setting", "email");
    setKeyring(k2, k1);
    expect(needsRotation(old)).toBe(true);
    expect(decrypt(old, "instance-setting", "email")).toBe("rotate-me");
    const fresh = encrypt("rotate-me", "instance-setting", "email");
    expect(fresh.split(".")[1]).toBe(keyId(Buffer.from(k2, "base64")));
    expect(needsRotation(fresh)).toBe(false);
  });

  it("refuses values encrypted with an unknown key", () => {
    const ct = encrypt("s", "hf-key", "r");
    setKeyring(k2);
    expect(() => decrypt(ct, "hf-key", "r")).toThrow(/ENCRYPTION_KEY_PREVIOUS/);
  });

  it("shows only a short hint", () => {
    expect(hint("a1b2c3d4e5f60718293a9f0e")).toBe("a1b2…9f0e");
    expect(hint("short")).toBe("••••");
  });
});

import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { parseEnv, productionProblems, insecureMediaOrigin } from "@/lib/env-check";
import { verifyWebhook } from "@/lib/higgsfield/webhook";
import { extractOutputs } from "@/lib/higgsfield/outputs";
import { isPrivateAddress } from "@/lib/storage/ssrf";
import { passwordProblem } from "@/lib/passwords";
import { redact } from "@/lib/audit";
import { toCsv } from "@/lib/analytics";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db:5432/x",
  APP_URL: "https://studio.example.com",
  BETTER_AUTH_SECRET: "x".repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  OWNER_EMAILS: "owner@example.com",
  CRON_SECRET: "c".repeat(32),
};

describe("production start-up checks", () => {
  it("accepts a safe configuration", () => {
    expect(productionProblems(parseEnv(good))).toEqual([]);
  });
  it("refuses demo secrets", () => {
    const p = productionProblems(parseEnv({ ...good, BETTER_AUTH_SECRET: "demo-only-change-me-demo-only-change-me", ENCRYPTION_KEY: "ZGVtby1vbmx5LWNoYW5nZS1tZS1kZW1vLW9ubHktMDA=" }));
    expect(p.join(" ")).toMatch(/BETTER_AUTH_SECRET is still the demo value/);
    expect(p.join(" ")).toMatch(/ENCRYPTION_KEY is still the demo value/);
  });
  it("refuses a non-https APP_URL", () => {
    expect(productionProblems(parseEnv({ ...good, APP_URL: "http://studio.example.com" }))).toContain("APP_URL must use https:// in production");
  });
  it("refuses DEMO_MODE and a missing CRON_SECRET", () => {
    const p = productionProblems(parseEnv({ ...good, DEMO_MODE: "true", CRON_SECRET: "" }));
    expect(p).toContain("DEMO_MODE cannot be enabled in production");
    expect(p).toContain("CRON_SECRET is required in production");
  });
  it("refuses a malformed ENCRYPTION_KEY", () => {
    expect(() => parseEnv({ ...good, ENCRYPTION_KEY: "short" })).toThrow(/ENCRYPTION_KEY/);
  });
  it("never allows insecure media in production", () => {
    expect(insecureMediaOrigin({ NODE_ENV: "production", HF_API_BASE_URL: "http://127.0.0.1:4010" })).toBeNull();
    expect(insecureMediaOrigin({ NODE_ENV: "development", HF_API_BASE_URL: "http://127.0.0.1:4010" })).toBe("http://127.0.0.1:4010");
  });
});

describe("webhooks", () => {
  const secret = `whsec_${Buffer.alloc(24, 9).toString("base64")}`;
  const body = JSON.stringify({ request_id: "r1", status: "completed", error: null, payload: { images: [{ url: "https://cdn.example.com/a.png" }] } });
  const sign = (at: Date, s = secret, id = "msg_1", raw = body) => ({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
    "webhook-signature": new Webhook(s).sign(id, at, raw),
  });

  it("accepts a correctly signed delivery", () => {
    const r = verifyWebhook(body, sign(new Date()), [secret]);
    expect(r.ok && r.envelope.request_id).toBe("r1");
  });
  it("rejects a forged signature", () => {
    const other = `whsec_${Buffer.alloc(24, 1).toString("base64")}`;
    expect(verifyWebhook(body, sign(new Date(), other), [secret]).ok).toBe(false);
  });
  it("rejects a tampered body", () => {
    const h = sign(new Date());
    expect(verifyWebhook(body.replace("completed", "failed"), h, [secret]).ok).toBe(false);
  });
  it("rejects a replay older than 5 minutes", () => {
    expect(verifyWebhook(body, sign(new Date(Date.now() - 6 * 60 * 1000)), [secret]).ok).toBe(false);
  });
  it("accepts the previous secret during rotation", () => {
    const old = `whsec_${Buffer.alloc(24, 2).toString("base64")}`;
    expect(verifyWebhook(body, sign(new Date(), old), [secret, old]).ok).toBe(true);
  });
  it("rejects unsigned deliveries and bad envelopes", () => {
    expect(verifyWebhook(body, { "webhook-id": "", "webhook-timestamp": "", "webhook-signature": "" }, [secret]).ok).toBe(false);
    const bad = JSON.stringify({ hello: "world" });
    expect(verifyWebhook(bad, sign(new Date(), secret, "m2", bad), [secret]).ok).toBe(false);
  });
});

describe("outputs and SSRF", () => {
  it("extracts images, video, audio and extra artifacts, https only", () => {
    const out = extractOutputs({ images: [{ url: "https://a/1.png" }, { url: "http://evil/2.png" }], video: { url: "https://a/v.mp4" }, audios: [{ url: "https://a/s.mp3" }], zip: { url: "https://a/x.zip" } });
    expect(out.map((o) => o.kind)).toEqual(["image", "video", "audio", "file"]);
  });
  it("blocks private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "104.18.2.3", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("passwords, audit and CSV", () => {
  it("rejects short and common passwords", () => {
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("password123")).toMatch(/common/);
    expect(passwordProblem("1234567890")).toBeTruthy();
    expect(passwordProblem("aaaaaaaaaaaa")).toBeTruthy();
    expect(passwordProblem("lime-horizon-cobalt-7")).toBeNull();
  });
  it("redacts secret-looking fields from audit entries", () => {
    expect(redact({ keyHint: "a…b", apiKey: "sk", nested: { webhookSecret: "whsec_x", ok: 1 } })).toEqual({ keyHint: "a…b", apiKey: "[redacted]", nested: { webhookSecret: "[redacted]", ok: 1 } });
  });
  it("escapes CSV and blocks formula injection", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: 'say "hi", ok' }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"say ""hi"", ok"');
  });
});

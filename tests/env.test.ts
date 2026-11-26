import { describe, expect, it } from "vitest";
import { parseEnv, platformAppUrl } from "@/lib/env-check";

const base = {
  DATABASE_URL: "postgres://x@localhost/x",
  BETTER_AUTH_SECRET: "a".repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("platform app URL", () => {
  it("derives the URL on Vercel, Render and Railway", () => {
    expect(platformAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "arena.vercel.app" })).toBe("https://arena.vercel.app");
    expect(platformAppUrl({ RENDER_EXTERNAL_URL: "https://arena.onrender.com" })).toBe("https://arena.onrender.com");
    expect(platformAppUrl({ RAILWAY_PUBLIC_DOMAIN: "arena.up.railway.app" })).toBe("https://arena.up.railway.app");
    expect(platformAppUrl({})).toBeUndefined();
  });
  it("prefers an explicit APP_URL", () => {
    const env = parseEnv({ ...base, APP_URL: "https://studio.example.com", VERCEL_PROJECT_PRODUCTION_URL: "arena.vercel.app" });
    expect(env.APP_URL).toBe("https://studio.example.com");
  });
  it("falls back to the platform URL when APP_URL is empty", () => {
    expect(parseEnv({ ...base, APP_URL: "", RAILWAY_PUBLIC_DOMAIN: "arena.up.railway.app" }).APP_URL).toBe("https://arena.up.railway.app");
  });
  it("still requires a URL somewhere", () => {
    expect(() => parseEnv(base)).toThrow();
  });
  it("defaults the pool size and accepts a smaller one", () => {
    expect(parseEnv({ ...base, APP_URL: "http://localhost:3000" }).DATABASE_POOL_MAX).toBe(10);
    expect(parseEnv({ ...base, APP_URL: "http://localhost:3000", DATABASE_POOL_MAX: "2" }).DATABASE_POOL_MAX).toBe(2);
  });
});

import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/session";
import { HiggsfieldError } from "@/lib/higgsfield/errors";
import { getEnv } from "@/lib/env";

/**
 * Origin check for every state-changing API route. Server Actions get the
 * same protection from Next.js itself.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const expected = new URL(getEnv().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== expected) throw new ApiError(403, "Cross-origin request rejected.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError(403, "Cross-site request rejected.");
  const referer = req.headers.get("referer");
  if (!site && referer && new URL(referer).origin !== expected) throw new ApiError(403, "Cross-origin request rejected.");
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: origin check, consistent JSON errors, no stack traces leaked. */
export function route<C = unknown>(fn: Handler<C>, opts: { skipOriginCheck?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!opts.skipOriginCheck) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, ...e.body }, { status: e.status });
      if (e instanceof ZodError) {
        return json({ error: "Invalid input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      if (e instanceof HiggsfieldError) {
        console.error(`[higgsfield] ${e.status} ${e.code} correlation=${e.correlationId ?? "-"}`, HiggsfieldError.detailText(e.detail) ?? "");
        const status = e.code === "rate_limited" ? 429 : e.code === "validation" || e.code === "bad_request" ? 400 : 502;
        return json({ error: e.message, code: e.code }, { status, headers: e.retryAfterSeconds ? { "retry-after": String(e.retryAfterSeconds) } : {} });
      }
      console.error("[api] unexpected error", e);
      return json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { hitRateLimit, LIMITS } from "@/lib/rate-limit";
import { prepareGeneration, refreshGeneration, submitGeneration } from "@/lib/generations/service";
import { toClient } from "@/lib/generations/access";
import { withDisplayUrls } from "@/lib/generations/mirror";

export const dynamic = "force-dynamic";

const Body = z.object({
  modelSlug: z.string().min(1).max(120),
  params: z.record(z.string(), z.unknown()).default({}),
  keySource: z.enum(["org", "personal"]).optional(),
  presetId: z.string().max(64).optional(),
  presetVars: z.record(z.string().max(40), z.string().max(500)).optional(),
});

/** Feed: the caller's recent jobs. With ?ids= it refreshes those jobs (polling Higgsfield when due). */
export const GET = route(async (req) => {
  const ctx = await apiContext();
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 30);
  let rows = await db
    .select()
    .from(generation)
    .where(
      and(
        eq(generation.memberId, ctx.member.id),
        isNull(generation.deletedAt),
        ...(ids?.length ? [inArray(generation.id, ids)] : []),
      ),
    )
    .orderBy(desc(generation.createdAt))
    .limit(ids?.length ? ids.length : 24);
  if (ids?.length) rows = await Promise.all(rows.map((r) => refreshGeneration(r)));
  const out = await withDisplayUrls(rows);
  return json({ generations: out.map((r) => toClient(r, ctx)) });
});

export const POST = route(async (req) => {
  const ctx = await apiContext();
  const rl = await hitRateLimit(`gen:${ctx.user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
  if (!rl.ok) throw new ApiError(429, `Too many requests. Try again in ${rl.retryAfter}s.`);
  const body = Body.parse(await req.json());
  const result = await prepareGeneration(ctx, body);
  if (!result.ok) {
    if (result.kind === "blocked") {
      return json({ error: result.reason.message, blocked: result.reason, estimateUsd: result.estimateUsd, overridable: result.overridable }, { status: 409 });
    }
    if (result.kind === "invalid") return json({ error: result.message, fieldErrors: result.errors }, { status: 400 });
    return json({ error: result.message }, { status: 400 });
  }
  const row = await submitGeneration(ctx, result.prepared);
  const [out] = await withDisplayUrls([row]);
  return json({ generation: toClient(out!, ctx) }, { status: row.status === "error" ? 502 : 201 });
});

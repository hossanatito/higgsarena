import { z } from "zod";
import { json, route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { hitRateLimit, LIMITS } from "@/lib/rate-limit";
import { prepareGeneration } from "@/lib/generations/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  modelSlug: z.string().min(1).max(120),
  params: z.record(z.string(), z.unknown()).default({}),
  keySource: z.enum(["org", "personal"]).optional(),
});

/** Live estimate shown beside the Generate button. Runs every check, sends nothing. */
export const POST = route(async (req) => {
  const ctx = await apiContext();
  const rl = await hitRateLimit(`est:${ctx.user.id}`, LIMITS.estimate.limit, LIMITS.estimate.window);
  if (!rl.ok) throw new ApiError(429, "Slow down a little.");
  const body = Body.parse(await req.json());
  const result = await prepareGeneration(ctx, body);
  if (result.ok) {
    return json({ ok: true, estimateUsd: result.prepared.estimateUsd, costUnknown: result.prepared.costUnknown, remainingUsd: result.remainingUsd, keySource: result.prepared.keySource });
  }
  if (result.kind === "blocked") return json({ ok: false, blocked: result.reason, estimateUsd: result.estimateUsd, overridable: result.overridable });
  if (result.kind === "invalid") return json({ ok: false, error: result.message, fieldErrors: result.errors });
  return json({ ok: false, error: result.message });
});

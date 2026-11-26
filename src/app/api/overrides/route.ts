import { z } from "zod";
import { json, route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { hitRateLimit } from "@/lib/rate-limit";
import { requestOverride } from "@/lib/generations/overrides";

export const dynamic = "force-dynamic";

const Body = z.object({
  modelSlug: z.string().min(1).max(120),
  params: z.record(z.string(), z.unknown()).default({}),
  keySource: z.enum(["org", "personal"]).optional(),
  note: z.string().max(500).optional(),
});

/** Member asks an admin to approve one job that a budget blocked. */
export const POST = route(async (req) => {
  const ctx = await apiContext();
  const rl = await hitRateLimit(`ovr:${ctx.user.id}`, 10, 3600);
  if (!rl.ok) throw new ApiError(429, "You've sent a lot of override requests. Wait for an admin to respond.");
  const body = Body.parse(await req.json());
  const res = await requestOverride(ctx, body);
  if (!res.ok) return json({ error: res.message }, { status: 400 });
  return json({ override: { id: res.override.id, status: res.override.status, amountUsd: res.override.amountUsd, expiresAt: res.override.expiresAt } }, { status: 201 });
});

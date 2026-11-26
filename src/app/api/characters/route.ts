import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { character } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { hitRateLimit } from "@/lib/rate-limit";
import { createCharacter, refreshCharacters } from "@/lib/generations/characters";
import { effectiveFor } from "@/lib/policy/load";
import { insecureMediaOrigin } from "@/lib/env-check";

export const dynamic = "force-dynamic";

const clientShape = (c: typeof character.$inferSelect) => ({
  id: c.id,
  referenceId: c.referenceId,
  name: c.name,
  modelVersion: c.modelVersion,
  status: c.status,
  thumbnailUrl: c.thumbnailUrl,
  failReason: c.failReason,
  imageCount: c.imageCount,
  createdAt: c.createdAt,
});

export const GET = route(async () => {
  const ctx = await apiContext();
  const rows = await db.select().from(character).where(and(eq(character.organizationId, ctx.org.id), eq(character.memberId, ctx.member.id))).orderBy(desc(character.createdAt));
  const fresh = await refreshCharacters(rows);
  return json({ characters: fresh.map(clientShape) });
});

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  modelVersion: z.enum(["v1", "v2", "cinema"]),
  imageUrls: z.array(z.string().url().refine((u) => u.startsWith("https://") || (!!insecureMediaOrigin() && u.startsWith(`${insecureMediaOrigin()}/`)), "Use https:// URLs")).min(1).max(100),
  keySource: z.enum(["org", "personal"]).optional(),
});

export const POST = route(async (req) => {
  const ctx = await apiContext();
  const eff = await effectiveFor(ctx);
  if (eff.paused) throw new ApiError(403, "Generation is paused by an admin.");
  const rl = await hitRateLimit(`chr:${ctx.user.id}`, 5, 3600);
  if (!rl.ok) throw new ApiError(429, "Too many characters started this hour.");
  const body = Body.parse(await req.json());
  const res = await createCharacter(ctx, body);
  if (!res.ok) return json({ error: res.message }, { status: 400 });
  return json({ character: clientShape(res.character) }, { status: 201 });
});

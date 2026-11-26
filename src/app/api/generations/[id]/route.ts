import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { apiContext } from "@/lib/session";
import { loadGeneration, toClient } from "@/lib/generations/access";
import { withDisplayUrls } from "@/lib/generations/mirror";
import { deleteGeneration, refreshGeneration } from "@/lib/generations/service";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await apiContext();
  const { id } = await params;
  let row = await loadGeneration(ctx, id);
  if (row.memberId === ctx.member.id) row = await refreshGeneration(row);
  const [out] = await withDisplayUrls([row]);
  return json({ generation: toClient(out!, ctx) });
});

const Patch = z.object({ favorite: z.boolean() });

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await apiContext();
  const { id } = await params;
  const row = await loadGeneration(ctx, id, { write: true });
  const body = Patch.parse(await req.json());
  const [updated] = await db.update(generation).set({ favorite: body.favorite }).where(eq(generation.id, row.id)).returning();
  const [out] = await withDisplayUrls([updated!]);
  return json({ generation: toClient(out!, ctx) });
});

/** Deletes locally and calls Higgsfield's DELETE /requests/{id}. */
export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await apiContext();
  const { id } = await params;
  const row = await loadGeneration(ctx, id, { write: true });
  if (["submitting", "queued", "in_progress"].includes(row.status)) {
    return json({ error: "This job is still running. Cancel it or wait until it finishes." }, { status: 409 });
  }
  await deleteGeneration(row);
  return json({ ok: true });
});

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { apiContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const ctx = await apiContext();
  const rows = await db.select().from(notification).where(eq(notification.userId, ctx.user.id)).orderBy(desc(notification.createdAt)).limit(30);
  return json({ notifications: rows, unread: rows.filter((r) => !r.readAt).length });
});

export const POST = route(async (req) => {
  const ctx = await apiContext();
  const body = z.object({ id: z.string().optional() }).parse(await req.json().catch(() => ({})));
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, ctx.user.id), isNull(notification.readAt), ...(body.id ? [eq(notification.id, body.id)] : [])));
  return json({ ok: true });
});

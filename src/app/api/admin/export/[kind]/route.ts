import { and, desc, gte, ilike, lt, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { exportRows, parseFilters, toCsv } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** CSV exports for finance and reviews: /api/admin/export/generations and /api/admin/export/audit. */
export const GET = route<{ params: Promise<{ kind: string }> }>(async (req, { params }) => {
  const ctx = await apiContext("admin");
  const { kind } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  let csv: string;
  if (kind === "generations") {
    csv = toCsv(await exportRows(ctx.org.id, parseFilters(sp)));
  } else if (kind === "audit") {
    const f = parseFilters(sp);
    const parts: SQL[] = [eq(auditLog.organizationId, ctx.org.id), gte(auditLog.createdAt, f.from), lt(auditLog.createdAt, f.to)];
    if (sp.action) parts.push(ilike(auditLog.action, `${sp.action.replace(/[%_]/g, "")}%`));
    if (sp.actor) parts.push(ilike(auditLog.actorEmail, `%${sp.actor.replace(/[%_]/g, "")}%`));
    const rows = await db.select().from(auditLog).where(and(...parts)).orderBy(desc(auditLog.createdAt)).limit(100_000);
    csv = toCsv(rows.map((r) => ({ time: r.createdAt, actor: r.actorEmail, action: r.action, targetType: r.targetType, targetId: r.targetId, before: r.before, after: r.after, ip: r.ip })));
  } else {
    throw new ApiError(404, "Unknown export.");
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="higgsarena-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
});

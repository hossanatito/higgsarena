import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { requestInfo } from "@/lib/request-info";

export type AuditActor = { userId: string | null; email: string | null; orgId: string | null };

const REDACT = /secret|password|token|api_?key|keyenc|access_?key/i;

/** Remove anything that looks like a secret before it reaches the log. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? (v ? "[redacted]" : v) : redact(v)]));
  }
  return value;
}

export async function audit(
  actor: AuditActor,
  action: string,
  target: { type?: string; id?: string } = {},
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
) {
  let info: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    info = await requestInfo();
  } catch {
    // Outside a request (CLI, cron): no headers.
  }
  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action,
    targetType: target.type,
    targetId: target.id,
    before: (before ? redact(before) : null) as Record<string, unknown> | null,
    after: (after ? redact(after) : null) as Record<string, unknown> | null,
    ip: info.ip,
    userAgent: info.userAgent,
  });
}

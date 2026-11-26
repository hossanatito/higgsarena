import { and, desc, eq, gte, ilike, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { parseFilters } from "@/lib/analytics";
import { Button, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  if (!keys.length) return <span className="text-fg-subtle">-</span>;
  const show = (v: unknown) => (v === undefined ? "∅" : typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 80) : String(v));
  return (
    <ul className="mono grid gap-0.5 text-[12px]">
      {keys.slice(0, 6).map((k) => (
        <li key={k} className="break-all"><span className="text-fg-muted">{k}:</span> {before && k in before && <span className="text-danger line-through">{show(before[k])}</span>} {after && k in after && <span className="text-ok">{show(after[k])}</span>}</li>
      ))}
      {keys.length > 6 && <li className="text-fg-subtle">+{keys.length - 6} more</li>}
    </ul>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext("admin");
  const f = parseFilters({ from: sp.from ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10), to: sp.to });
  const parts: SQL[] = [eq(auditLog.organizationId, ctx.org.id), gte(auditLog.createdAt, f.from), lt(auditLog.createdAt, f.to)];
  if (sp.action) parts.push(ilike(auditLog.action, `${sp.action.replace(/[%_]/g, "")}%`));
  if (sp.actor) parts.push(ilike(auditLog.actorEmail, `%${sp.actor.replace(/[%_]/g, "")}%`));
  const rows = await db.select().from(auditLog).where(and(...parts)).orderBy(desc(auditLog.createdAt)).limit(300);
  const qs = new URLSearchParams({ from: f.from.toISOString().slice(0, 10), ...(sp.to ? { to: sp.to } : {}), ...(sp.action ? { action: sp.action } : {}), ...(sp.actor ? { actor: sp.actor } : {}) }).toString();
  return (
    <>
      <PageHeader title="Audit log" description="Every admin action with who, when, from where, and what changed. Secrets are never logged." actions={<a href={`/api/admin/export/audit?${qs}`} className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-sm hover:bg-surface-2">Export CSV</a>} />
      <form method="get" className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <label className="grid gap-1 text-[12px] text-fg-muted">Action<Input name="action" defaultValue={sp.action} placeholder="e.g. model." className="h-10 sm:w-44" /></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">Actor<Input name="actor" defaultValue={sp.actor} placeholder="email" className="h-10 sm:w-52" /></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">From<input name="from" type="date" defaultValue={f.from.toISOString().slice(0, 10)} className="h-10 rounded-[10px] border border-border bg-bg-elevated px-3 text-sm text-fg" /></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">To<input name="to" type="date" defaultValue={sp.to} className="h-10 rounded-[10px] border border-border bg-bg-elevated px-3 text-sm text-fg" /></label>
        <Button type="submit" size="sm" className="h-10">Filter</Button>
      </form>
      <Table>
        <thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Change</Th><Th>IP</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td colSpan={6} className="text-center text-fg-muted">No entries match.</Td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="whitespace-nowrap text-fg-muted">{dateTime(r.createdAt)}</Td>
              <Td className="text-[13px]">{r.actorEmail ?? "system"}</Td>
              <Td className="mono text-[13px]">{r.action}</Td>
              <Td className="mono max-w-40 truncate text-[12px] text-fg-muted" title={`${r.targetType}:${r.targetId}`}>{r.targetType}{r.targetId ? `:${r.targetId.slice(0, 12)}` : ""}</Td>
              <Td><Diff before={r.before} after={r.after} /></Td>
              <Td className="mono text-[12px] text-fg-subtle">{r.ip ?? "-"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { budgetOverride, member, user } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { expireOverrides } from "@/lib/generations/overrides";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { OverrideDecision } from "@/components/admin/override-row";
import { dateTime, relativeTime, usd } from "@/lib/format";

export const metadata = { title: "Overrides" };

export default async function OverridesPage() {
  const ctx = await requireContext("admin");
  await expireOverrides();
  const decider = alias(user, "decider");
  const rows = await db
    .select({ o: budgetOverride, email: user.email, name: user.name, deciderEmail: decider.email })
    .from(budgetOverride)
    .innerJoin(member, eq(member.id, budgetOverride.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(decider, eq(decider.id, budgetOverride.decidedBy))
    .where(eq(budgetOverride.organizationId, ctx.org.id))
    .orderBy(desc(budgetOverride.createdAt))
    .limit(200);
  const pending = rows.filter((r) => r.o.status === "pending");
  const history = rows.filter((r) => r.o.status !== "pending");
  const tone = { approved: "ok", declined: "danger", expired: "neutral", pending: "accent" } as const;
  return (
    <>
      <PageHeader title="Budget overrides" description="Members ask here when a job would go over a budget. Approving runs that one job; requests expire after 24 hours." />
      <h2 className="mb-3 font-semibold">Waiting for a decision</h2>
      {pending.length === 0 ? (
        <Card className="mb-8"><EmptyState title="No pending requests" body="When a budget blocks a job, the member can request an override and it shows up here." /></Card>
      ) : (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {pending.map(({ o, email, name }) => (
            <Card key={o.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{name || email}</p>
                  <p className="text-[13px] text-fg-subtle">{o.modelSlug} · {relativeTime(o.createdAt)} · expires {relativeTime(o.expiresAt)}</p>
                </div>
                <p className="mono text-lg font-semibold">{usd(o.amountUsd, { precise: true })}</p>
              </div>
              <p className="mt-3 rounded-[12px] bg-surface-2 p-3 text-[13px] text-fg-muted">{o.blockedBy.message}</p>
              {o.note && <p className="mt-2 text-[13px]">“{o.note}”</p>}
              {typeof o.params.prompt === "string" && <p className="mt-2 line-clamp-2 text-[13px] text-fg-subtle">Prompt: {o.params.prompt}</p>}
              <div className="mt-4"><OverrideDecision id={o.id} raiseHref={`/admin/restrictions${o.blockedBy.scope === "org" ? "" : `?scope=${o.blockedBy.scope}&id=${o.blockedBy.scopeId}`}`} /></div>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 font-semibold">History</h2>
      <Table>
        <thead><tr><Th>Requested</Th><Th>Member</Th><Th>Model</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>Decided by</Th></tr></thead>
        <tbody>
          {history.length === 0 && <tr><Td colSpan={6} className="text-center text-fg-muted">No decisions yet.</Td></tr>}
          {history.map(({ o, email, deciderEmail }) => (
            <tr key={o.id}>
              <Td className="text-fg-muted">{dateTime(o.createdAt)}</Td>
              <Td>{email}</Td>
              <Td className="text-fg-muted">{o.modelSlug}</Td>
              <Td className="mono text-right">{usd(o.amountUsd, { precise: true })}</Td>
              <Td><Badge tone={tone[o.status]}>{o.status}</Badge></Td>
              <Td className="text-fg-muted">{deciderEmail ?? "-"}{o.decisionNote ? <span className="block text-[12px]">“{o.decisionNote}”</span> : null}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

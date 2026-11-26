import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle, Circle } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { budgetOverride, generation, invitation, member, user } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { burn, byMember, byModel, summary } from "@/lib/analytics";
import { getOrgCredentialRow } from "@/lib/credentials";
import { getSetting } from "@/lib/settings";
import { monthStart } from "@/lib/policy/load";
import { Badge, Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { BarList } from "@/components/admin/charts";
import { ActionButton } from "@/components/admin/action-ui";
import { dateTime, pct, relativeTime, usd } from "@/lib/format";
import { dismissSetup } from "./actions";

export const metadata = { title: "Admin" };

export default async function AdminOverview() {
  const ctx = await requireContext("admin");
  const f = { from: monthStart(), to: new Date(Date.now() + 60_000) };
  const [s, b, models, members, live, pending, cred, email, invites] = await Promise.all([
    summary(ctx.org.id, f),
    burn(ctx.org.id),
    byModel(ctx.org.id, f),
    byMember(ctx.org.id, f),
    db.select({ g: generation, email: user.email }).from(generation).innerJoin(member, eq(member.id, generation.memberId)).innerJoin(user, eq(user.id, member.userId)).where(and(eq(generation.organizationId, ctx.org.id), inArray(generation.status, ["submitting", "queued", "in_progress"]))).orderBy(desc(generation.createdAt)).limit(10),
    db.select({ o: budgetOverride, email: user.email }).from(budgetOverride).innerJoin(member, eq(member.id, budgetOverride.memberId)).innerJoin(user, eq(user.id, member.userId)).where(and(eq(budgetOverride.organizationId, ctx.org.id), eq(budgetOverride.status, "pending"))).orderBy(desc(budgetOverride.createdAt)).limit(5),
    getOrgCredentialRow(ctx.org.id),
    getSetting("email"),
    db.select({ id: invitation.id }).from(invitation).where(eq(invitation.organizationId, ctx.org.id)).limit(1),
  ]);
  const memberCount = (await db.select({ id: member.id }).from(member).where(eq(member.organizationId, ctx.org.id))).length;
  const checklist = [
    { done: !!cred, label: "Add the organization's Higgsfield key", href: "/admin/keys" },
    { done: !!cred?.webhookSecretHint || !!process.env.HF_WEBHOOK_SECRET, label: "Save the webhook signing secret (whsec_…)", href: "/admin/keys" },
    { done: !!email.value.primary || !!process.env.RESEND_API_KEY || !!process.env.BREVO_API_KEY, label: "Set up email delivery (Resend or Brevo)", href: "/admin/settings", owner: true },
    { done: invites.length > 0 || memberCount > 1, label: "Invite your team", href: "/admin/members" },
  ].filter((c) => !c.owner || hasRole(ctx.role, "owner"));
  const showChecklist = !ctx.org.settings.setupDismissed && checklist.some((c) => !c.done);
  const budgetPct = b.budgetUsd ? b.spentUsd / b.budgetUsd : null;

  return (
    <>
      <PageHeader title="Overview" description={`${ctx.org.name} · this month`} actions={<LinkButton href="/admin/analytics" size="sm">Full analytics</LinkButton>} />
      {showChecklist && (
        <Card className="mb-6 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Finish setting up</h2>
              <p className="text-[13px] text-fg-subtle">A few steps before your team starts generating.</p>
            </div>
            <ActionButton run={dismissSetup} variant="ghost">Hide</ActionButton>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 rounded-[12px] border border-border px-4 py-3 text-sm hover:bg-surface-2">
                  {c.done ? <CheckCircle size={20} weight="fill" className="text-ok" aria-label="Done" /> : <Circle size={20} className="text-fg-subtle" aria-label="To do" />}
                  <span className={c.done ? "text-fg-muted line-through" : "text-fg"}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spend this month" value={usd(b.spentUsd)} sub={b.budgetUsd ? `of ${usd(b.budgetUsd)} budget (${pct(budgetPct)})` : "No organization budget"} tone={budgetPct !== null ? (budgetPct >= 1 ? "danger" : budgetPct >= 0.8 ? "warn" : undefined) : undefined} />
        <Stat label="Projected month end" value={usd(b.projectedUsd)} sub={`${b.daysLeft} days left`} tone={b.budgetUsd && b.projectedUsd > b.budgetUsd ? "warn" : undefined} />
        <Stat label="Generations" value={s.count} sub={`${s.active} running now`} />
        <Stat label="Success rate" value={pct(s.successRate)} sub={`${s.failed} failed · ${s.nsfw} moderated`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Top models</h2>
          <BarList title="Spend by model this month" rows={models.slice(0, 6).map((m) => ({ key: m.slug, label: m.name, value: m.spendUsd, sub: `${m.count}×` }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Top members</h2>
          <BarList title="Spend by member this month" rows={members.slice(0, 6).map((m) => ({ key: m.memberId, label: m.name || m.email, value: m.spendUsd, sub: `${m.count}×`, budget: m.budgetUsd }))} />
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Pending override requests</h2>
            <Link href="/admin/overrides" className="text-sm text-accent-text hover:underline">Review</Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing waiting.</p>
          ) : (
            <ul className="grid gap-2">
              {pending.map(({ o, email }) => (
                <li key={o.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-border px-4 py-3 text-sm">
                  <span className="min-w-0 truncate">{email} · {o.modelSlug}</span>
                  <span className="mono shrink-0">{usd(o.amountUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Live jobs</h2>
          {live.length === 0 ? (
            <p className="text-sm text-fg-muted">No jobs running.</p>
          ) : (
            <ul className="grid gap-2">
              {live.map(({ g, email }) => (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-border px-4 py-3 text-sm">
                  <span className="min-w-0 truncate">{g.modelName} <span className="text-fg-subtle">· {email}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><Badge tone={g.status === "in_progress" ? "accent" : "neutral"}>{g.status.replace("_", " ")}</Badge><span className="text-[12px] text-fg-subtle" title={dateTime(g.createdAt)}>{relativeTime(g.createdAt)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

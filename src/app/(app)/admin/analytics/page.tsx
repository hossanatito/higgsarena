import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, team, user } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { burn, byMember, byModel, byTeam, dailySpend, monthlySpend, overrideStats, parseFilters, summary } from "@/lib/analytics";
import { listModels } from "@/lib/catalog/repo";
import { Card, PageHeader, Stat, Table, Td, Th, Select, Button, Notice } from "@/components/ui";
import { BarList, StackedBars } from "@/components/admin/charts";
import { duration, pct, usd, num } from "@/lib/format";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext("admin");
  const f = parseFilters(sp);
  const { from: _from, to: _to, ...dims } = f;
  const [s, daily, monthly, models, members, teams, b, ov] = await Promise.all([
    summary(ctx.org.id, f),
    dailySpend(ctx.org.id, f),
    monthlySpend(ctx.org.id, dims),
    byModel(ctx.org.id, f),
    byMember(ctx.org.id, f),
    byTeam(ctx.org.id, f),
    burn(ctx.org.id),
    overrideStats(ctx.org.id, f),
  ]);
  const allModels = await listModels();
  const memberOpts = await db.select({ id: member.id, email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, ctx.org.id));
  const teamOpts = await db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, ctx.org.id));
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString();
  const fromStr = f.from.toISOString().slice(0, 10);
  const toStr = new Date(f.to.getTime() - 86_400_000).toISOString().slice(0, 10);
  const finished = s.completed + s.failed + s.nsfw + s.canceled;

  return (
    <>
      <PageHeader title="Analytics" description="Every figure is the sum of recorded generation costs (estimates). The Higgsfield Console is the billing record." actions={<a href={`/api/admin/export/generations?${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-3">Export CSV</a>} />
      <form className="panel mb-6 grid grid-cols-2 gap-3 p-3 sm:flex sm:flex-wrap sm:items-end" method="get">
        <label className="grid gap-1 text-[12px] text-fg-muted">From<input name="from" type="date" defaultValue={fromStr} className="field h-10 rounded-[12px] px-3 text-sm text-fg" /></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">To<input name="to" type="date" defaultValue={toStr} className="field h-10 rounded-[12px] px-3 text-sm text-fg" /></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">Team<Select name="team" defaultValue={sp.team ?? ""} className="h-10 sm:w-40"><option value="">All</option>{teamOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">Member<Select name="member" defaultValue={sp.member ?? ""} className="h-10 sm:w-52"><option value="">All</option>{memberOpts.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</Select></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">Model<Select name="model" defaultValue={sp.model ?? ""} className="h-10 sm:w-52"><option value="">All</option>{allModels.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</Select></label>
        <label className="grid gap-1 text-[12px] text-fg-muted">Key<Select name="key" defaultValue={sp.key ?? ""} className="h-10 sm:w-36"><option value="">Both</option><option value="org">Organization</option><option value="personal">Personal</option></Select></label>
        <Button type="submit" size="sm" variant="primary" className="h-10 col-span-2 sm:col-span-1">Apply</Button>
      </form>
      {s.unknownCost > 0 && <div className="mb-4"><Notice tone="warn">{s.unknownCost} job(s) in this range ran without an estimate and are flagged “cost unknown”; their cost is not in these totals.</Notice></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spend in range" value={usd(s.spendUsd)} sub={`${num(s.count)} generations`} />
        <Stat label="Success rate" value={pct(s.successRate)} sub={`${s.completed} completed`} />
        <Stat label="Month-end projection" value={usd(b.projectedUsd)} sub={b.budgetUsd ? `budget ${usd(b.budgetUsd)}` : "org key, current pace"} tone={b.budgetUsd && b.projectedUsd > b.budgetUsd ? "warn" : undefined} />
        <Stat label="Overrides approved" value={usd(ov.approvedUsd)} sub={`${ov.approved} of ${ov.requests} requests`} />
      </div>
      <div className="mt-6 grid gap-6">
        <Card className="p-5"><StackedBars title="Daily spend" data={daily} /></Card>
        <Card className="p-5"><StackedBars title="Monthly spend, last 12 months" data={monthly} labelEvery={1} /></Card>
        <div>
          <h2 className="mb-3 font-semibold">By model</h2>
          <Table>
            <thead><tr><Th>Model</Th><Th className="text-right">Spend</Th><Th className="text-right">Jobs</Th><Th className="text-right">Avg cost</Th><Th className="text-right">Success</Th><Th className="text-right">Median time</Th></tr></thead>
            <tbody>
              {models.length === 0 && <tr><Td colSpan={6} className="text-center text-fg-muted">No generations in this range.</Td></tr>}
              {models.map((m) => (
                <tr key={m.slug}><Td>{m.name}</Td><Td className="mono text-right">{usd(m.spendUsd)}</Td><Td className="mono text-right">{m.count}</Td><Td className="mono text-right">{usd(m.avgCostUsd, { precise: true })}</Td><Td className="mono text-right">{pct(m.successRate)}</Td><Td className="mono text-right">{duration(m.medianSeconds)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><h2 className="mb-4 font-semibold">By member</h2><BarList title="Spend by member" rows={members.map((m) => ({ key: m.memberId, label: m.name || m.email, value: m.spendUsd, sub: `${m.count}×`, budget: m.budgetUsd }))} /></Card>
          <Card className="p-5"><h2 className="mb-1 font-semibold">By team</h2><p className="mb-4 text-[12px] text-fg-subtle">A member in two teams counts toward both.</p><BarList title="Spend by team" rows={teams.map((t) => ({ key: t.teamId, label: t.name, value: t.spendUsd, sub: `${t.count}×`, budget: t.budgetUsd }))} /></Card>
        </div>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Status mix</h2>
          {finished === 0 ? <p className="text-sm text-fg-muted">No finished jobs in this range.</p> : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Completed ${s.completed}, failed ${s.failed}, moderated ${s.nsfw}, canceled ${s.canceled}`}>
                {[{ n: s.completed, c: "var(--ok)" }, { n: s.failed, c: "var(--danger)" }, { n: s.nsfw, c: "var(--warn)" }, { n: s.canceled, c: "var(--fg-subtle)" }].filter((x) => x.n > 0).map((x, i) => <span key={i} style={{ flex: x.n, background: x.c }} />)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-4 text-[13px] text-fg-muted">
                <li>Completed <span className="mono text-fg">{s.completed}</span></li>
                <li>Failed <span className="mono text-fg">{s.failed}</span></li>
                <li>Moderated <span className="mono text-fg">{s.nsfw}</span></li>
                <li>Canceled <span className="mono text-fg">{s.canceled}</span></li>
              </ul>
            </>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Override activity</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[["Requests", ov.requests], ["Approved", ov.approved], ["Declined", ov.declined], ["Expired", ov.expired], ["Pending", ov.pending]].map(([k, v]) => (
              <div key={k as string} className="rounded-[12px] bg-surface-2 p-3"><dt className="text-[12px] text-fg-muted">{k}</dt><dd className="mono mt-1 text-lg font-semibold">{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

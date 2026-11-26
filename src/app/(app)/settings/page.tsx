import { requireContext } from "@/lib/session";
import { getAuth, enabledSocialProviders } from "@/lib/auth";
import { headers } from "next/headers";
import { getPersonalCredentialRow, summarise } from "@/lib/credentials";
import { budgetUsage, effectiveFor, usageFor, spendForScope } from "@/lib/policy/load";
import { Page } from "@/components/page";
import { Card, PageHeader, Badge } from "@/components/ui";
import { usd, dateTime } from "@/lib/format";
import { AccountSection, PersonalKeySection, NotifySection } from "@/components/settings/sections";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const auth = getAuth();
  const h = await headers();
  const [sessions, accounts] = await Promise.all([auth.api.listSessions({ headers: h }), auth.api.listUserAccounts({ headers: h })]);
  const eff = await effectiveFor(ctx);
  const usage = await usageFor(ctx);
  const budgets = await budgetUsage(ctx, eff);
  const myOrgSpend = await spendForScope("member", ctx.member.id, ctx.org.id);
  const personal = ctx.org.settings.personalKeysAllowed ? await getPersonalCredentialRow(ctx.org.id, ctx.user.id) : undefined;
  const social = enabledSocialProviders();

  return (
    <Page>
      <PageHeader title="Settings" description={`Signed in as ${ctx.user.email} · ${ctx.role}`} />
      <div className="grid gap-6">
        <AccountSection
          user={{ name: ctx.user.name, email: ctx.user.email }}
          hasPassword={accounts.some((a) => a.providerId === "credential")}
          accounts={accounts.map((a) => ({ providerId: a.providerId, accountId: a.accountId }))}
          social={social}
          sessions={sessions.map((s) => ({ id: s.id, token: s.token, current: s.id === ctx.sessionId, userAgent: s.userAgent ?? null, ipAddress: s.ipAddress ?? null, updatedAt: (s.updatedAt as Date).toISOString() }))}
        />

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Usage this month</h2>
          <p className="mt-1 text-[13px] text-fg-subtle">Estimates for jobs on the organization key. Personal-key jobs don't count toward budgets.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[12px] bg-surface-2 p-3"><dt className="text-[13px] text-fg-muted">My spend</dt><dd className="mono mt-1 text-xl font-semibold">{usd(myOrgSpend)}</dd></div>
            <div className="rounded-[12px] bg-surface-2 p-3"><dt className="text-[13px] text-fg-muted">Generations today</dt><dd className="mono mt-1 text-xl font-semibold">{usage.generationsToday}{eff.dailyGenerationLimit ? <span className="text-fg-subtle"> / {eff.dailyGenerationLimit.value}</span> : null}</dd></div>
            <div className="rounded-[12px] bg-surface-2 p-3"><dt className="text-[13px] text-fg-muted">Running now</dt><dd className="mono mt-1 text-xl font-semibold">{usage.activeJobs}{eff.maxConcurrentJobs ? <span className="text-fg-subtle"> / {eff.maxConcurrentJobs.value}</span> : null}</dd></div>
          </dl>
          {budgets.length > 0 && (
            <ul className="mt-4 grid gap-3">
              {budgets.map((b) => {
                const pct = Math.min(100, (b.spentUsd / b.limitUsd) * 100);
                return (
                  <li key={`${b.source.scope}-${b.source.scopeId}`}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span>{b.source.scope === "org" ? "Organization budget" : b.source.scope === "team" ? `Team ${b.source.scopeName}` : "My budget"}</span>
                      <span className="mono text-fg-muted">{usd(b.spentUsd)} / {usd(b.limitUsd)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-fg-muted">
            {eff.paused && <Badge tone="warn">Generation paused</Badge>}
            {eff.maxVideoDuration && <Badge>Max video {eff.maxVideoDuration.value}s</Badge>}
            {eff.maxBatchSize && <Badge>Max batch {eff.maxBatchSize.value}</Badge>}
            {eff.maxUploadMb && <Badge>Uploads up to {eff.maxUploadMb.value} MB</Badge>}
            {eff.allowedModels && <Badge>{eff.allowedModels.value.size} allowed models</Badge>}
          </div>
        </Card>

        {ctx.org.settings.personalKeysAllowed && <PersonalKeySection credential={personal ? { ...summarise(personal), lastVerifiedAt: personal.lastVerifiedAt ? dateTime(personal.lastVerifiedAt) : null } : null} />}
        <NotifySection value={ctx.member.notifyOnFinish} />
      </div>
    </Page>
  );
}

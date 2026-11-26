import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, policy, team, user } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { listModels } from "@/lib/catalog/repo";
import { CATEGORY_LABELS } from "@/lib/catalog/types";
import { Badge, Card, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/action-ui";
import { cn } from "@/lib/cn";
import { clearPolicy, savePolicy } from "../actions";

export const metadata = { title: "Restrictions" };

function NumberField({ name, label, value, hint, step, suffix }: { name: string; label: string; value: string | number | null | undefined; hint?: string; step?: string; suffix?: string }) {
  return (
    <Field label={<>{label}{suffix && <span className="ml-1 font-normal text-fg-subtle">{suffix}</span>}</>} htmlFor={`p-${name}`} hint={hint ?? "Empty = no limit at this level"}>
      <Input id={`p-${name}`} name={name} type="number" min={0} step={step ?? "1"} inputMode="decimal" defaultValue={value === null || value === undefined ? "" : Number(value)} className="mono" />
    </Field>
  );
}

export default async function RestrictionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext("admin");
  const teams = await db.select().from(team).where(eq(team.organizationId, ctx.org.id)).orderBy(team.name);
  const members = await db.select({ id: member.id, email: user.email, name: user.name }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, ctx.org.id)).orderBy(user.email);
  const policies = await db.select().from(policy).where(eq(policy.organizationId, ctx.org.id));
  const scope = sp.scope === "team" || sp.scope === "member" ? sp.scope : "org";
  const scopeId = scope === "org" ? ctx.org.id : (sp.id ?? "");
  const target = scope === "org" ? { name: "Organization defaults" } : scope === "team" ? teams.find((t) => t.id === scopeId) : members.find((m) => m.id === scopeId);
  const current = policies.find((p) => p.scope === scope && p.scopeId === scopeId);
  const models = await listModels();
  const has = (s: string, id: string) => policies.some((p) => p.scope === s && p.scopeId === id);
  const label = (m: (typeof members)[number]) => m.name || m.email;

  const item = (href: string, text: string, on: boolean, badge?: boolean) => (
    <li key={href}>
      <Link href={href} aria-current={on ? "page" : undefined} className={cn("flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm", on ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg")}>
        <span className="truncate">{text}</span>
        {badge && <Badge tone="accent">rules</Badge>}
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title="Restrictions" description="Set rules for the whole organization, for teams and for individual members. For each limit the strictest value wins." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Scopes" className="grid content-start gap-4">
          <ul>{item("/admin/restrictions", "Organization defaults", scope === "org")}</ul>
          <div>
            <p className="mb-1 px-3 text-[12px] font-medium tracking-wide text-fg-subtle uppercase">Teams</p>
            <ul>{teams.length ? teams.map((t) => item(`/admin/restrictions?scope=team&id=${t.id}`, t.name, scope === "team" && scopeId === t.id, has("team", t.id))) : <li className="px-3 text-sm text-fg-subtle">No teams</li>}</ul>
          </div>
          <div>
            <p className="mb-1 px-3 text-[12px] font-medium tracking-wide text-fg-subtle uppercase">Members</p>
            <ul className="max-h-80 overflow-y-auto">{members.map((m) => item(`/admin/restrictions?scope=member&id=${m.id}`, label(m), scope === "member" && scopeId === m.id, has("member", m.id)))}</ul>
          </div>
        </nav>
        <Card className="p-5 sm:p-6">
          {!target ? (
            <Notice tone="warn">Pick a team or member on the left.</Notice>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{"name" in target && scope !== "member" ? target.name : label(target as (typeof members)[number])}</h2>
                  <p className="text-[13px] text-fg-subtle">
                    {scope === "org" ? "Applies to every member. The monthly budget caps total spend on the organization key." : scope === "team" ? "Applies to everyone in this team. The budget caps this team's total spend." : "Personal overrides. The budget caps this member's own spend."}
                  </p>
                </div>
                {scope !== "org" && current && <ActionButton variant="ghost" run={async () => { "use server"; return clearPolicy(scope as "team" | "member", scopeId); }} confirm="Remove all rules here?">Remove rules</ActionButton>}
              </div>
              <ActionForm action={savePolicy} key={`${scope}-${scopeId}`}>
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="scopeId" value={scopeId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField name="monthlyBudgetUsd" label="Monthly budget" suffix="USD" step="0.01" value={current?.monthlyBudgetUsd} hint="Hard stop at 100%. Members can request an override." />
                  <NumberField name="dailyGenerationLimit" label="Daily generation limit" suffix="per member" value={current?.dailyGenerationLimit} />
                  <NumberField name="maxConcurrentJobs" label="Max concurrent jobs" suffix="per member" value={current?.maxConcurrentJobs} />
                  <NumberField name="maxVideoDuration" label="Max video duration" suffix="seconds" value={current?.maxVideoDuration} hint="Includes multi-shot totals." />
                  <NumberField name="maxBatchSize" label="Max batch size" suffix="outputs per run" value={current?.maxBatchSize} />
                  <NumberField name="maxUploadMb" label="Max upload size" suffix="MB" value={current?.maxUploadMb} hint="Default 50 MB when no level sets one." />
                </div>
                <label className="mt-5 flex items-start gap-3 rounded-[12px] bg-surface-2 p-3">
                  <input type="checkbox" name="paused" defaultChecked={current?.paused} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="text-sm font-medium">Pause generation</span><span className="block text-[13px] text-fg-subtle">Block all new jobs at this level, for example during a review.</span></span>
                </label>
                <details className="mt-4 rounded-[12px] bg-surface-2 p-3" open={!!current?.allowedModels}>
                  <summary className="cursor-pointer text-sm font-medium">Allowed models {current?.allowedModels ? <span className="mono text-fg-subtle">({current.allowedModels.length})</span> : <span className="font-normal text-fg-subtle">· all enabled models</span>}</summary>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" name="restrictModels" defaultChecked={!!current?.allowedModels} className="h-4 w-4 accent-[var(--accent)]" /> Only allow the models checked below
                  </label>
                  <div className="mt-3 grid gap-4">
                    {(["image", "edit", "video", "motion", "character"] as const).map((c) => (
                      <fieldset key={c}>
                        <legend className="mb-1.5 text-[12px] font-medium tracking-wide text-fg-subtle uppercase">{CATEGORY_LABELS[c]}</legend>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {models.filter((m) => m.category === c).map((m) => (
                            <label key={m.slug} className={cn("flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] hover:bg-surface-2", !m.enabled && "text-fg-subtle")}>
                              <input type="checkbox" name="allowedModels" value={m.slug} defaultChecked={current?.allowedModels?.includes(m.slug)} className="h-4 w-4 accent-[var(--accent)]" />
                              <span className="truncate">{m.name}</span>{!m.enabled && <span className="text-[11px]">(off)</span>}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </details>
              </ActionForm>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, LockSimple, MagicWand } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { preset, team } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { getModel } from "@/lib/catalog/repo";
import { presetUsage } from "@/lib/presets/repo";
import { Card, Field, Input, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/action-ui";
import { TemplateField } from "@/components/presets/template-field";
import { deletePreset, savePresetDetails, setPresetArchived } from "../actions";

export const metadata = { title: "Preset" };

const show = (v: unknown) => (v === undefined ? "model default" : Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : typeof v === "object" && v !== null ? "custom" : String(v));

export default async function PresetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext("admin");
  const [p] = await db.select().from(preset).where(and(eq(preset.id, id), eq(preset.organizationId, ctx.org.id)));
  if (!p) notFound();
  const model = await getModel(p.modelSlug);
  const teams = await db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, ctx.org.id)).orderBy(team.name);
  const uses = (await presetUsage(ctx.org.id)).get(p.id) ?? 0;
  const lockable = (model?.fields ?? []).filter((f) => f.kind !== "prompt");

  return (
    <>
      <Link href="/admin/presets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft size={14} aria-hidden /> Presets</Link>
      <PageHeader
        title={p.name}
        description={<>{model?.name ?? p.modelSlug}<span className="mx-2 text-fg-subtle">/</span><span className="mono">{uses}</span> generations</>}
        actions={<LinkButton href={`/studio?preset=${p.id}`} size="sm"><MagicWand size={16} aria-hidden /> Open in studio</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-6">
          <ActionForm action={savePresetDetails} submitLabel="Save preset">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-5">
              <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={p.name} maxLength={80} required /></Field>
              <Field label="Description" htmlFor="description" optional hint="Shown to members in the studio's preset list."><Input id="description" name="description" defaultValue={p.description ?? ""} maxLength={300} /></Field>
              <TemplateField defaultValue={p.promptTemplate ?? ""} />

              <fieldset>
                <legend className="mb-1 text-sm font-medium">Locked settings</legend>
                <p className="mb-3 text-[13px] text-fg-subtle">Members can't change these. HiggsArena enforces them on the server.</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] bg-surface-2/60 px-3 py-2.5 has-[:checked]:bg-accent-soft">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">Prompt</span>
                      <span className="block truncate text-[12px] text-fg-subtle">Members only fill in the template fields</span>
                    </span>
                    <input type="checkbox" name="lockedFields" value="prompt" defaultChecked={p.lockedFields.includes("prompt")} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                  </label>
                  {lockable.map((f) => (
                    <label key={f.name} className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] bg-surface-2/60 px-3 py-2.5 has-[:checked]:bg-accent-soft">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{f.label}</span>
                        <span className="mono block truncate text-[12px] text-fg-subtle">{show(p.params[f.name])}</span>
                      </span>
                      <input type="checkbox" name="lockedFields" value={f.name} defaultChecked={p.lockedFields.includes(f.name)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    </label>
                  ))}
                </div>
              </fieldset>

              {teams.length > 0 && (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">Who can use it</legend>
                  <p className="mb-3 text-[13px] text-fg-subtle">Leave all unticked to share with everyone.</p>
                  <div className="flex flex-wrap gap-2">
                    {teams.map((t) => (
                      <label key={t.id} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text">
                        <input type="checkbox" name="teamIds" value={t.id} defaultChecked={p.teamIds.includes(t.id)} className="accent-[var(--accent)]" /> {t.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </ActionForm>
        </Card>

        <div className="grid content-start gap-4">
          <Card className="p-5">
            <h2 className="font-semibold">Starting values</h2>
            <p className="mt-1 text-[13px] text-fg-subtle">To change these, open the preset in the studio, adjust the settings and choose Update preset.</p>
            <dl className="mt-4 grid gap-2 text-[13px]">
              {Object.keys(p.params).length === 0 && <p className="text-fg-subtle">Model defaults for everything.</p>}
              {Object.entries(p.params).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="flex items-center gap-1.5 truncate text-fg-muted">{p.lockedFields.includes(k) && <LockSimple size={12} className="text-accent-text" aria-label="locked" />}{lockable.find((f) => f.name === k)?.label ?? k}</dt>
                  <dd className="mono truncate text-fg">{show(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">{p.archivedAt ? "Archived" : "Archive"}</h2>
            <p className="mt-1 text-[13px] text-fg-subtle">{p.archivedAt ? "Members can't see this preset. Past generations keep their link to it." : "Hide it from members without losing its history."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton run={async () => { "use server"; return setPresetArchived(p.id, !p.archivedAt); }}>{p.archivedAt ? "Restore" : "Archive"}</ActionButton>
              <ActionButton variant="danger" confirm="Delete for good?" run={async () => { "use server"; return deletePreset(p.id); }}>Delete</ActionButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

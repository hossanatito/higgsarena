import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { BookmarkSimple, LockSimple, MagicWand, UsersThree } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { preset, team } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { listModels } from "@/lib/catalog/repo";
import { presetUsage } from "@/lib/presets/repo";
import { templateVariables } from "@/lib/presets/core";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Presets" };

export default async function PresetsPage() {
  const ctx = await requireContext("admin");
  const rows = await db.select().from(preset).where(eq(preset.organizationId, ctx.org.id)).orderBy(desc(preset.updatedAt));
  const models = new Map((await listModels()).map((m) => [m.slug, m]));
  const teams = new Map((await db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, ctx.org.id))).map((t) => [t.id, t.name]));
  const uses = await presetUsage(ctx.org.id);
  const active = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);

  const card = (p: (typeof rows)[number]) => {
    const m = models.get(p.modelSlug);
    const vars = templateVariables(p.promptTemplate);
    return (
      <li key={p.id}>
        <Link href={`/admin/presets/${p.id}`} className="group flex h-full flex-col rounded-[16px] bg-surface p-5 ring-1 ring-border transition-colors ring-inset hover:bg-surface-2/60">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">{p.name}</p>
              <p className="truncate text-[13px] text-fg-subtle">{m?.name ?? p.modelSlug}</p>
            </div>
            {p.archivedAt ? <Badge>Archived</Badge> : <span className="mono shrink-0 text-[12px] text-fg-subtle">{uses.get(p.id) ?? 0} uses</span>}
          </div>
          {p.description && <p className="mt-3 line-clamp-2 text-[14px] text-fg-muted">{p.description}</p>}
          {p.promptTemplate && <p className="mt-3 line-clamp-2 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-fg-muted">{p.promptTemplate}</p>}
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4 text-[12px]">
            {p.lockedFields.length > 0 && <Badge><LockSimple size={11} aria-hidden /> {p.lockedFields.length} locked</Badge>}
            {vars.length > 0 && <Badge tone="accent">{vars.length} to fill in</Badge>}
            <Badge><UsersThree size={11} aria-hidden /> {p.teamIds.length ? p.teamIds.map((t) => teams.get(t)).filter(Boolean).join(", ") : "Everyone"}</Badge>
          </div>
          <p className="mt-3 text-[12px] text-fg-subtle">Updated <time suppressHydrationWarning>{relativeTime(p.updatedAt)}</time></p>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Presets"
        description="Prompt templates and brand presets give everyone the same starting point. Locked settings can't be changed by members."
        actions={<LinkButton href="/studio?savePreset=1" variant="primary" size="sm"><MagicWand size={16} aria-hidden /> New in studio</LinkButton>}
      />
      {active.length === 0 ? (
        <div className="rounded-[16px] bg-surface ring-1 ring-border ring-inset">
          <EmptyState icon={<BookmarkSimple size={28} />} title="No presets yet" body="Set up a generation in the studio with the model and settings you want, then choose Save as preset from the Presets menu." action={<LinkButton href="/studio?savePreset=1" variant="primary">Open the studio</LinkButton>} />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{active.map(card)}</ul>
      )}
      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">Archived <span className="mono">{archived.length}</span></summary>
          <ul className="mt-3 grid gap-3 opacity-80 md:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</ul>
        </details>
      )}
    </>
  );
}

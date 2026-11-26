import Link from "next/link";
import { FolderSimple, LinkSimple, UsersThree } from "@phosphor-icons/react/ssr";
import { requireContext } from "@/lib/session";
import { listCollections } from "@/lib/collections";
import { Page } from "@/components/page";
import { EmptyState, PageHeader } from "@/components/ui";
import { LibraryTabs } from "@/components/collections/library-tabs";
import { NewCollection } from "@/components/collections/new-collection";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const ctx = await requireContext();
  const list = await listCollections(ctx);
  const mine = list.filter((c) => c.mine);
  const others = list.filter((c) => !c.mine);

  const grid = (items: typeof list) => (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/collections/${c.id}`} className="group block">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-surface-2 ring-1 ring-white/[0.06] ring-inset">
              {c.covers.length === 0 ? (
                <div className="grid h-full place-items-center text-fg-subtle"><FolderSimple size={36} aria-hidden /></div>
              ) : (
                <div className={`grid h-full gap-0.5 ${c.covers.length > 1 ? "grid-cols-2" : ""} ${c.covers.length > 2 ? "grid-rows-2" : ""}`}>
                  {c.covers.map((m, i) =>
                    m.kind === "video" ? (
                      <video key={i} src={m.url} muted playsInline preload="metadata" className={`h-full w-full object-cover ${c.covers.length === 3 && i === 0 ? "row-span-2" : ""}`} />
                    ) : (
                      <img key={i} src={m.url} alt="" loading="lazy" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${c.covers.length === 3 && i === 0 ? "row-span-2" : ""}`} />
                    ),
                  )}
                </div>
              )}
              <div className="pointer-events-none absolute top-2.5 right-2.5 flex gap-1">
                {c.shared && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-black/55 px-2 text-[11px] font-medium text-white backdrop-blur-md"><LinkSimple size={12} aria-hidden /> Link on</span>}
                {c.visibility === "team" && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-black/55 px-2 text-[11px] font-medium text-white backdrop-blur-md"><UsersThree size={12} aria-hidden /> Team</span>}
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-3 px-0.5">
              <p className="fade-x min-w-0 flex-1 font-medium whitespace-nowrap">{c.name}</p>
              <p className="mono shrink-0 text-[12px] text-fg-subtle">{c.count}</p>
            </div>
            <p className="px-0.5 text-[12px] text-fg-subtle">{c.mine ? "Yours" : c.owner}, updated <time suppressHydrationWarning>{relativeTime(c.updatedAt)}</time></p>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <Page wide>
      <LibraryTabs active="collections" />
      <PageHeader title="Collections" description="Group results into boards. Share them with your team, or with clients through a read-only link." actions={<NewCollection />} />
      {list.length === 0 ? (
        <div className="rounded-[16px] bg-surface ring-1 ring-border ring-inset">
          <EmptyState icon={<FolderSimple size={28} />} title="No collections yet" body="Create one here, or add a result from the studio or the library with the folder button." />
        </div>
      ) : (
        <div className="grid gap-10">
          {mine.length > 0 && grid(mine)}
          {others.length > 0 && (
            <section>
              <h2 className="mb-4 text-[15px] font-semibold">Shared with the team</h2>
              {grid(others)}
            </section>
          )}
        </div>
      )}
    </Page>
  );
}

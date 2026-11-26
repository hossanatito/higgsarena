"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Images, Heart } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { EmptyState, LinkButton, Select } from "@/components/ui";
import { JobCard } from "@/components/studio/job-card";
import type { ClientGeneration } from "@/components/studio/types";
import { Viewer } from "./viewer";

type Item = ClientGeneration & { owner: string };

export function LibraryView({ items: initial, filters, models, members, teams, isAdmin, hasShared, page, hasMore }: { items: Item[]; filters: Record<string, string | undefined>; models: { slug: string; name: string }[]; members: { id: string; email: string; name: string }[]; teams: { id: string; name: string }[]; isAdmin: boolean; hasShared: boolean; page: number; hasMore: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [items, setItems] = useState(initial);
  const [viewing, setViewing] = useState<Item | null>(null);

  const set = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/library?${next.toString()}`);
  };
  const scope = filters.scope ?? "mine";

  const favorite = async (g: ClientGeneration) => {
    const res = await fetch(`/api/generations/${g.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: !g.favorite }) });
    const data = await res.json();
    if (data.generation) {
      setItems((list) => list.map((x) => (x.id === g.id ? { ...x, ...data.generation } : x)));
      setViewing((v) => (v?.id === g.id ? { ...v, ...data.generation } : v));
    }
  };
  const remove = async (g: ClientGeneration) => {
    const res = await fetch(`/api/generations/${g.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((list) => list.filter((x) => x.id !== g.id));
      setViewing(null);
    }
  };

  const pageHref = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    return `/library?${next.toString()}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3">
        {(isAdmin || hasShared) && (
          <div role="tablist" aria-label="Whose generations" className="flex gap-1.5">
            {[{ id: "mine", label: "Mine" }, ...(hasShared ? [{ id: "shared", label: "Team library" }] : []), ...(isAdmin ? [{ id: "org", label: "Everyone" }] : [])].map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={scope === t.id} onClick={() => set("scope", t.id === "mine" ? undefined : t.id)} className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium", scope === t.id ? "bg-fg text-bg" : "border border-border text-fg-muted hover:text-fg")}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <label className="sr-only" htmlFor="flt-type">Type</label>
          <Select id="flt-type" className="h-10 sm:w-36" value={filters.type ?? ""} onChange={(e) => set("type", e.target.value || undefined)}>
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </Select>
          <label className="sr-only" htmlFor="flt-model">Model</label>
          <Select id="flt-model" className="h-10 sm:w-56" value={filters.model ?? ""} onChange={(e) => set("model", e.target.value || undefined)}>
            <option value="">All models</option>
            {models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </Select>
          <label className="sr-only" htmlFor="flt-status">Status</label>
          <Select id="flt-status" className="h-10 sm:w-40" value={filters.status ?? ""} onChange={(e) => set("status", e.target.value || undefined)}>
            <option value="">Any status</option>
            <option value="completed">Done</option>
            <option value="in_progress">Rendering</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
            <option value="nsfw">Moderated</option>
            <option value="canceled">Canceled</option>
          </Select>
          <label className="sr-only" htmlFor="flt-from">From date</label>
          <input id="flt-from" type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} className="h-10 rounded-[10px] border border-border bg-bg-elevated px-3 text-sm text-fg" />
          <label className="sr-only" htmlFor="flt-to">To date</label>
          <input id="flt-to" type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} className="h-10 rounded-[10px] border border-border bg-bg-elevated px-3 text-sm text-fg" />
          {scope === "org" && (
            <>
              <label className="sr-only" htmlFor="flt-member">Member</label>
              <Select id="flt-member" className="h-10 sm:w-52" value={filters.member ?? ""} onChange={(e) => set("member", e.target.value || undefined)}>
                <option value="">All members</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </Select>
              <label className="sr-only" htmlFor="flt-team">Team</label>
              <Select id="flt-team" className="h-10 sm:w-44" value={filters.team ?? ""} onChange={(e) => set("team", e.target.value || undefined)}>
                <option value="">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </>
          )}
          <button type="button" aria-pressed={filters.fav === "1"} onClick={() => set("fav", filters.fav === "1" ? undefined : "1")} className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm", filters.fav === "1" ? "border-transparent bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:text-fg")}>
            <Heart size={16} weight={filters.fav === "1" ? "fill" : "regular"} aria-hidden /> Favourites
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Images size={28} />} title={Object.keys(filters).some((k) => k !== "scope") ? "Nothing matches these filters" : "No generations yet"} body="Generated images and videos land here." action={<LinkButton href="/studio" variant="primary">Open the studio</LinkButton>} />
      ) : (
        <div className="masonry columns-2 md:columns-3 xl:columns-4">
          {items.map((g) => (
            <div key={g.id}>
              <JobCard g={g} onOpen={() => setViewing(g)} onFavorite={g.mine ? favorite : undefined} onRemix={() => router.push(`/studio?remix=${g.id}`)} />
              {scope !== "mine" && <p className="mt-1 truncate px-1 text-[12px] text-fg-subtle">{g.owner}</p>}
            </div>
          ))}
        </div>
      )}
      {(page > 1 || hasMore) && (
        <nav aria-label="Pages" className="mt-6 flex justify-center gap-2">
          {page > 1 && <Link href={pageHref(page - 1)} className="h-10 rounded-full border border-border px-4 leading-10 text-sm">Newer</Link>}
          {hasMore && <Link href={pageHref(page + 1)} className="h-10 rounded-full border border-border px-4 leading-10 text-sm">Older</Link>}
        </nav>
      )}
      <Viewer g={viewing} owner={viewing && !viewing.mine ? viewing.owner : undefined} onClose={() => setViewing(null)} onRemix={(g) => router.push(`/studio?remix=${g.id}`)} onFavorite={viewing?.mine || isAdmin ? favorite : undefined} onDelete={viewing?.mine || isAdmin ? remove : undefined} />
    </>
  );
}

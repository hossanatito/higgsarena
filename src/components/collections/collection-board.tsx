"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, FolderSimple, LinkSimple, LinkSimpleBreak, LockSimple, Trash, UsersThree } from "@phosphor-icons/react";
import { Button, EmptyState, LinkButton } from "@/components/ui";
import { Switch } from "@/components/studio/fields";
import { JobCard } from "@/components/studio/job-card";
import { Viewer } from "@/components/library/viewer";
import type { ClientGeneration } from "@/components/studio/types";
import { cn } from "@/lib/cn";
import { dateTime, relativeTime } from "@/lib/format";
import { createShareLink, deleteCollection, disableShareLink, setInCollection, updateCollection, updateShareOptions } from "@/app/(app)/collections/actions";

type Info = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "team";
  owner: string;
  share: { expiresAt: string | null; showPrompts: boolean; createdAt: string | null } | null;
};

const EXPIRY: { label: string; days: 7 | 30 | 90 | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "No expiry", days: null },
];

function SharePanel({ info, onChanged }: { info: Info; onChanged: () => void }) {
  const [days, setDays] = useState<7 | 30 | 90 | null>(30);
  const [showPrompts, setShowPrompts] = useState(info.share?.showPrompts ?? false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section aria-labelledby="share-h" className="rounded-[16px] bg-surface p-5 ring-1 ring-border ring-inset">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="share-h" className="flex items-center gap-2 font-semibold">
            <LinkSimple size={18} className={info.share ? "text-accent-text" : "text-fg-muted"} aria-hidden /> Read-only link
          </h2>
          <p className="mt-1 text-[13px] text-fg-subtle">Anyone with the link can view the finished images and videos. No sign-in, no costs, no names.</p>
        </div>
      </div>

      {url && (
        <div className="mt-4 rounded-[12px] bg-accent-soft p-3">
          <p className="text-[12px] text-fg-muted">Copy it now. For security, the link can't be shown again.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={url} aria-label="Read-only link" onFocus={(e) => e.currentTarget.select()} className="mono h-9 min-w-0 flex-1 rounded-full bg-bg-elevated px-3.5 text-[12px] text-fg focus:outline-none" />
            <button type="button" onClick={copy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-fg">
              {copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {info.share && !url && (
        <p className="mt-4 text-[13px] text-fg-muted">
          On since <time suppressHydrationWarning>{relativeTime(info.share.createdAt)}</time>. {info.share.expiresAt ? <>Works until {dateTime(info.share.expiresAt)}.</> : "Never expires."}
        </p>
      )}

      <div className="mt-4 grid gap-4">
        {(!info.share || url) && (
          <div>
            <p id="exp-l" className="mb-2 text-[13px] font-medium">Link works for</p>
            <div role="radiogroup" aria-labelledby="exp-l" className="grid grid-cols-4 rounded-full bg-surface-2 p-1">
              {EXPIRY.map((e) => (
                <button key={e.label} type="button" role="radio" aria-checked={days === e.days} onClick={() => setDays(e.days)} className={cn("h-8 rounded-full text-[12px] transition-colors", days === e.days ? "bg-[var(--seg-on)] text-fg shadow-[0_1px_3px_rgb(0_0_0/0.25)]" : "text-fg-muted hover:text-fg")}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="share-prompts" className="min-w-0 cursor-pointer">
            <span className="block text-[13px] font-medium">Show prompts and models</span>
            <span className="block text-[12px] text-fg-subtle">Off: viewers only see the media.</span>
          </label>
          <Switch
            id="share-prompts"
            label="Show prompts and models"
            checked={showPrompts}
            onChange={(v) => {
              setShowPrompts(v);
              if (info.share && !url) start(async () => { const r = await updateShareOptions(info.id, v); setMsg({ ok: r.ok, text: r.message }); onChanged(); });
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={info.share ? "secondary" : "primary"}
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createShareLink(info.id, { expiresInDays: days, showPrompts });
                setMsg(r.ok ? null : { ok: false, text: r.message });
                if (r.url) setUrl(r.url);
                onChanged();
              })
            }
          >
            <LinkSimple size={16} aria-hidden /> {info.share ? "Create a new link" : "Create link"}
          </Button>
          {info.share && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await disableShareLink(info.id); setUrl(null); setMsg({ ok: r.ok, text: r.message }); onChanged(); })}>
              <LinkSimpleBreak size={16} aria-hidden /> Turn off
            </Button>
          )}
        </div>
        {info.share && !url && <p className="text-[12px] text-fg-subtle">A new link replaces the current one; the old one stops working.</p>}
        {msg && <p role="status" className={cn("text-[13px]", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</p>}
      </div>
    </section>
  );
}

export function CollectionBoard({ collection: info, editable, items: initial }: { collection: Info; editable: boolean; items: ClientGeneration[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [viewing, setViewing] = useState<ClientGeneration | null>(null);
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description ?? "");
  const [visibility, setVisibility] = useState(info.visibility);
  const [, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveText = () => {
    if (name.trim() === info.name && (description.trim() || null) === info.description) return;
    start(async () => {
      await updateCollection(info.id, { name, description });
      router.refresh();
    });
  };
  const remove = (g: ClientGeneration) => {
    setItems((list) => list.filter((x) => x.id !== g.id));
    start(async () => {
      await setInCollection(info.id, g.id, false);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-6">
          {editable ? (
            <>
              <label htmlFor="col-name" className="sr-only">Collection name</label>
              <input id="col-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} maxLength={80} className="w-full rounded-[10px] bg-transparent text-2xl font-bold tracking-tight text-fg outline-none hover:bg-surface-2/50 focus:bg-surface-2/60 sm:text-[28px]" />
              <label htmlFor="col-desc" className="sr-only">Description</label>
              <input id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveText} maxLength={300} placeholder="Add a description" className="mt-1 w-full rounded-[8px] bg-transparent text-[15px] text-fg-muted outline-none placeholder:text-fg-subtle hover:bg-surface-2/50 focus:bg-surface-2/60" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{info.name}</h1>
              {info.description && <p className="mt-1 text-[15px] text-fg-muted">{info.description}</p>}
            </>
          )}
          <p className="mt-2 text-[13px] text-fg-subtle"><span className="mono">{items.length}</span> item{items.length === 1 ? "" : "s"}, by {info.owner}</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[16px] bg-surface ring-1 ring-border ring-inset">
            <EmptyState icon={<FolderSimple size={28} />} title="This collection is empty" body="Open the library or the studio and use the folder button on any result to add it here." action={<LinkButton href="/library" variant="primary">Open the library</LinkButton>} />
          </div>
        ) : (
          <div className="masonry columns-2 md:columns-3">
            {items.map((g) => (
              <div key={g.id}>
                <JobCard g={g} onOpen={setViewing} onRemove={editable ? remove : undefined} />
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="grid content-start gap-4">
        {editable && (
          <section aria-labelledby="vis-h" className="rounded-[16px] bg-surface p-5 ring-1 ring-border ring-inset">
            <h2 id="vis-h" className="font-semibold">Who can see it</h2>
            <div role="radiogroup" aria-labelledby="vis-h" className="mt-3 grid gap-1.5">
              {([
                { v: "private" as const, icon: LockSimple, label: "Only me", body: "Admins can still see it." },
                { v: "team" as const, icon: UsersThree, label: "Everyone in the studio", body: "Teammates can view; only you can edit." },
              ]).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === o.v}
                  onClick={() => {
                    setVisibility(o.v);
                    start(async () => { await updateCollection(info.id, { visibility: o.v }); router.refresh(); });
                  }}
                  className={cn("flex items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors", visibility === o.v ? "bg-surface-2 ring-1 ring-accent-text/50 ring-inset" : "hover:bg-surface-2/60")}
                >
                  <o.icon size={18} className={cn("mt-0.5 shrink-0", visibility === o.v ? "text-accent-text" : "text-fg-muted")} aria-hidden />
                  <span>
                    <span className="block text-[13px] font-medium">{o.label}</span>
                    <span className="block text-[12px] text-fg-subtle">{o.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {editable && <SharePanel info={info} onChanged={() => router.refresh()} />}
        {!editable && <p className="text-[13px] text-fg-subtle">You can view this collection. Only its owner and admins can change it.</p>}
        {editable && (
          <div className="px-1">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-fg-muted">Delete the collection? Results stay in the library.</span>
                <Button size="sm" variant="danger" onClick={() => start(async () => { await deleteCollection(info.id); })}>Delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-danger">
                <Trash size={14} aria-hidden /> Delete collection
              </button>
            )}
          </div>
        )}
        <Link href="/collections" className="px-1 text-[13px] text-accent-text hover:underline">All collections</Link>
      </aside>

      <Viewer g={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

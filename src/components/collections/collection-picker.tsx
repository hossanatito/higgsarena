"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, FolderSimple, Plus } from "@phosphor-icons/react";
import { Dialog } from "@/components/dialog";
import { cn } from "@/lib/cn";
import { collectionsForPicker, createCollection, setInCollection } from "@/app/(app)/collections/actions";

type Row = { id: string; name: string; count: number; has: boolean };

/** Add one result to any number of collections, or start a new one. */
export function CollectionPicker({ generationId, onClose }: { generationId: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!generationId) return;
    let live = true;
    const t = setTimeout(async () => {
      const list = await collectionsForPicker(generationId);
      if (live) setRows(list);
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
      setRows(null);
      setMessage(null);
      setName("");
    };
  }, [generationId]);

  const toggle = (r: Row) => {
    if (!generationId) return;
    setRows((list) => list?.map((x) => (x.id === r.id ? { ...x, has: !x.has, count: x.count + (x.has ? -1 : 1) } : x)) ?? null);
    start(async () => {
      const res = await setInCollection(r.id, generationId, !r.has);
      setMessage({ ok: res.ok, text: res.message });
      if (!res.ok) setRows((list) => list?.map((x) => (x.id === r.id ? r : x)) ?? null);
    });
  };
  const create = () =>
    start(async () => {
      if (!generationId) return;
      const res = await createCollection({ name, addGenerationId: generationId });
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok && res.id) {
        setRows((list) => [{ id: res.id!, name: name.trim(), count: 1, has: true }, ...(list ?? [])]);
        setName("");
      }
    });

  return (
    <Dialog open={!!generationId} onClose={onClose} title="Add to collection">
      <div className="grid gap-4">
        <ul className="fade-y -mx-1 max-h-[46dvh] overflow-y-auto px-1">
          {rows === null && [0, 1, 2].map((i) => <li key={i} className="shimmer mb-1.5 h-12 rounded-[12px]" />)}
          {rows?.length === 0 && <li className="py-4 text-center text-[13px] text-fg-muted">No collections yet. Name one below.</li>}
          {rows?.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => toggle(r)} aria-pressed={r.has} className={cn("flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors", r.has ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", r.has ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted")} aria-hidden>
                  {r.has ? <Check size={16} weight="bold" /> : <FolderSimple size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="fade-x block whitespace-nowrap text-sm font-medium">{r.name}</span>
                  <span className="mono block text-[12px] text-fg-subtle">{r.count} item{r.count === 1 ? "" : "s"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label htmlFor="new-collection" className="sr-only">New collection name</label>
          <input id="new-collection" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New collection" className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm text-fg placeholder:text-fg-subtle focus:bg-surface-3 focus:outline-none" />
          <button type="submit" disabled={!name.trim() || pending} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-fg disabled:opacity-40">
            <Plus size={14} weight="bold" aria-hidden /> Create
          </button>
        </form>
        <div className="flex items-center justify-between gap-3">
          {message ? <p role="status" className={cn("text-[13px]", message.ok ? "text-ok" : "text-danger")}>{message.text}</p> : <span />}
          <Link href="/collections" className="shrink-0 text-[13px] text-accent-text hover:underline">All collections</Link>
        </div>
      </div>
    </Dialog>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "@phosphor-icons/react";
import { createCollection } from "@/app/(app)/collections/actions";

export function NewCollection() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex w-full gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createCollection({ name });
          if (r.ok && r.id) router.push(`/collections/${r.id}`);
          else setError(r.message);
        });
      }}
    >
      <label htmlFor="new-col" className="sr-only">Collection name</label>
      <input id="new-col" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name a new collection" className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm text-fg placeholder:text-fg-subtle focus:bg-surface-3 focus:outline-none sm:w-64" aria-describedby={error ? "new-col-err" : undefined} />
      <button type="submit" disabled={!name.trim() || pending} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-fg disabled:opacity-40">
        <Plus size={14} weight="bold" aria-hidden /> Create
      </button>
      {error && <p id="new-col-err" role="alert" className="sr-only">{error}</p>}
    </form>
  );
}

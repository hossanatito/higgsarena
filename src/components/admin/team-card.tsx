"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { Button, Card, Input, Select } from "@/components/ui";
import { Switch } from "@/components/studio/fields";
import { usd } from "@/lib/format";
import { ActionButton, ResultMessage } from "./action-ui";
import { deleteTeam, setTeamMember, updateTeam, type ActionResult } from "@/app/(app)/admin/actions";

export function TeamCard({ t, members, all, spend, count, budget }: { t: { id: string; name: string; sharedLibrary: boolean }; members: { id: string; label: string }[]; all: { id: string; label: string }[]; spend: number; count: number; budget: number | null }) {
  const router = useRouter();
  const [name, setName] = useState(t.name);
  const [shared, setShared] = useState(t.sharedLibrary);
  const [add, setAdd] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setResult(r); router.refresh(); });
  const candidates = all.filter((a) => !members.some((m) => m.id === a.id));
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`tn-${t.id}`} className="mb-1.5 block text-[13px] font-medium text-fg-muted">Team name</label>
          <Input id={`tn-${t.id}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-10" />
        </div>
        {name !== t.name && <Button size="sm" className="h-10" disabled={pending} onClick={() => run(() => updateTeam(t.id, { name }))}>Rename</Button>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[12px] bg-surface-2 p-2"><p className="text-[11px] text-fg-muted">This month</p><p className="mono text-sm font-semibold">{usd(spend)}</p></div>
        <div className="rounded-[12px] bg-surface-2 p-2"><p className="text-[11px] text-fg-muted">Budget</p><p className="mono text-sm font-semibold">{budget !== null ? usd(budget) : "-"}</p></div>
        <div className="rounded-[12px] bg-surface-2 p-2"><p className="text-[11px] text-fg-muted">Jobs</p><p className="mono text-sm font-semibold">{count}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Shared library</p>
          <p className="text-[12px] text-fg-subtle">Teammates can view each other's results.</p>
        </div>
        <Switch id={`sl-${t.id}`} label="Shared library" checked={shared} onChange={(v) => { setShared(v); run(() => updateTeam(t.id, { sharedLibrary: v })); }} />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">Members <span className="mono text-fg-subtle">{members.length}</span></p>
        <ul className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <li key={m.id} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-2 pr-1 pl-3 text-[13px]">
              {m.label}
              <button type="button" aria-label={`Remove ${m.label} from ${t.name}`} onClick={() => run(() => setTeamMember(t.id, m.id, false))} className="grid h-6 w-6 place-items-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg"><X size={12} aria-hidden /></button>
            </li>
          ))}
          {members.length === 0 && <li className="text-[13px] text-fg-subtle">No members yet.</li>}
        </ul>
        {candidates.length > 0 && (
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor={`add-${t.id}`}>Add member</label>
            <Select id={`add-${t.id}`} value={add} onChange={(e) => setAdd(e.target.value)} className="h-9 text-sm"><option value="">Add a member…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
            <Button size="sm" disabled={!add || pending} onClick={() => { const id = add; setAdd(""); run(() => setTeamMember(t.id, id, true)); }}>Add</Button>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Link href={`/admin/restrictions?scope=team&id=${t.id}`} className="text-sm text-accent-text hover:underline">Team rules and budget</Link>
        <ActionButton variant="ghost" run={() => deleteTeam(t.id)} onDone={() => router.refresh()} confirm="Delete this team?">Delete team</ActionButton>
      </div>
      <ResultMessage result={result} className="mt-2" />
    </Card>
  );
}

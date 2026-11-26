"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { ResultMessage } from "./action-ui";
import { decideOverrideAction, type ActionResult } from "@/app/(app)/admin/actions";

export function OverrideDecision({ id, raiseHref }: { id: string; raiseHref: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "approve" | "decline") => start(async () => { const r = await decideOverrideAction(id, d, note || undefined); setResult(r); if (r.ok) router.refresh(); });
  return (
    <div className="grid gap-2">
      <label className="sr-only" htmlFor={`note-${id}`}>Note to the member</label>
      <Input id={`note-${id}`} placeholder="Optional note to the member" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="h-10" />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={pending} onClick={() => decide("approve")}>Approve this job</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => decide("decline")}>Decline</Button>
        <Link href={raiseHref} className="inline-flex h-9 items-center rounded-full px-3 text-sm text-accent-text hover:underline">Raise the limit</Link>
      </div>
      <ResultMessage result={result} />
    </div>
  );
}

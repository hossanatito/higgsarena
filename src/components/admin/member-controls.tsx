"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/db/schema";
import { Select } from "@/components/ui";
import { ActionButton, ResultMessage } from "./action-ui";
import { changeRole, removeMember, resendInvite, revokeInvite, setSuspended, transferOwnership, type ActionResult } from "@/app/(app)/admin/actions";

export function RoleSelect({ memberId, role, canEdit, isOwnerViewer }: { memberId: string; role: Role; canEdit: boolean; isOwnerViewer: boolean }) {
  const [value, setValue] = useState(role);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (!canEdit) return <span className="capitalize text-fg-muted">{role}</span>;
  return (
    <div>
      <label className="sr-only" htmlFor={`role-${memberId}`}>Role</label>
      <Select id={`role-${memberId}`} className="h-9 w-32 text-sm" value={value} disabled={pending} onChange={(e) => { const r = e.target.value as Role; const prev = value; setValue(r); start(async () => { const res = await changeRole(memberId, r); setResult(res); if (!res.ok) setValue(prev); }); }}>
        <option value="member">Member</option>
        {isOwnerViewer && <option value="admin">Admin</option>}
        {isOwnerViewer && role === "owner" && <option value="owner">Owner</option>}
      </Select>
      {result && !result.ok && <ResultMessage result={result} className="mt-1" />}
    </div>
  );
}

export function MemberActions({ memberId, suspended, canEdit, canTransfer }: { memberId: string; suspended: boolean; canEdit: boolean; canTransfer: boolean }) {
  const router = useRouter();
  if (!canEdit) return null;
  const done = () => router.refresh();
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <ActionButton variant="ghost" run={() => setSuspended(memberId, !suspended)} onDone={done} confirm={suspended ? undefined : "Suspend and sign out?"}>{suspended ? "Reactivate" : "Suspend"}</ActionButton>
      <ActionButton variant="ghost" run={() => removeMember(memberId)} onDone={done} confirm="Remove from the studio?">Remove</ActionButton>
      {canTransfer && <ActionButton variant="ghost" run={() => transferOwnership(memberId)} onDone={done} confirm="Make them owner? You become admin.">Make owner</ActionButton>}
    </div>
  );
}

export function InviteActions({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <ActionButton variant="ghost" run={() => resendInvite(id)} onDone={(r) => { setMsg(r); router.refresh(); }}>Resend</ActionButton>
        <ActionButton variant="ghost" run={() => revokeInvite(id)} onDone={() => router.refresh()} confirm="Revoke?">Revoke</ActionButton>
      </div>
      {msg?.ok && <ResultMessage result={msg} className="max-w-sm text-right" />}
    </div>
  );
}

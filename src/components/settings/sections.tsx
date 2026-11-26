"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import { Switch } from "@/components/studio/fields";
import { relativeTime } from "@/lib/format";
import { removePersonalKey, savePersonalKey, setNotifyOnFinish, testPersonalKey, type ActionResult } from "@/app/(app)/settings/actions";

/** A settings block: heading and help on the left, controls on the right (stacked on small screens). */
export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5 sm:p-6">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-8">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}

const SESSIONS_SHOWN = 4;

function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export function AccountSection({ user, hasPassword, accounts, social, sessions }: { user: { name: string; email: string }; hasPassword: boolean; accounts: { providerId: string; accountId: string }[]; social: { google: boolean; github: boolean }; sessions: { id: string; token: string; current: boolean; userAgent: string | null; ipAddress: string | null; updatedAt: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState(false);
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
  const shown = allSessions ? ordered : ordered.slice(0, SESSIONS_SHOWN);
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const linked = accounts.map((a) => a.providerId);

  return (
    <>
      <Section id="profile" title="Profile" description="How you appear to your team in the library and audit log.">
        <div className="mb-5 flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-3 text-[15px] font-semibold text-fg">{initials}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name || "No name yet"}</p>
            <p className="truncate text-[13px] text-fg-subtle">{user.email}</p>
          </div>
        </div>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); setBusy("name"); const { error } = await authClient.updateUser({ name }); setBusy(null); setMsg(error ? { ok: false, text: error.message ?? "Could not save." } : { ok: true, text: "Saved." }); router.refresh(); }}>
          <Field label="Name" htmlFor="profile-name"><Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          <Button type="submit" disabled={busy === "name"}>{busy === "name" ? "Saving…" : "Save"}</Button>
        </form>
        {msg && <p className={`mt-2 text-[13px] ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
      </Section>

      {hasPassword && (
        <Section id="password" title="Password" description="Changing your password signs out your other devices.">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy("pw"); const { error } = await authClient.changePassword({ currentPassword: pw.current, newPassword: pw.next, revokeOtherSessions: true }); setBusy(null); setPwMsg(error ? { ok: false, text: error.message ?? "Could not change password." } : { ok: true, text: "Password changed." }); if (!error) setPw({ current: "", next: "" }); }}>
            <Field label="Current password" htmlFor="pw-current"><Input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 10 characters."><Input id="pw-new" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={busy === "pw"}>{busy === "pw" ? "Saving…" : "Change password"}</Button>
              {pwMsg && <p className={`text-[13px] ${pwMsg.ok ? "text-ok" : "text-danger"}`} role="status">{pwMsg.text}</p>}
            </div>
          </form>
        </Section>
      )}

      {(social.google || social.github || linked.some((l) => l !== "credential")) && (
        <Section id="accounts" title="Connected accounts" description="Sign in with Google or GitHub. Accounts with the same verified email link together.">
          <ul className="grid gap-2">
            {(["google", "github"] as const).filter((p) => social[p] || linked.includes(p)).map((p) => {
              const on = linked.includes(p);
              return (
                <li key={p} className="flex items-center justify-between rounded-[12px] bg-surface-2 px-4 py-3">
                  <span className="font-medium capitalize">{p === "github" ? "GitHub" : "Google"}</span>
                  {on ? (
                    <Button size="sm" variant="ghost" disabled={linked.length <= 1} title={linked.length <= 1 ? "Add another sign-in method first" : undefined} onClick={async () => { await authClient.unlinkAccount({ accountId: accounts.find((a) => a.providerId === p)!.accountId }); router.refresh(); }}>Disconnect</Button>
                  ) : (
                    <Button size="sm" onClick={() => authClient.linkSocial({ provider: p, callbackURL: "/settings" })}>Connect</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section id="sessions" title="Active sessions" description={`${sessions.length} signed-in ${sessions.length === 1 ? "device" : "devices"}. Sign out any you don't recognise.`}>
        <ul className="divide-y divide-border overflow-hidden rounded-[12px] bg-surface-2/50">
          {shown.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{device(s.userAgent)} {s.current && <Badge tone="accent" className="ml-1.5">This device</Badge>}</p>
                <p className="mono truncate text-[12px] text-fg-subtle">{s.ipAddress ?? "IP unknown"} · active <time suppressHydrationWarning>{relativeTime(s.updatedAt)}</time></p>
              </div>
              {!s.current && <Button size="sm" variant="ghost" onClick={async () => { await authClient.revokeSession({ token: s.token }); router.refresh(); }}>Sign out</Button>}
            </li>
          ))}
        </ul>
        {ordered.length > SESSIONS_SHOWN && (
          <button type="button" onClick={() => setAllSessions((v) => !v)} aria-expanded={allSessions} className="mt-2 h-9 rounded-full px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            {allSessions ? "Show fewer" : `Show all ${ordered.length}`}
          </button>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={sessions.length <= 1} onClick={async () => { await authClient.revokeOtherSessions(); router.refresh(); }}>Sign out other devices</Button>
          <Button variant="ghost" onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); router.refresh(); }}>Sign out</Button>
        </div>
      </Section>
    </>
  );
}

export function PersonalKeySection({ credential }: { credential: { keyHint: string; lastVerifiedAt: string | null; lastError: string | null } | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(savePersonalKey, null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const [replacing, setReplacing] = useState(!credential);
  return (
    <Section id="key" title="My Higgsfield key" description="Bring your own key. Jobs on it are billed to your Higgsfield account and don't count toward team budgets. Only a masked hint is shown after saving.">
      {credential && !replacing ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface-2 px-4 py-3">
            <span className="mono text-sm">{credential.keyHint}</span>
            {credential.lastError ? <Badge tone="danger">Problem</Badge> : credential.lastVerifiedAt ? <Badge tone="ok">Verified {credential.lastVerifiedAt}</Badge> : <Badge>Not tested</Badge>}
          </div>
          {credential.lastError && <Notice tone="danger">{credential.lastError}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={() => start(async () => setResult(await testPersonalKey()))}>{isPending ? "Testing…" : "Test"}</Button>
            <Button variant="ghost" onClick={() => setReplacing(true)}>Replace</Button>
            <Button variant="danger" disabled={isPending} onClick={() => start(async () => setResult(await removePersonalKey()))}>Remove</Button>
          </div>
        </div>
      ) : (
        <form action={action} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
          <Field label="Key ID" htmlFor="pk-id" hint="Or paste id:secret here."><Input id="pk-id" name="keyId" className="mono" required spellCheck={false} /></Field>
          <Field label="Key secret" htmlFor="pk-secret"><Input id="pk-secret" name="keySecret" type="password" className="mono" spellCheck={false} /></Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save key"}</Button>
            {credential && <Button variant="ghost" onClick={() => setReplacing(false)}>Cancel</Button>}
          </div>
          <p className="text-[12px] text-fg-subtle sm:col-span-2">Create keys in the <a className="underline" href="https://console.higgsfield.ai" target="_blank" rel="noopener noreferrer">Higgsfield Console</a>.</p>
        </form>
      )}
      {(result ?? state) && <p className={`mt-3 text-[13px] ${(result ?? state)!.ok ? "text-ok" : "text-danger"}`} role="status">{(result ?? state)!.message}</p>}
    </Section>
  );
}

export function NotifySection({ value }: { value: boolean }) {
  const [on, setOn] = useState(value);
  const [, start] = useTransition();
  return (
    <Section id="notifications" title="Notifications" description="Email only. In-app notifications are always on.">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium" id="notify-label">Email me when a long video finishes</p>
          <p className="text-[13px] text-fg-subtle">For video jobs that take more than a minute.</p>
        </div>
        <Switch id="notify" label="Email me when a long video finishes" checked={on} onChange={(v) => { setOn(v); start(async () => { await setNotifyOnFinish(v); }); }} />
      </div>
    </Section>
  );
}

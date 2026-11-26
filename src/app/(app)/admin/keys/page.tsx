import { requireContext } from "@/lib/session";
import { getOrgCredentialRow } from "@/lib/credentials";
import { appUrl } from "@/lib/env";
import { Badge, Card, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/action-ui";
import { dateTime, relativeTime } from "@/lib/format";
import { removeOrgKey, saveOrgKey, saveOrgSettings, testOrgKey } from "../actions";

export const metadata = { title: "API keys" };

export default async function KeysPage() {
  const ctx = await requireContext("admin");
  const cred = await getOrgCredentialRow(ctx.org.id);
  const webhookUrl = appUrl("/api/webhooks/higgsfield");
  const https = webhookUrl.startsWith("https://");
  return (
    <>
      <PageHeader title="API keys" description="The organization's Higgsfield key is encrypted at rest and never leaves the server. Only a masked hint is shown." />
      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Organization key</h2>
          {cred ? (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-4 py-3">
                <span className="mono text-sm">{cred.keyHint}</span>
                {cred.lastError ? <Badge tone="danger">Problem</Badge> : cred.lastVerifiedAt ? <Badge tone="ok">Verified {relativeTime(cred.lastVerifiedAt)}</Badge> : <Badge>Not tested yet</Badge>}
                <span className="text-[12px] text-fg-subtle">Last used {cred.lastUsedAt ? dateTime(cred.lastUsedAt) : "never"} · updated {dateTime(cred.updatedAt)}</span>
              </div>
              {cred.lastError && <Notice tone="danger" title="Higgsfield reported a problem">{cred.lastError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <ActionButton run={testOrgKey} size="md">Test key</ActionButton>
                <ActionButton run={async () => { "use server"; return removeOrgKey("key"); }} variant="danger" size="md" confirm="Remove the key? Generation stops until a new one is added.">Remove</ActionButton>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[15px] text-fg-muted">No key yet. Create one in the <a className="text-accent-text underline" href="https://console.higgsfield.ai" target="_blank" rel="noopener noreferrer">Higgsfield Console</a>.</p>
          )}
          <h3 className="mt-6 mb-3 text-sm font-semibold">{cred ? "Rotate key" : "Add key"}</h3>
          <ActionForm action={saveOrgKey} submitLabel={cred ? "Save new key" : "Save key"} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2" >
              <Field label="Key ID" htmlFor="k-id" hint="Or paste id:secret here."><Input id="k-id" name="keyId" className="mono" autoComplete="off" spellCheck={false} /></Field>
              <Field label="Key secret" htmlFor="k-secret"><Input id="k-secret" name="keySecret" type="password" className="mono" autoComplete="off" spellCheck={false} /></Field>
            </div>
          </ActionForm>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Webhooks</h2>
          <p className="mt-1 text-[13px] text-fg-subtle">With a signing secret and a public HTTPS address, Higgsfield tells HiggsArena the moment a job finishes. Without them HiggsArena polls, which also works.</p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><dt className="text-fg-muted">Endpoint</dt><dd className="mono break-all">{webhookUrl}</dd>{!https && <Badge tone="warn">needs https</Badge>}</div>
            <div className="flex flex-wrap items-center gap-2"><dt className="text-fg-muted">Signing secret</dt><dd>{cred?.webhookSecretHint ? <span className="mono">{cred.webhookSecretHint}</span> : process.env.HF_WEBHOOK_SECRET ? <Badge>from .env</Badge> : <Badge tone="warn">not set</Badge>}</dd></div>
          </dl>
          <p className="mt-3 text-[13px] text-fg-muted">Find the secret in Higgsfield Console → Settings → Webhook signing secret. It starts with <code>whsec_</code>.</p>
          <div className="mt-4">
            <ActionForm action={saveOrgKey} submitLabel="Save signing secret" resetOnSuccess footer={cred?.webhookSecretHint ? <ActionButton run={async () => { "use server"; return removeOrgKey("webhook"); }} variant="ghost" size="md" confirm="Remove the secret?">Remove secret</ActionButton> : undefined}>
              <Field label="Webhook signing secret" htmlFor="k-wh"><Input id="k-wh" name="webhookSecret" type="password" className="mono" placeholder="whsec_…" autoComplete="off" spellCheck={false} /></Field>
            </ActionForm>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Personal keys</h2>
          <ActionForm action={saveOrgSettings}>
            <input type="hidden" name="fields" value="personalKeysAllowed" />
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" name="personalKeysAllowed" defaultChecked={ctx.org.settings.personalKeysAllowed} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span><span className="text-sm font-medium">Let members bring their own Higgsfield key</span><span className="block text-[13px] text-fg-subtle">Personal-key jobs are billed to the member's own Higgsfield account. They show as a separate series in analytics and don't count toward budgets. Model restrictions and limits still apply.</span></span>
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

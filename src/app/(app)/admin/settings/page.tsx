import Link from "next/link";
import { requireContext } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { enabledSocialProviders } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { pingDb } from "@/lib/db";
import { getOrgCredentialRow } from "@/lib/credentials";
import { getModel, listModels } from "@/lib/catalog/repo";
import { APP_VERSION } from "@/lib/version";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/action-ui";
import { relativeTime } from "@/lib/format";
import { addCustomModel, saveEmailSettings, saveModel, saveSignupSettings, saveStorageSettings, sendTestEmail, syncCatalogAction, testStorageAction } from "../actions";

export const metadata = { title: "Instance settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="scroll-mt-24 p-5 sm:p-6" id={id}>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-subtle">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-4 py-3 text-sm">
      <span>{label}{detail && <span className="block text-[12px] text-fg-subtle">{detail}</span>}</span>
      <Badge tone={ok === null ? "neutral" : ok ? "ok" : "warn"}>{ok === null ? "Not set" : ok ? "OK" : "Check"}</Badge>
    </li>
  );
}

export default async function InstanceSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext("owner");
  const [email, storage, signup] = await Promise.all([getSetting("email"), getSetting("storage"), getSetting("signup")]);
  const social = enabledSocialProviders();
  const models = await listModels();
  const editing = sp.edit ? await getModel(sp.edit) : undefined;
  const dbOk = await pingDb().catch(() => false);
  const cred = await getOrgCredentialRow(ctx.org.id);
  const emailReady = !!(email.value.primary && email.value.fromAddress) || !!process.env.RESEND_API_KEY || !!process.env.BREVO_API_KEY;

  return (
    <>
      <PageHeader title="Instance settings" description="Owner-only configuration for this HiggsArena install. Secrets are encrypted and write-only: only a hint is shown." />
      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Sections" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-1 text-[14px] lg:sticky lg:top-10 lg:grid lg:gap-0.5">
          {[["email", "Email"], ["storage", "Storage"], ["signup", "Sign-up"], ["signin", "Sign-in methods"], ["catalog", "Model catalog"], ["health", "Health"]].map(([id, l]) => (
            <li key={id}><a href={`#${id}`} className="flex h-9 items-center rounded-full px-3 whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:rounded-[10px]">{l}</a></li>
          ))}
        </ul>
      </nav>
      <div className="grid min-w-0 gap-4">
        <Section id="email" title="Email delivery" description="Resend or Brevo as primary, the other as optional fallback. On a failed send HiggsArena retries once on the fallback and logs both attempts. With neither set, development prints emails to the server console.">
          <ActionForm action={saveEmailSettings}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary provider" htmlFor="e-primary">
                <Select id="e-primary" name="primary" defaultValue={email.value.primary ?? ""}><option value="">None</option><option value="resend">Resend</option><option value="brevo">Brevo</option></Select>
              </Field>
              <Field label="Fallback provider" htmlFor="e-fallback" optional>
                <Select id="e-fallback" name="fallback" defaultValue={email.value.fallback ?? ""}><option value="">None</option><option value="resend">Resend</option><option value="brevo">Brevo</option></Select>
              </Field>
              <Field label="Resend API key" htmlFor="e-resend" hint={email.hints.resendApiKey ? `Saved: ${email.hints.resendApiKey}. Leave empty to keep it.` : "re_…"}>
                <Input id="e-resend" name="resendApiKey" type="password" className="mono" autoComplete="off" />
                {email.hints.resendApiKey && <label className="mt-1.5 flex items-center gap-2 text-[12px] text-fg-muted"><input type="checkbox" name="clearResend" className="accent-[var(--accent)]" /> Remove saved key</label>}
              </Field>
              <Field label="Brevo API key" htmlFor="e-brevo" hint={email.hints.brevoApiKey ? `Saved: ${email.hints.brevoApiKey}. Leave empty to keep it.` : "xkeysib-…"}>
                <Input id="e-brevo" name="brevoApiKey" type="password" className="mono" autoComplete="off" />
                {email.hints.brevoApiKey && <label className="mt-1.5 flex items-center gap-2 text-[12px] text-fg-muted"><input type="checkbox" name="clearBrevo" className="accent-[var(--accent)]" /> Remove saved key</label>}
              </Field>
              <Field label="From name" htmlFor="e-fromname"><Input id="e-fromname" name="fromName" defaultValue={email.value.fromName} /></Field>
              <Field label="From address" htmlFor="e-from" hint="Must be on a domain verified with your provider."><Input id="e-from" name="fromAddress" type="email" defaultValue={email.value.fromAddress} /></Field>
              <Field label="Reply-to" htmlFor="e-reply" optional><Input id="e-reply" name="replyTo" type="email" defaultValue={email.value.replyTo} /></Field>
            </div>
          </ActionForm>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <ActionButton run={async () => { "use server"; return sendTestEmail("primary"); }}>Send test email</ActionButton>
            <ActionButton run={async () => { "use server"; return sendTestEmail("resend"); }} variant="ghost">Test Resend only</ActionButton>
            <ActionButton run={async () => { "use server"; return sendTestEmail("brevo"); }} variant="ghost">Test Brevo only</ActionButton>
          </div>
        </Section>

        <Section id="storage" title="Storage" description="Optional S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) for mirroring outputs past Higgsfield's retention. Turn mirroring on in Admin → Output.">
          <ActionForm action={saveStorageSettings}>
            <label className="mb-4 flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={storage.value.enabled} className="h-4 w-4 accent-[var(--accent)]" /> Use this bucket</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Endpoint" htmlFor="s-endpoint" hint="Empty for AWS S3. R2: https://<account>.r2.cloudflarestorage.com"><Input id="s-endpoint" name="endpoint" defaultValue={storage.value.endpoint} className="mono" placeholder="https://…" /></Field>
              <Field label="Region" htmlFor="s-region" hint="R2 uses auto."><Input id="s-region" name="region" defaultValue={storage.value.region} className="mono" /></Field>
              <Field label="Bucket" htmlFor="s-bucket"><Input id="s-bucket" name="bucket" defaultValue={storage.value.bucket} className="mono" /></Field>
              <Field label="Public base URL" htmlFor="s-public" optional hint="If the bucket is public (e.g. an R2 custom domain). Otherwise HiggsArena serves signed URLs valid for 1 hour."><Input id="s-public" name="publicBaseUrl" defaultValue={storage.value.publicBaseUrl} className="mono" placeholder="https://media.example.com" /></Field>
              <Field label="Access key ID" htmlFor="s-ak" hint={storage.hints.accessKeyId ? `Saved: ${storage.hints.accessKeyId}` : undefined}><Input id="s-ak" name="accessKeyId" type="password" className="mono" autoComplete="off" /></Field>
              <Field label="Secret access key" htmlFor="s-sk" hint={storage.hints.secretAccessKey ? `Saved: ${storage.hints.secretAccessKey}` : undefined}><Input id="s-sk" name="secretAccessKey" type="password" className="mono" autoComplete="off" /></Field>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" name="forcePathStyle" defaultChecked={storage.value.forcePathStyle} className="h-4 w-4 accent-[var(--accent)]" /> Path-style URLs (needed for MinIO)</label>
          </ActionForm>
          <div className="mt-4 border-t border-border pt-4"><ActionButton run={testStorageAction}>Test connection</ActionButton></div>
        </Section>

        <Section id="signup" title="Sign-up policy" description="Who can create an account. Owners from OWNER_EMAILS and invited emails can always sign up.">
          <ActionForm action={saveSignupSettings}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Policy" htmlFor="u-policy">
                <Select id="u-policy" name="policy" defaultValue={signup.value.policy}><option value="invite">Invite only (default)</option><option value="domains">Allowed email domains</option><option value="open">Open to anyone</option></Select>
              </Field>
              <Field label="Allowed domains" htmlFor="u-domains" hint="Comma-separated, used with “Allowed email domains”."><Input id="u-domains" name="domains" defaultValue={signup.value.domains.join(", ")} placeholder="example.com" /></Field>
            </div>
            <label className="mt-4 flex items-start gap-3"><input type="checkbox" name="requireVerification" defaultChecked={signup.value.requireVerification} className="mt-1 h-4 w-4 accent-[var(--accent)]" /><span><span className="text-sm font-medium">Require email verification</span><span className="block text-[13px] text-fg-subtle">New accounts must confirm their email before using the studio. Recommended in production.</span></span></label>
          </ActionForm>
        </Section>

        <Section id="signin" title="Sign-in methods" description="Google and GitHub are enabled when their client ID and secret are set in .env. Paste these callback URLs into each provider.">
          <ul className="grid gap-3">
            {([["Email and password", true, null], ["Google", social.google, appUrl("/api/auth/callback/google")], ["GitHub", social.github, appUrl("/api/auth/callback/github")]] as const).map(([name, on, cb]) => (
              <li key={name} className="rounded-[12px] bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{name}</span><Badge tone={on ? "ok" : "neutral"}>{on ? "Enabled" : "Not configured"}</Badge></div>
                {cb && <p className="mono mt-1 text-[12px] break-all text-fg-muted">Callback: {cb}</p>}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="catalog" title="Model catalog" description={<>Models are data. Edit a model's fields as JSON (or paste the JSON schema from its Higgsfield docs page), add a custom model by endpoint, or sync to pull in new entries shipped with HiggsArena. Sync never overwrites your toggles or edited models.</>}>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <ActionButton run={syncCatalogAction} size="md">Sync catalog</ActionButton>
            <span className="text-[13px] text-fg-subtle">{models.length} models · maintainers refresh the shipped catalog with <code>pnpm catalog:pull</code></span>
          </div>
          <form method="get" action="/admin/settings#catalog" className="mb-4 flex gap-2">
            <label className="sr-only" htmlFor="c-edit">Model to edit</label>
            <Select id="c-edit" name="edit" defaultValue={editing?.slug ?? ""} className="h-10"><option value="">Choose a model to edit…</option>{models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</Select>
            <button type="submit" className="h-10 shrink-0 rounded-full border border-border px-4 text-sm hover:bg-surface-2">Edit</button>
          </form>
          {editing && (
            <div className="mb-6 rounded-[16px] border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">{editing.name}</h3>{editing.docsUrl && <a className="text-sm text-accent-text hover:underline" href={editing.docsUrl} target="_blank" rel="noopener noreferrer">Docs</a>}</div>
              <ActionForm action={saveModel} key={editing.slug}>
                <input type="hidden" name="slug" value={editing.slug} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="m-name"><Input id="m-name" name="name" defaultValue={editing.name} /></Field>
                  <Field label="Endpoint" htmlFor="m-endpoint"><Input id="m-endpoint" name="endpoint" defaultValue={editing.endpoint} className="mono" /></Field>
                  <Field label="Category" htmlFor="m-cat"><Select id="m-cat" name="category" defaultValue={editing.category === "character" ? "image" : editing.category}><option value="image">Image</option><option value="edit">Edit</option><option value="video">Video</option><option value="motion">Motion</option></Select></Field>
                  <Field label="Output" htmlFor="m-out"><Select id="m-out" name="outputType" defaultValue={editing.outputType === "character" ? "image" : editing.outputType}><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option></Select></Field>
                  <Field label="Description" htmlFor="m-desc" className="sm:col-span-2" optional><Input id="m-desc" name="description" defaultValue={editing.description ?? ""} /></Field>
                  <Field label="Docs URL" htmlFor="m-docs" className="sm:col-span-2" optional><Input id="m-docs" name="docsUrl" defaultValue={editing.docsUrl ?? ""} className="mono" /></Field>
                  <Field label="Fields (JSON)" htmlFor="m-fields" className="sm:col-span-2" hint="A list of fields, or a raw JSON schema with “properties”.">
                    <Textarea id="m-fields" name="fields" defaultValue={JSON.stringify(editing.fields, null, 2)} className="mono min-h-80 text-[12px]" spellCheck={false} />
                  </Field>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={editing.verified} className="h-4 w-4 accent-[var(--accent)]" /> Schema verified</label>
              </ActionForm>
            </div>
          )}
          <details className="rounded-[16px] border border-border p-4">
            <summary className="cursor-pointer font-semibold">Add a custom model</summary>
            <div className="mt-4">
              <ActionForm action={addCustomModel} submitLabel="Add model" resetOnSuccess>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="n-name"><Input id="n-name" name="name" required /></Field>
                  <Field label="Endpoint" htmlFor="n-endpoint" hint="Path after https://api.higgsfield.ai/"><Input id="n-endpoint" name="endpoint" required className="mono" placeholder="vendor/model/v1/text-to-image" /></Field>
                  <Field label="Category" htmlFor="n-cat"><Select id="n-cat" name="category" defaultValue="image"><option value="image">Image</option><option value="edit">Edit</option><option value="video">Video</option><option value="motion">Motion</option></Select></Field>
                  <Field label="Output" htmlFor="n-out"><Select id="n-out" name="outputType" defaultValue="image"><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option></Select></Field>
                  <Field label="Docs URL" htmlFor="n-docs" className="sm:col-span-2" optional><Input id="n-docs" name="docsUrl" className="mono" /></Field>
                  <Field label="Fields or JSON schema" htmlFor="n-fields" className="sm:col-span-2" optional hint="Paste the “Complete JSON schema” from the model's docs page. Empty = a single prompt field.">
                    <Textarea id="n-fields" name="fields" className="mono min-h-40 text-[12px]" spellCheck={false} />
                  </Field>
                </div>
              </ActionForm>
            </div>
          </details>
        </Section>

        <Section id="health" title="Health">
          <ul className="grid gap-2">
            <Check ok={dbOk} label="Database" detail="PostgreSQL connection" />
            <Check ok={emailReady ? true : null} label="Email" detail={email.value.primary ? `${email.value.primary}${email.value.fallback ? ` → ${email.value.fallback}` : ""}` : process.env.RESEND_API_KEY || process.env.BREVO_API_KEY ? "from .env" : "console only (development)"} />
            <Check ok={storage.value.enabled ? true : null} label="Storage" detail={storage.value.enabled ? storage.value.bucket : "not configured (optional)"} />
            <Check ok={cred ? !cred.lastError : null} label="Higgsfield key" detail={cred ? (cred.lastError ?? (cred.lastVerifiedAt ? `verified ${relativeTime(cred.lastVerifiedAt)}` : "not tested yet")) : "missing"} />
          </ul>
          <p className="mt-4 text-[13px] text-fg-subtle">HiggsArena v{APP_VERSION} · <Link href="/api/health" className="underline">/api/health</Link> for uptime checks</p>
        </Section>
      </div>
      </div>
    </>
  );
}

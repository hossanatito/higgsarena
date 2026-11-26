import Link from "next/link";
import { requireContext, hasRole } from "@/lib/session";
import { storageClient } from "@/lib/storage/s3";
import { Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/admin/action-ui";
import { saveOrgSettings } from "../actions";

export const metadata = { title: "Output settings" };

export default async function OutputPage() {
  const ctx = await requireContext("admin");
  const s = ctx.org.settings;
  const storage = await storageClient();
  return (
    <>
      <PageHeader title="Output settings" description="How long Higgsfield keeps results, whether HiggsArena copies them to your storage, and how jobs are sent." />
      <Card className="p-5 sm:p-6">
        <ActionForm action={saveOrgSettings}>
          <input type="hidden" name="fields" value="retentionSeconds,mirrorOutputs,estimateFailurePolicy,failureAlertThreshold,submitConcurrency" />
          <div className="grid gap-6">
            <Field label="Retention on Higgsfield" htmlFor="o-ret" hint="Hours to keep files after a job finishes, 1 to 168. Empty = Higgsfield default (7 days). Shorter retention is sent as Hf-Expires-After.">
              <Input id="o-ret" name="retentionHours" type="number" min={1} max={168} defaultValue={s.retentionSeconds ? s.retentionSeconds / 3600 : ""} className="mono sm:w-40" />
            </Field>
            <div>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="mirrorOutputs" defaultChecked={s.mirrorOutputs} disabled={!storage && !s.mirrorOutputs} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <span><span className="text-sm font-medium">Mirror outputs to storage</span><span className="block text-[13px] text-fg-subtle">Copy every completed result to your S3 / R2 bucket so it outlives Higgsfield's retention.</span></span>
              </label>
              {!storage && <div className="mt-3"><Notice tone="info">Storage isn't set up yet. {hasRole(ctx.role, "owner") ? <Link href="/admin/settings#storage" className="underline">Configure it in Settings</Link> : "Ask an owner to configure it."}</Notice></div>}
            </div>
            <Field label="When the cost estimate fails" htmlFor="o-est" hint="“Run anyway” flags the job as cost unknown so totals are never silently wrong.">
              <Select id="o-est" name="estimateFailurePolicy" defaultValue={s.estimateFailurePolicy} className="sm:w-72">
                <option value="block">Block the job (recommended)</option>
                <option value="allow">Run anyway and flag “cost unknown”</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model failure alert" htmlFor="o-fail" hint="Alert admins when a model's 24-hour failure rate passes this percentage (min. 5 jobs). 0 turns it off.">
                <Input id="o-fail" name="failureAlertThreshold" type="number" min={0} max={100} defaultValue={Math.round(s.failureAlertThreshold * 100)} className="mono" />
              </Field>
              <Field label="Max simultaneous submissions" htmlFor="o-conc" hint="How many jobs HiggsArena sends to Higgsfield at the same moment, so the account queue stays short.">
                <Input id="o-conc" name="submitConcurrency" type="number" min={1} max={100} defaultValue={s.submitConcurrency} className="mono" />
              </Field>
            </div>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}

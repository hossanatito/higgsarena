import { ArrowSquareOut } from "@phosphor-icons/react/ssr";
import { requireContext, hasRole } from "@/lib/session";
import { Page } from "@/components/page";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Docs" };

const STATUSES = [
  { s: "Sending", tone: "neutral", d: "HiggsArena is submitting the job. If Higgsfield's queue is full it retries automatically with the same idempotency key, so you are never charged twice." },
  { s: "Queued", tone: "neutral", d: "Accepted by Higgsfield and waiting to start. You can still cancel it, and a canceled queued job is refunded." },
  { s: "Rendering", tone: "accent", d: "Generation has started and can no longer be canceled." },
  { s: "Done", tone: "ok", d: "Outputs are ready in the feed and your Library. The estimate is recorded as the cost." },
  { s: "Failed", tone: "danger", d: "Higgsfield could not generate it. Not charged ($0)." },
  { s: "Moderated", tone: "warn", d: "Input or output was rejected by content moderation. Not charged ($0)." },
  { s: "Canceled", tone: "neutral", d: "Canceled before processing started. Not charged ($0)." },
  { s: "Not sent", tone: "danger", d: "The job never reached Higgsfield, for example because the key was invalid. Not charged." },
] as const;

const LINKS = [
  { href: "https://docs.higgsfield.ai/docs", label: "Higgsfield API docs" },
  { href: "https://docs.higgsfield.ai/docs/quickstart.md", label: "Quickstart" },
  { href: "https://docs.higgsfield.ai/docs/models.md", label: "Model catalog" },
  { href: "https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md", label: "Billing and retention" },
  { href: "https://console.higgsfield.ai", label: "Higgsfield Console (keys, billing, webhook secret)" },
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-tight">{children}</h2>;
}

export default async function DocsPage() {
  const ctx = await requireContext();
  const admin = hasRole(ctx.role, "admin");
  return (
    <Page>
      <PageHeader title="Guide" description="How HiggsArena works, from your first generation to budgets and overrides." />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-10 grid gap-0.5 text-[14px] text-fg-muted">
            {[["start", "Getting started"], ["statuses", "Job statuses"], ["costs", "Costs and estimates"], ["restrictions", "Restrictions and overrides"], ["expiry", "Why outputs expire"], ["keys", "Keys"], ["presets", "Presets"], ["collections", "Collections"], ["characters", "Characters"], ["links", "Higgsfield links"]].map(([id, l]) => (
              <li key={id}><a className="flex h-9 items-center rounded-[10px] px-3 transition-colors hover:bg-surface-2 hover:text-fg" href={`#${id}`}>{l}</a></li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-10 text-[15px] leading-relaxed text-fg-muted [&_strong]:text-fg">
          <section className="grid gap-3">
            <H id="start">Getting started</H>
            <ol className="ml-5 list-decimal space-y-1.5">
              <li>Open <strong>Studio</strong> and pick a tool: Image, Edit, Video or Motion.</li>
              <li>Choose a model. Featured models are listed first; use search to find the rest.</li>
              <li>Write a prompt, add any media the model needs, and adjust <strong>Settings</strong> (aspect ratio, resolution, duration…).</li>
              <li>Check the cost estimate beside <strong>Generate</strong>, then press it (or ⌘/Ctrl + Enter).</li>
              <li>Watch the job card in the feed. Finished results also appear in your <strong>Library</strong>. Use <strong>Remix</strong> to reopen any result with the exact same model and settings.</li>
            </ol>
          </section>

          <section className="grid gap-3">
            <H id="statuses">Job statuses</H>
            <ul className="grid gap-2">
              {STATUSES.map((s) => (
                <li key={s.s} className="flex gap-3"><Badge tone={s.tone} className="mt-0.5 w-24 justify-center">{s.s}</Badge><span>{s.d}</span></li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3">
            <H id="costs">Costs and estimates</H>
            <p>Before every job HiggsArena asks Higgsfield for an estimate with your exact settings. When a job completes, that estimate is recorded as its cost. Failed, moderated and canceled jobs record $0, matching Higgsfield's billing rules.</p>
            <p>All amounts in HiggsArena are <strong>estimates</strong>. The <a className="text-accent-text underline" href="https://console.higgsfield.ai" target="_blank" rel="noopener noreferrer">Higgsfield Console</a> is the billing record. If an estimate can't be fetched, admins decide whether jobs are blocked or run and are flagged “cost unknown”.</p>
          </section>

          <section className="grid gap-3">
            <H id="restrictions">Restrictions and overrides</H>
            <p>Admins can set rules at three levels: the <strong>organization</strong> default, each <strong>team</strong>, and an individual <strong>member</strong>. For limits like daily generations, concurrent jobs, video duration, batch size and upload size, the <strong>strictest value wins</strong>. Allowed-model lists combine, so a model must be allowed at every level that has a list.</p>
            <p>Monthly budgets work per pot: the organization budget caps everyone's total, a team budget caps that team's spend, and a member budget caps one person. Jobs on the organization key count toward every pot they belong to; personal-key jobs don't count.</p>
            <p>When a job would push any budget past 100%, it is <strong>blocked</strong> and nothing is sent to Higgsfield. The message names the rule and the amount. Press <strong>Request override</strong> to ask an admin: they can approve that one job (it then starts automatically), raise the limit, or decline. Requests expire after 24 hours.</p>
          </section>

          <section className="grid gap-3">
            <H id="expiry">Why outputs expire</H>
            <p>Higgsfield deletes request files <strong>7 days</strong> after a job finishes (or sooner if your admins shortened retention). Items in your Library show an expiry badge. Download anything you need to keep, or ask your admins to turn on <strong>mirroring to storage</strong> (S3 or R2), which copies results to your own bucket so they never expire.</p>
            <p>Deleting a result in the Library also deletes it from Higgsfield right away.</p>
          </section>

          <section className="grid gap-3">
            <H id="keys">Keys</H>
            <p>Jobs normally run on the <strong>organization key</strong> that admins manage. If admins allow it, you can add <strong>your own key</strong> in Settings and choose “My key” in the composer. Your key is encrypted on the server and never shown again after saving; only a short hint is displayed.</p>
            {admin && <p>Admins: add the organization key and the webhook signing secret (<code>whsec_…</code>) in <strong>Admin → API keys</strong>. With a webhook secret and a public HTTPS URL, Higgsfield notifies HiggsArena when jobs finish; otherwise HiggsArena polls.</p>}
          </section>

          <section className="grid gap-3">
            <H id="presets">Presets</H>
            <p>A preset is a saved starting point: a model, its settings and a prompt template. Pick one from the <strong>Preset</strong> button at the start of the composer. Words in double braces, like <code>{"{{product}}"}</code>, become short fill-in fields above the prompt.</p>
            <p>Admins can <strong>lock</strong> fields so a brand look stays consistent. Locked settings show a lock and can't be changed, and the server applies the preset's values on every job, so a locked field can't be bypassed. Presets can be limited to certain teams.</p>
            {admin && <p>Admins: set up the studio the way you want, then choose <strong>Save current settings as a preset</strong> in the preset menu. Edit the name, template, locks and teams in <strong>Admin → Presets</strong>.</p>}
          </section>

          <section className="grid gap-3">
            <H id="collections">Collections</H>
            <p>Group results into boards from any job card or the Library viewer. A <strong>private</strong> collection is yours (admins can see it too); a <strong>team</strong> collection is visible to everyone in the studio, but only its owner and admins can change it.</p>
            <p>Create a <strong>read-only link</strong> to share a collection with someone outside the studio. The link shows finished media only, never costs or names, and prompts only if you allow them. Links can expire after 7, 30 or 90 days, and you can turn a link off at any time. The full link is shown once, so copy it when you create it.</p>
          </section>

          <section className="grid gap-3">
            <H id="characters">Characters</H>
            <p>Train a Soul ID character from 1 to 100 photos of one person. Pick the SOUL version you plan to use; a character only works with its matching model. Training moves through Preparing, Queued, Training and Ready. Ready characters appear in the Character picker of that SOUL model.</p>
          </section>

          <section className="grid gap-3">
            <H id="links">Higgsfield links</H>
            <Card className="divide-y divide-border">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-fg hover:bg-surface-2">
                  {l.label} <ArrowSquareOut size={16} className="text-fg-subtle" aria-hidden />
                </a>
              ))}
            </Card>
            <p className="text-[13px]">Every model in the studio also links to its own Higgsfield reference page.</p>
          </section>
        </div>
      </div>
    </Page>
  );
}

import { redirect } from "next/navigation";
import { FilmSlate, ImageSquare, ShieldCheck, UsersThree, ChartLineUp, Sparkle } from "@phosphor-icons/react/ssr";
import { getContext } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { FooterNotice } from "@/components/footer-notice";

const FEATURES = [
  { icon: ImageSquare, title: "Every Higgsfield model", body: "84 image, edit, video, motion and character workflows, driven by a catalog instead of hard-coded screens." },
  { icon: UsersThree, title: "Built for teams", body: "One Higgsfield account shared with budgets, model restrictions and invite-only access." },
  { icon: ChartLineUp, title: "Clear cost tracking", body: "Estimates before every job, spend by model, member and team, and CSV export for finance." },
  { icon: ShieldCheck, title: "Secure by default", body: "Keys stay on the server, encrypted at rest. Nobody can claim a fresh instance." },
];

export default async function Landing() {
  const ctx = await getContext();
  if (ctx.state === "ok") redirect("/studio");
  if (ctx.state === "unverified") redirect("/verify-email");
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_80%_at_50%_0%,var(--accent-soft),transparent)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 safe-top sm:px-6">
        <Logo />
        <LinkButton href="/sign-in" variant="secondary" size="sm">Sign in</LinkButton>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] text-fg-muted">
            <Sparkle size={14} className="text-accent-text" aria-hidden /> Open-source studio for the Higgsfield API
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl">One studio for every model your team uses.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-fg-muted">
            Generate images and video, train characters and keep results in one library, with admin control over models, spending and access.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/sign-in" variant="primary" size="lg">Sign in to the studio</LinkButton>
            <LinkButton href="/sign-up" variant="outline" size="lg">Request access</LinkButton>
          </div>
        </div>
        <div className="mt-20 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon size={24} className="text-accent-text" aria-hidden />
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-[15px] text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 panel flex items-center gap-4 p-5">
          <FilmSlate size={24} className="shrink-0 text-accent-text" aria-hidden />
          <p className="text-[15px] text-fg-muted">Self-hosted and MIT licensed. Clone it, add a Higgsfield API key and run it in minutes.</p>
        </div>
      </main>
      <footer className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <FooterNotice />
      </footer>
    </div>
  );
}

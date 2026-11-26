import { redirect } from "next/navigation";
import { ChartLineUp, Cube, LockKey, UsersThree } from "@phosphor-icons/react/ssr";
import { getContext } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { FooterNotice } from "@/components/footer-notice";

const POINTS = [
  { icon: Cube, title: "Every Higgsfield model", body: "84 image, video, motion and character workflows. Forms come straight from each model's schema." },
  { icon: UsersThree, title: "One account, many people", body: "Invite your team, group them, and decide who can use which models." },
  { icon: ChartLineUp, title: "Spend you can see", body: "An estimate before every job, monthly budgets that stop at 100%, and reports by model, person and team." },
  { icon: LockKey, title: "Keys stay on your server", body: "Encrypted at rest and never sent to the browser. Self-hosted, MIT licensed." },
];

export default async function Landing() {
  const ctx = await getContext();
  if (ctx.state === "ok") redirect("/studio");
  if (ctx.state === "unverified") redirect("/verify-email");
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 safe-top sm:px-6">
        <Logo />
        <LinkButton href="/sign-in" variant="ghost" size="sm">Sign in</LinkButton>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:pt-16 lg:pb-24">
          <div className="max-w-xl">
            <h1 className="text-4xl leading-[1.05] font-bold tracking-tighter text-balance sm:text-5xl lg:text-6xl">Your team's studio for the Higgsfield API.</h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-fg-muted">Generate images and video, keep every result in one library, and set budgets before anyone spends.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/sign-in" variant="primary" size="lg">Open the studio</LinkButton>
              <LinkButton href="/sign-up" variant="outline" size="lg">Request access</LinkButton>
            </div>
          </div>
          <div className="relative lg:-mr-24 xl:-mr-40">
            <div className="overflow-hidden rounded-[16px] ring-1 ring-white/[0.08]">
              <img src="/screens/studio.jpg" alt="The HiggsArena studio with a feed of generated images and the prompt composer" width={1440} height={900} className="block h-auto w-full" />
            </div>
            {/* The screenshot fades into the page instead of ending on a hard edge. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-bg to-transparent" />
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:py-24">
            <div className="relative order-2 lg:order-1">
              <div className="overflow-hidden rounded-[16px] ring-1 ring-white/[0.08]">
                <img src="/screens/analytics.jpg" alt="Analytics showing daily spend split by image and video" width={1440} height={900} loading="lazy" className="block h-auto w-full" />
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg to-transparent" />
            </div>
            <dl className="order-1 grid content-center gap-8 lg:order-2">
              {POINTS.map((p) => (
                <div key={p.title} className="grid grid-cols-[auto_1fr] gap-x-4">
                  <dt className="contents">
                    <span className="mt-0.5 grid h-10 w-10 place-items-center rounded-[12px] bg-surface-2 text-accent-text">
                      <p.icon size={20} aria-hidden />
                    </span>
                    <span className="self-center text-[17px] font-semibold tracking-tight">{p.title}</span>
                  </dt>
                  <dd className="col-start-2 mt-1 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">{p.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl border-t border-border px-4 py-8 sm:px-6">
        <FooterNotice />
      </footer>
    </div>
  );
}

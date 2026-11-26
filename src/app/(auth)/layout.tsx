import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { FooterNotice } from "@/components/footer-notice";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="relative flex min-h-dvh flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-8 sm:px-10 lg:px-16">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft),transparent)] lg:hidden" />
        <Link href="/" className="relative self-center lg:self-start" aria-label="HiggsArena home">
          <Logo />
        </Link>
        <main className="relative mx-auto my-auto w-full max-w-[400px] py-10">{children}</main>
        <FooterNotice className="relative mx-auto max-w-[400px] text-center lg:mx-0 lg:max-w-md lg:text-left" />
      </div>
      <aside aria-hidden className="relative hidden p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[24px] bg-surface">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_100%_100%,var(--accent-soft),transparent)]" />
          <div className="relative px-12 pt-14 xl:px-16 xl:pt-20">
            <p className="max-w-lg text-[30px] leading-[1.12] font-semibold tracking-tight text-fg xl:text-[36px]">Every Higgsfield model in one studio your whole team can share.</p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">Budgets that stop before they overspend. Presets that keep work on brand. Keys that never leave the server.</p>
          </div>
          <div className="relative mt-12 flex-1">
            <div className="fade-top-strong absolute top-0 left-12 h-[min(100%,620px)] w-[1100px] overflow-hidden rounded-tl-[16px] border-t border-l border-border-strong shadow-[var(--shadow)] xl:left-16">
              <Image src="/screens/studio.jpg" alt="" width={1800} height={1125} priority sizes="1100px" className="h-auto w-full" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

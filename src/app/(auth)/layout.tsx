import Link from "next/link";
import { Logo } from "@/components/logo";
import { FooterNotice } from "@/components/footer-notice";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center px-4 py-10 safe-top">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft),transparent)]" />
      <Link href="/" className="relative mb-8" aria-label="HiggsArena home">
        <Logo />
      </Link>
      <main className="relative w-full max-w-[420px]">{children}</main>
      <FooterNotice className="relative mt-auto max-w-[420px] pt-10 text-center" />
    </div>
  );
}

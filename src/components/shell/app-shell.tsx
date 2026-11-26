import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark, Logo } from "@/components/logo";
import { NotificationsBell } from "./notifications";
import { OfflineNotice } from "./offline";
import { RailNav, TabBar } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function Avatar({ name, email, image }: { name: string; email: string; image?: string | null }) {
  const initials = (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <Link href="/settings" aria-label="Your settings" className="grid h-11 w-11 place-items-center">
      {image ? <img src={image} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-[13px] font-semibold text-fg">{initials}</span>}
    </Link>
  );
}

export function AppShell({ children, user, isAdmin, demo }: { children: ReactNode; user: { name: string; email: string; image?: string | null }; isAdmin: boolean; demo: boolean }) {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <OfflineNotice />
      {demo && <div className="bg-info-soft px-4 py-1.5 text-center text-[13px] text-info lg:pl-[88px]">Demo mode: sample data and accounts. Not for production use.</div>}
      {/* Desktop rail */}
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col items-center border-y-0 border-l-0 py-4 lg:flex">
        <Link href="/studio" aria-label="HiggsArena studio" className="mb-6">
          <LogoMark size={36} />
        </Link>
        <RailNav isAdmin={isAdmin} />
        <div className="mt-auto flex flex-col items-center gap-1">
          <NotificationsBell />
          <ThemeToggle />
          <Avatar {...user} />
        </div>
      </aside>
      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-3 safe-top lg:hidden">
        <Link href="/studio" aria-label="HiggsArena studio" className="py-2 pl-1">
          <Logo />
        </Link>
        <div className="flex items-center">
          <NotificationsBell align="right" />
          <ThemeToggle />
          <Avatar {...user} />
        </div>
      </header>
      <div id="main" className="lg:pl-[76px]">{children}</div>
      <TabBar isAdmin={isAdmin} />
    </div>
  );
}

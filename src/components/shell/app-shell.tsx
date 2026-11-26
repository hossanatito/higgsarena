import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { NotificationsBell } from "./notifications";
import { OfflineNotice } from "./offline";
import { TabBar } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { SidebarShell } from "./sidebar-shell";

export type ShellUser = { name: string; email: string; image?: string | null };

export function Avatar({ user, size = 32 }: { user: ShellUser; size?: number }) {
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return user.image ? (
    <img src={user.image} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-fg" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

export function AppShell({ children, user, isAdmin, isOwner, pending, demo, sidebarCollapsed }: { children: ReactNode; user: ShellUser; isAdmin: boolean; isOwner: boolean; pending: number; demo: boolean; sidebarCollapsed: boolean }) {
  return (
    <div id="app-shell" data-sidebar={sidebarCollapsed ? "collapsed" : "open"} className="min-h-dvh" style={demo ? ({ "--demo-h": "32px" } as React.CSSProperties) : undefined}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <OfflineNotice />
      <SidebarShell isAdmin={isAdmin} isOwner={isOwner} pending={pending} initialCollapsed={sidebarCollapsed} user={user} />
      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-3 safe-top lg:hidden">
        <Link href="/studio" aria-label="HiggsArena studio" className="py-2 pl-1">
          <Logo />
        </Link>
        <div className="flex items-center">
          <NotificationsBell align="right" />
          <ThemeToggle />
          <Link href="/settings" aria-label="Your settings" className="grid h-11 w-11 place-items-center">
            <Avatar user={user} />
          </Link>
        </div>
      </header>
      <div id="main" className="shell-main">
        {demo && <div id="demo-banner" className="flex h-8 items-center justify-center border-b border-info/20 bg-info-soft px-4 text-[12px] text-info">Demo mode with sample accounts. Not for production use.</div>}
        {children}
      </div>
      <TabBar isAdmin={isAdmin} />
    </div>
  );
}

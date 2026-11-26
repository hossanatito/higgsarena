"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar";
import { NotificationsBell } from "./notifications";
import { ThemeToggle } from "./theme-toggle";

type User = { name: string; email: string; image?: string | null };

function Initials({ user }: { user: User }) {
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return user.image ? (
    <img src={user.image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-fg">
      {initials}
    </span>
  );
}

/** Client wrapper so the sidebar footer can react to the collapsed state. */
export function SidebarShell({ isAdmin, isOwner, pending, initialCollapsed, user }: { isAdmin: boolean; isOwner: boolean; pending: number; initialCollapsed: boolean; user: User }) {
  return (
    <Sidebar
      isAdmin={isAdmin}
      isOwner={isOwner}
      pending={pending}
      initialCollapsed={initialCollapsed}
      footer={(collapsed) => (
        <div className={cn("flex", collapsed ? "flex-col items-center gap-1" : "items-center gap-1")}>
          <Link href="/settings" aria-label="Your settings" title={collapsed ? `${user.name || user.email}: settings` : undefined} className={cn("flex min-w-0 items-center gap-2.5 rounded-[12px] transition-colors hover:bg-surface-2", collapsed ? "h-11 w-11 justify-center" : "h-11 flex-1 px-1.5")}>
            <Initials user={user} />
            {!collapsed && (
              <span className="block min-w-0 flex-1 leading-tight">
                <span className="fade-x block whitespace-nowrap text-[13px] font-medium text-fg">{user.name || user.email.split("@")[0]}</span>
                <span className="fade-x block whitespace-nowrap text-[12px] text-fg-subtle">{user.email}</span>
              </span>
            )}
          </Link>
          <NotificationsBell />
          <ThemeToggle />
        </div>
      )}
    />
  );
}

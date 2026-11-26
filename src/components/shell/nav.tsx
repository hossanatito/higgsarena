"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Gauge, Images, MagicWand, UserFocus } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/studio", label: "Studio", icon: MagicWand },
  { href: "/library", label: "Library", icon: Images },
  { href: "/characters", label: "Characters", icon: UserFocus },
  { href: "/admin", label: "Admin", icon: Gauge, admin: true },
  { href: "/docs", label: "Docs", icon: BookOpen },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

export function RailNav({ isAdmin }: { isAdmin: boolean }) {
  const active = useActive();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.filter((n) => !("admin" in n) || isAdmin).map((n) => {
        const on = active(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cn("group flex flex-col items-center gap-1 rounded-[14px] px-1 py-2.5 text-[11px] font-medium transition-colors", on ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg")}>
            <n.icon size={22} weight={on ? "fill" : "regular"} className={on ? "text-accent-text" : ""} aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const active = useActive();
  const items = NAV.filter((n) => !("admin" in n) || isAdmin);
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 safe-bottom lg:hidden">
      <div className="mx-auto flex max-w-lg">
        {items.map((n) => {
          const on = active(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cn("flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", on ? "text-fg" : "text-fg-muted")}>
              <n.icon size={24} weight={on ? "fill" : "regular"} className={on ? "text-accent-text" : ""} aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

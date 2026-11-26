"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/restrictions", label: "Restrictions" },
  { href: "/admin/overrides", label: "Overrides" },
  { href: "/admin/keys", label: "API keys" },
  { href: "/admin/output", label: "Output" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings", owner: true },
];

export function AdminNav({ isOwner, pending }: { isOwner: boolean; pending: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="scrollbar-none -mx-4 mb-6 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {ITEMS.filter((i) => !i.owner || isOwner).map((i) => {
          const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={on ? "page" : undefined} className={cn("relative inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors", on ? "text-fg" : "text-fg-muted hover:text-fg")}>
                {i.label}
                {i.href === "/admin/overrides" && pending > 0 && <span className="mono grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-fg">{pending}</span>}
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

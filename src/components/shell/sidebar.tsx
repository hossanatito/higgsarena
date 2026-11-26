"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  BookmarkSimple,
  BookOpenText,
  CaretDown,
  ChartLineUp,
  ClockCounterClockwise,
  Cube,
  FolderSimple,
  GearSix,
  HardDrives,
  ImagesSquare,
  Key,
  MagicWand,
  SealCheck,
  SidebarSimple,
  Sliders,
  SquaresFour,
  UserFocus,
  Users,
  UsersThree,
  type IconProps,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/logo";

type Item = { href: string; label: string; icon: ComponentType<IconProps>; badge?: number; exact?: boolean };
type Group = { id: string; label: string; items: Item[] };

export const SIDEBAR_COOKIE = "sidebar";

function groupsFor(isAdmin: boolean, isOwner: boolean, pending: number): Group[] {
  const groups: Group[] = [
    {
      id: "create",
      label: "Create",
      items: [
        { href: "/studio", label: "Studio", icon: MagicWand },
        { href: "/characters", label: "Characters", icon: UserFocus },
        { href: "/library", label: "Library", icon: ImagesSquare },
        { href: "/collections", label: "Collections", icon: FolderSimple },
      ],
    },
  ];
  if (isAdmin) {
    groups.push(
      {
        id: "workspace",
        label: "Workspace",
        items: [
          { href: "/admin", label: "Overview", icon: SquaresFour, exact: true },
          { href: "/admin/analytics", label: "Analytics", icon: ChartLineUp },
          { href: "/admin/overrides", label: "Overrides", icon: SealCheck, badge: pending },
        ],
      },
      {
        id: "people",
        label: "People",
        items: [
          { href: "/admin/members", label: "Members", icon: Users },
          { href: "/admin/teams", label: "Teams", icon: UsersThree },
          { href: "/admin/restrictions", label: "Restrictions", icon: Sliders },
        ],
      },
      {
        id: "config",
        label: "Configuration",
        items: [
          { href: "/admin/models", label: "Models", icon: Cube },
          { href: "/admin/presets", label: "Presets", icon: BookmarkSimple },
          { href: "/admin/keys", label: "API keys", icon: Key },
          { href: "/admin/output", label: "Output", icon: HardDrives },
          { href: "/admin/audit", label: "Audit log", icon: ClockCounterClockwise },
          ...(isOwner ? [{ href: "/admin/settings", label: "Settings", icon: GearSix }] : []),
        ],
      },
    );
  }
  return groups;
}

const OPEN_KEY = "higgsarena:sidebar-groups";

export function Sidebar({ isAdmin, isOwner, pending, initialCollapsed, footer }: { isAdmin: boolean; isOwner: boolean; pending: number; initialCollapsed: boolean; footer: (collapsed: boolean) => React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = groupsFor(isAdmin, isOwner, pending);

  // Restore which groups the viewer folded (a per-browser convenience).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(OPEN_KEY);
        if (raw) setClosed(JSON.parse(raw));
      } catch {
        // storage unavailable: keep everything open
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
    document.getElementById("app-shell")?.setAttribute("data-sidebar", next ? "collapsed" : "open");
  };
  const toggleGroup = (id: string) =>
    setClosed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  const active = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));

  return (
    <aside aria-label="Sidebar" className={cn("sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-bg/95 lg:flex", collapsed ? "w-[72px]" : "w-[248px]")}>
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pr-3 pl-5")}>
        <Link href="/studio" aria-label="HiggsArena studio" className="flex items-center gap-2.5">
          <LogoMark size={30} />
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-fg">HiggsArena</span>}
        </Link>
        {!collapsed && (
          <button type="button" onClick={toggleCollapsed} aria-label="Collapse sidebar" title="Collapse sidebar" className="grid h-9 w-9 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
            <SidebarSimple size={18} aria-hidden />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={toggleCollapsed} aria-label="Expand sidebar" title="Expand sidebar" className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
          <SidebarSimple size={18} weight="fill" aria-hidden />
        </button>
      )}

      <nav aria-label="Main" className="fade-y scrollbar-none flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g, gi) => {
          const isClosed = !!closed[g.id] && !collapsed;
          return (
            <div key={g.id} className={cn(gi > 0 && (collapsed ? "mt-3 border-t border-border pt-3" : "mt-5"))}>
              {!collapsed && (
                <button type="button" onClick={() => toggleGroup(g.id)} aria-expanded={!isClosed} className="group flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] font-medium text-fg-subtle hover:text-fg-muted">
                  {g.label}
                  <CaretDown size={12} className={cn("transition-transform", isClosed && "-rotate-90")} aria-hidden />
                </button>
              )}
              {!isClosed && (
                <ul className="mt-0.5 grid gap-0.5">
                  {g.items.map((i) => {
                    const on = active(i);
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          aria-current={on ? "page" : undefined}
                          title={collapsed ? i.label : undefined}
                          aria-label={collapsed ? i.label : undefined}
                          className={cn(
                            "relative flex h-10 items-center gap-3 rounded-[12px] text-[14px] transition-colors",
                            collapsed ? "justify-center" : "px-2.5",
                            on ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
                          )}
                        >
                          <i.icon size={20} weight={on ? "fill" : "regular"} className={cn("shrink-0", on && "text-accent-text")} aria-hidden />
                          {!collapsed && <span className="fade-x min-w-0 flex-1 whitespace-nowrap">{i.label}</span>}
                          {!!i.badge && (
                            <span className={cn("mono grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg", collapsed && "absolute top-0.5 right-1.5 h-4 min-w-4 text-[10px]")}>{i.badge}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        <div className={cn(collapsed ? "mt-3 border-t border-border pt-3" : "mt-5")}>
          <Link href="/docs" aria-current={path.startsWith("/docs") ? "page" : undefined} title={collapsed ? "Guide" : undefined} aria-label={collapsed ? "Guide" : undefined} className={cn("flex h-10 items-center gap-3 rounded-[12px] text-[14px] transition-colors", collapsed ? "justify-center" : "px-2.5", path.startsWith("/docs") ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg")}>
            <BookOpenText size={20} weight={path.startsWith("/docs") ? "fill" : "regular"} className={cn("shrink-0", path.startsWith("/docs") && "text-accent-text")} aria-hidden />
            {!collapsed && "Guide"}
          </Link>
        </div>
      </nav>

      <div className={cn("shrink-0 border-t border-border p-3", collapsed && "px-2")}>{footer(collapsed)}</div>
    </aside>
  );
}

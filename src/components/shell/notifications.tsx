"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type N = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationsBell({ align = "left" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: N[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      // offline: keep the last state
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setUnread(0);
    setItems((i) => i.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
        <Bell size={22} aria-hidden />
        {unread > 0 && <span className="mono absolute top-1.5 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className={cn("panel absolute z-50 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden shadow-[var(--shadow)]", align === "left" ? "bottom-0 left-full ml-2 mb-0 lg:bottom-auto lg:top-0 lg:mt-0" : "right-0")}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && <button type="button" onClick={markAll} className="text-sm text-accent-text hover:underline">Mark all read</button>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg-muted">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <Link href={n.href ?? "#"} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-surface-2">
                  <p className={cn("text-sm", n.readAt ? "text-fg-muted" : "font-medium text-fg")}>
                    {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-label="unread" />}
                    {n.title}
                  </p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-subtle">{n.body}</p>}
                  <p className="mt-1 text-[12px] text-fg-subtle"><time suppressHydrationWarning>{relativeTime(n.createdAt)}</time></p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export type RowMenuItem = { label: string; run: () => Promise<{ ok: boolean; message: string }>; confirm?: string; danger?: boolean };

/** A "more actions" menu for table rows. Risky items ask for confirmation inside the menu. */
export function RowMenu({ label, items, onDone }: { label: string; items: RowMenuItem[]; onDone?: (r: { ok: boolean; message: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<RowMenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // Fixed position so the menu is never clipped by a scrolling table.
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean }>({ top: 0, right: 0, up: false });
  const openMenu = () => {
    const r = btn.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 220;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  function close() { setOpen(false); setAsking(null); }
  const go = (item: RowMenuItem) =>
    start(async () => {
      const r = await item.run();
      if (!r.ok) setError(r.message);
      else { setError(null); close(); }
      onDone?.(r);
    });

  if (!items.length) return null;
  return (
    <div ref={ref} className="relative inline-flex flex-col items-end">
      <button ref={btn} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : openMenu())} className={cn("grid h-9 w-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg", open && "bg-surface-2 text-fg")}>
        <DotsThree size={20} weight="bold" aria-hidden />
      </button>
      {open && (
        <div role="menu" style={{ top: pos.top, right: pos.right, transform: pos.up ? "translateY(-100%)" : undefined }} className="fixed z-50 w-60 rounded-[14px] border border-border bg-bg-elevated p-1.5 text-left shadow-[var(--shadow)]">
          {asking ? (
            <div className="p-2">
              <p className="text-[13px] text-fg">{asking.confirm}</p>
              <div className="mt-3 flex gap-1.5">
                <button type="button" disabled={pending} onClick={() => go(asking)} className={cn("h-8 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50", asking.danger ? "bg-danger-soft text-danger hover:bg-danger/20" : "bg-accent text-accent-fg hover:bg-accent-hover")}>{pending ? "Working…" : asking.label}</button>
                <button type="button" onClick={() => setAsking(null)} className="h-8 rounded-full px-3 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">Cancel</button>
              </div>
            </div>
          ) : (
            items.map((i) => (
              <button key={i.label} role="menuitem" type="button" disabled={pending} onClick={() => (i.confirm ? setAsking(i) : go(i))} className={cn("flex h-9 w-full items-center rounded-[10px] px-2.5 text-[14px] transition-colors disabled:opacity-50", i.danger ? "text-danger hover:bg-danger-soft" : "text-fg hover:bg-surface-2")}>
                {i.label}
              </button>
            ))
          )}
        </div>
      )}
      {error && !open && <p role="status" className="mt-1 max-w-56 text-right text-[12px] text-danger">{error}</p>}
    </div>
  );
}

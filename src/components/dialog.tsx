"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/** Accessible modal: focus moves in, Escape closes, focus returns on close. */
export function Dialog({ open, onClose, title, children, size = "md", bare }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "md" | "lg" | "full"; bare?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("[autofocus],button,input,textarea,select,a[href]")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button,input,textarea,select,a[href],[tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={cn(
              "relative w-full overflow-y-auto bg-bg-elevated shadow-[var(--shadow)] safe-bottom",
              size === "full" ? "h-dvh sm:h-[min(92dvh,1000px)] sm:max-w-6xl sm:rounded-[16px]" : size === "lg" ? "max-h-[92dvh] rounded-t-[16px] sm:max-w-2xl sm:rounded-[16px]" : "max-h-[92dvh] rounded-t-[16px] sm:max-w-md sm:rounded-[16px]",
              !bare && "border border-border p-5 sm:p-6",
            )}
          >
            {!bare && (
              <div className="mb-4 flex items-start justify-between gap-4">
                <h2 id={id} className="text-lg font-semibold">{title}</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="-mt-2 -mr-2 grid h-11 w-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <X size={20} aria-hidden />
                </button>
              </div>
            )}
            {bare && <h2 id={id} className="sr-only">{title}</h2>}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

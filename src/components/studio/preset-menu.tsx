"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkSimple, Check, LockSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { ClientPreset } from "@/lib/presets/repo";
import { templateVariables } from "@/lib/presets/core";
import { cn } from "@/lib/cn";
import { createPresetFromStudio, updatePresetValues } from "@/app/(app)/admin/presets/actions";

export function PresetMenu({
  open,
  onClose,
  anchorId,
  presets,
  activeId,
  onPick,
  onClear,
  isAdmin,
  modelNames,
  current,
  startSaving,
}: {
  open: boolean;
  onClose: () => void;
  anchorId: string;
  presets: ClientPreset[];
  activeId: string | null;
  onPick: (p: ClientPreset) => void;
  onClear: () => void;
  isAdmin: boolean;
  modelNames: Map<string, string>;
  current: { modelSlug: string; params: Record<string, unknown>; prompt?: string } | null;
  startSaving?: boolean;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(!!startSaving);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const active = presets.find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || document.getElementById(anchorId)?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorId]);

  const list = presets.filter((p) => !q.trim() || `${p.name} ${p.description ?? ""} ${modelNames.get(p.modelSlug) ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    if (!current) return;
    setBusy(true);
    const r = await createPresetFromStudio({ name, ...current });
    setBusy(false);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok && r.id) router.push(`/admin/presets/${r.id}`);
  };
  const update = async () => {
    if (!current || !active) return;
    setBusy(true);
    const r = await updatePresetValues(active.id, current);
    setBusy(false);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="Presets"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
          style={{ transformOrigin: "bottom left" }}
          className="settings-panel absolute right-0 bottom-[calc(100%+10px)] left-0 z-10 flex max-h-[min(520px,62dvh)] flex-col sm:right-auto sm:w-[380px]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
            <div>
              <p className="text-[15px] font-semibold tracking-tight">Presets</p>
              <p className="text-[12px] text-fg-subtle">Templates and brand settings from your admins</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close presets" className="grid h-9 w-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
              <X size={16} aria-hidden />
            </button>
          </div>
          {presets.length > 5 && (
            <label className="relative mx-4 mb-2 block">
              <span className="sr-only">Search presets</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search presets" className="h-9 w-full rounded-full bg-surface-2 pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle focus:outline-none" />
            </label>
          )}
          <ul className="fade-y min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {presets.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-fg-muted">{isAdmin ? "No presets yet. Save the current settings below." : "Your admins haven't shared any presets yet."}</li>}
            {list.map((p) => {
              const on = p.id === activeId;
              const vars = templateVariables(p.promptTemplate);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} aria-pressed={on} className={cn("flex w-full items-start gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors", on ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                    <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px]", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted")} aria-hidden>
                      {on ? <Check size={16} weight="bold" /> : <BookmarkSimple size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="fade-x block whitespace-nowrap text-sm font-medium text-fg">{p.name}</span>
                      <span className="fade-x block whitespace-nowrap text-[12px] text-fg-subtle">{modelNames.get(p.modelSlug) ?? p.modelSlug}</span>
                      {p.description && <span className="mt-1 line-clamp-2 block text-[12px] text-fg-muted">{p.description}</span>}
                      {(p.lockedFields.length > 0 || vars.length > 0) && (
                        <span className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-fg-subtle">
                          {p.lockedFields.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-surface-3/70 px-2 py-0.5"><LockSimple size={10} aria-hidden /> {p.lockedFields.length} locked</span>}
                          {vars.length > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-text">{vars.length} to fill in</span>}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {(active || isAdmin) && (
            <div className="grid gap-2 border-t border-border px-3 py-3">
              {active && (
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={onClear} className="h-9 rounded-full px-3 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">Stop using {active.name}</button>
                  {isAdmin && <button type="button" onClick={update} disabled={busy || !current} className="h-9 rounded-full bg-surface-3 px-3.5 text-[13px] font-medium text-fg hover:bg-border-strong disabled:opacity-50">Update preset</button>}
                </div>
              )}
              {isAdmin && !saving && (
                <button type="button" onClick={() => setSaving(true)} disabled={!current} className="h-9 rounded-full px-3 text-left text-[13px] text-accent-text hover:bg-surface-2 disabled:opacity-50">Save current settings as a preset</button>
              )}
              {isAdmin && saving && (
                // Not a <form>: this menu lives inside the composer form.
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="preset-name">Preset name</label>
                  <input id="preset-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) void save(); } }} maxLength={80} placeholder="Preset name" className="h-9 min-w-0 flex-1 rounded-full bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none" />
                  <button type="button" onClick={() => void save()} disabled={busy || !name.trim() || !current} className="h-9 shrink-0 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-fg disabled:opacity-40">{busy ? "Saving" : "Save"}</button>
                </div>
              )}
              {message && <p role="status" className={cn("px-1 text-[12px]", message.ok ? "text-ok" : "text-danger")}>{message.text}</p>}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

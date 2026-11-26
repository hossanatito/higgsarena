"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowCounterClockwise, Info, Minus, Plus, X } from "@phosphor-icons/react";
import type { FieldSpec } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { FieldInput, Switch } from "./fields";
import type { CharacterOption, Values } from "./types";

type Common = { values: Values; setValue: (name: string, v: unknown) => void; errors: Record<string, string> };

const RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function Label({ htmlFor, id, children, value }: { htmlFor?: string; id?: string; children: React.ReactNode; value?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} id={id} className="text-[13px] font-medium text-fg">
        {children}
      </label>
      {value !== undefined && <span className="mono text-[13px] text-fg-muted">{value}</span>}
    </div>
  );
}

/** "standard" reads as "Standard"; values like "720p" or "16:9" stay as they are. */
const display = (o: string | number) => {
  const t = String(o);
  return /^[a-z][a-z\s-]+$/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

/** Connected segmented control; the selected segment slides between options. */
function Segmented({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const reduce = useReducedMotion();
  const opts = field.options ?? [];
  return (
    <div>
      <Label id={`${id}-l`}>{field.label}</Label>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid auto-cols-fr grid-flow-col rounded-full bg-surface-2 p-1">
        {opts.map((o) => {
          const on = String(value) === String(o);
          return (
            <button key={String(o)} type="button" role="radio" aria-checked={on} onClick={() => onChange(o)} className={cn("relative h-8 rounded-full px-2 text-[13px] transition-colors", on ? "text-fg" : "text-fg-muted hover:text-fg")}>
              {on && <motion.span layoutId={reduce ? undefined : `seg-${field.name}`} transition={{ type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-0 rounded-full bg-[var(--seg-on)] shadow-[0_1px_3px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.08)]" />}
              <span className="relative">{display(o)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Aspect ratios as shapes, so the choice is visual rather than numeric. */
function AspectPicker({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const opts = field.options ?? [];
  return (
    <div>
      <Label id={`${id}-l`}>{field.label}</Label>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${opts.length <= 6 ? opts.length : opts.length <= 8 ? 4 : 5}, minmax(0, 1fr))` }}>
        {opts.map((o) => {
          const on = String(value) === String(o);
          const m = String(o).match(RATIO);
          const w = m ? Number(m[1]) : 1;
          const h = m ? Number(m[2]) : 1;
          const scale = 22 / Math.max(w, h);
          return (
            <button key={String(o)} type="button" role="radio" aria-checked={on} onClick={() => onChange(o)} className={cn("flex h-[68px] flex-col items-center justify-center gap-2 rounded-[12px] transition-colors", on ? "bg-surface-3 text-fg ring-1 ring-accent-text/60 ring-inset" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg")}>
              <span className="grid h-6 w-6 place-items-center" aria-hidden>
                <span className={cn("block rounded-[3px] border-[1.5px]", on ? "border-accent-text" : "border-current", !m && "border-dashed")} style={{ width: m ? w * scale : 18, height: m ? h * scale : 18 }} />
              </span>
              <span className="mono text-[11px] leading-none">{String(o)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Range with a filled track, a comfortable thumb and +/- steppers. */
function RangeControl({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? (field.kind === "integer" ? 1 : (max - min) / 100 || 0.01);
  const current = value === undefined || value === "" ? ((field.default as number | undefined) ?? min) : Number(value);
  const pct = ((current - min) / (max - min || 1)) * 100;
  const decimals = step < 1 ? Math.min(3, String(step).split(".")[1]?.length ?? 2) : 0;
  const fmt = (n: number) => (field.name === "duration" ? `${n}s` : n.toFixed(decimals));
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(6))));
  return (
    <div>
      <Label htmlFor={id} value={fmt(current)}>{field.label}</Label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${field.label}`} onClick={() => onChange(clamp(current - step))} disabled={current <= min} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted transition-colors hover:text-fg disabled:opacity-40">
          <Minus size={14} aria-hidden />
        </button>
        <input id={id} type="range" min={min} max={max} step={step} value={current} onChange={(e) => onChange(field.kind === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))} className="range flex-1" style={{ ["--pct" as string]: `${pct}%` }} aria-valuetext={fmt(current)} />
        <button type="button" aria-label={`Increase ${field.label}`} onClick={() => onChange(clamp(current + step))} disabled={current >= max} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted transition-colors hover:text-fg disabled:opacity-40">
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <div className="mono mt-1.5 flex justify-between px-10 text-[11px] text-fg-subtle">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

function ToggleRow({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13px] font-medium text-fg">{field.label}</span>
        {field.description && <span className="block text-[12px] leading-snug text-fg-subtle">{field.description}</span>}
      </label>
      <Switch id={id} checked={value === true} onChange={onChange} label={field.label} />
    </div>
  );
}

/** Pick the best control for a field. */
function Control({ field, common, extra }: { field: FieldSpec; common: Common; extra: { characters: CharacterOption[]; maxMb: number; keySource?: "org" | "personal"; modelSlug: string } }) {
  const value = common.values[field.name];
  const onChange = (v: unknown) => common.setValue(field.name, v);
  const err = common.errors[field.name];
  const error = err ? <p role="alert" className="mt-1.5 text-[12px] text-danger">{err}</p> : null;
  if (field.kind === "select" && field.name === "aspect_ratio") return <div><AspectPicker field={field} value={value} onChange={onChange} />{error}</div>;
  if (field.kind === "select" && (field.options?.length ?? 0) <= 5 && (field.options ?? []).every((o) => String(o).length <= 9)) return <div><Segmented field={field} value={value} onChange={onChange} />{error}</div>;
  if ((field.kind === "integer" || field.kind === "number") && field.min !== undefined && field.max !== undefined && field.max - field.min <= 100 && !field.options) {
    return <div><RangeControl field={field} value={value} onChange={onChange} />{error}</div>;
  }
  if (field.kind === "boolean") return <ToggleRow field={field} value={value} onChange={onChange} />;
  return <FieldInput field={field} value={value} onChange={onChange} error={err} {...extra} />;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

type Tab = "general" | "advanced" | "notes";

export function SettingsPanel({
  open,
  onClose,
  anchorId,
  modelName,
  settingFields,
  advancedFields,
  notes,
  values,
  setValue,
  errors,
  onReset,
  characters,
  maxMb,
  keySource,
  modelSlug,
}: {
  open: boolean;
  onClose: () => void;
  anchorId: string;
  modelName: string;
  settingFields: FieldSpec[];
  advancedFields: FieldSpec[];
  notes?: string | null;
  values: Values;
  setValue: (name: string, v: unknown) => void;
  errors: Record<string, string>;
  onReset: () => void;
  characters: CharacterOption[];
  maxMb: number;
  keySource?: "org" | "personal";
  modelSlug: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("general");
  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(settingFields.length ? [{ id: "general" as const, label: "General" }] : []),
    ...(advancedFields.length ? [{ id: "advanced" as const, label: "Advanced", count: advancedFields.length }] : []),
    ...(notes ? [{ id: "notes" as const, label: "Notes" }] : []),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? "general");
  const advancedErrors = advancedFields.some((f) => errors[f.name]);

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

  const common: Common = { values, setValue, errors };
  const extra = { characters, maxMb, keySource, modelSlug };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          id="composer-settings"
          role="dialog"
          aria-label={`${modelName} settings`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
          style={{ transformOrigin: "bottom left" }}
          className="settings-panel absolute right-0 bottom-[calc(100%+10px)] left-0 z-10 flex max-h-[min(560px,62dvh)] flex-col sm:right-auto sm:w-[420px]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight">Settings</p>
              <p className="truncate text-[12px] text-fg-subtle">{modelName}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close settings" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <X size={16} aria-hidden />
            </button>
          </div>

          {tabs.length > 1 && (
            <div role="tablist" aria-label="Settings sections" className="mx-4 mb-1 flex gap-1 border-b border-border">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => setTab(t.id)} className={cn("relative flex h-9 items-center gap-1.5 px-2.5 text-[13px] transition-colors", active === t.id ? "text-fg" : "text-fg-muted hover:text-fg")}>
                  {t.id === "notes" && <Info size={14} aria-hidden />}
                  {t.label}
                  {t.count !== undefined && <span className="mono text-[11px] text-fg-subtle">{t.count}</span>}
                  {t.id === "advanced" && advancedErrors && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="has errors" />}
                  {active === t.id && <motion.span layoutId={reduce ? undefined : "settings-tab"} className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>
          )}

          <div className="fade-y min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-5">
            {active === "general" && <div className="grid gap-5">{settingFields.map((f) => <Control key={f.name} field={f} common={common} extra={extra} />)}</div>}
            {active === "advanced" && (
              <div className="grid gap-5">
                <p className="text-[12px] text-fg-subtle">These start at the model's defaults. Empty fields are left to the model.</p>
                {advancedFields.map((f) => <Control key={f.name} field={f} common={common} extra={extra} />)}
              </div>
            )}
            {active === "notes" && notes && <div className="text-[13px] leading-relaxed whitespace-pre-line text-fg-muted">{notes}</div>}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
            <button type="button" onClick={onReset} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <ArrowCounterClockwise size={14} aria-hidden /> Reset to defaults
            </button>
            <button type="button" onClick={onClose} className="h-9 rounded-full bg-surface-3 px-4 text-[13px] font-medium text-fg transition-colors hover:bg-border-strong">
              Done
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

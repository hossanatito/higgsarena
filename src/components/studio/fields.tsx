"use client";
import { useState } from "react";
import type { FieldSpec } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { Input, Select, Textarea } from "@/components/ui";
import { Dropzone } from "./dropzone";
import type { CharacterOption, Values } from "./types";

export function defaultValues(fields: FieldSpec[]): Values {
  const v: Values = {};
  for (const f of fields) {
    if (f.default === undefined) continue;
    if (f.kind === "select" || f.kind === "boolean" || f.kind === "integer" || f.kind === "number") v[f.name] = f.default;
  }
  return v;
}

/** Keep only values that belong to this model's fields (used when switching models or remixing). */
export function carryValues(fields: FieldSpec[], from: Values): Values {
  const out = defaultValues(fields);
  for (const f of fields) {
    const v = from[f.name];
    if (v === undefined) continue;
    if (f.kind === "select" && f.options && !f.options.some((o) => String(o) === String(v))) continue;
    out[f.name] = f.kind === "json" && typeof v !== "string" ? JSON.stringify(v, null, 2) : v;
  }
  return out;
}

export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors", checked ? "border-transparent bg-accent" : "border-border-strong bg-surface-3")}>
      <span className={cn("inline-block h-5 w-5 rounded-full shadow transition-transform", checked ? "translate-x-6 bg-accent-fg" : "translate-x-1 bg-fg-muted")} />
    </button>
  );
}

function Chips({ id, field, value, onChange }: { id: string; field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
      {(field.options ?? []).map((o) => {
        const on = String(value) === String(o);
        return (
          <button key={String(o)} type="button" role="radio" aria-checked={on} onClick={() => onChange(on && !field.required && field.default === undefined ? undefined : o)} className={cn("mono h-9 min-w-11 rounded-full border px-3 text-[13px] transition-colors", on ? "border-transparent bg-fg text-bg" : "border-border bg-surface-2 text-fg-muted hover:text-fg")}>
            {String(o)}
          </button>
        );
      })}
    </div>
  );
}

function JsonField({ id, value, onChange, error }: { id: string; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value, null, 2);
  const [local, setLocal] = useState(text);
  const [synced, setSynced] = useState(text);
  const [bad, setBad] = useState<string | null>(null);
  if (text !== synced && text !== local) {
    // The value changed from outside (remix, model switch): show it.
    setSynced(text);
    setLocal(text);
  }
  return (
    <>
      <Textarea
        id={id}
        aria-invalid={!!(bad || error)}
        spellCheck={false}
        className="mono min-h-28 text-[13px]"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          if (!e.target.value.trim()) {
            setBad(null);
            return onChange(undefined);
          }
          try {
            JSON.parse(e.target.value);
            setBad(null);
          } catch {
            setBad("Not valid JSON yet");
          }
          onChange(e.target.value);
        }}
      />
      {bad && <p className="mt-1 text-[12px] text-warn">{bad}</p>}
    </>
  );
}

export function FieldInput({ field, value, onChange, error, characters, maxMb, keySource, modelSlug }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void; error?: string; characters: CharacterOption[]; maxMb: number; keySource?: "org" | "personal"; modelSlug: string }) {
  const id = `f-${field.name}`;
  const labelEl = (
    <span id={`${id}-label`} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-fg-muted">
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {(field.kind === "number" || field.kind === "integer") && value !== undefined && value !== "" && <span className="mono text-fg">{String(value)}</span>}
    </span>
  );
  const help = field.description ? <p className="mt-1 text-[12px] text-fg-subtle">{field.description}</p> : null;
  const err = error ? <p role="alert" className="mt-1 text-[12px] text-danger">{error}</p> : null;

  switch (field.kind) {
    case "image":
    case "images":
    case "video":
    case "videos":
    case "audio":
    case "audios":
      return (
        <div>
          <Dropzone id={id} kind={field.kind} label={field.label} value={value} onChange={onChange} maxItems={field.maxItems} maxMb={maxMb} keySource={keySource} required={field.required} />
          {err}
        </div>
      );
    case "select": {
      const opts = field.options ?? [];
      return (
        <div>
          {labelEl}
          {opts.length <= 8 ? (
            <Chips id={id} field={field} value={value} onChange={onChange} />
          ) : (
            <Select id={id} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : (opts.find((o) => String(o) === e.target.value) ?? e.target.value))}>
              {!field.required && <option value="">Default</option>}
              {opts.map((o) => (
                <option key={String(o)} value={String(o)}>
                  {String(o)}
                </option>
              ))}
            </Select>
          )}
          {help}
          {err}
        </div>
      );
    }
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-4 rounded-[10px] border border-border bg-surface-2/50 px-3 py-2">
          <div>
            <span className="text-[13px] font-medium text-fg">{field.label}</span>
            {field.description && <p className="text-[12px] text-fg-subtle">{field.description}</p>}
          </div>
          <Switch id={id} checked={value === true} onChange={onChange} label={field.label} />
        </div>
      );
    case "integer":
    case "number": {
      const slider = field.min !== undefined && field.max !== undefined && field.max - field.min <= 100;
      const step = field.step ?? (field.kind === "integer" ? 1 : (field.max! - field.min!) / 100 || 0.01);
      return (
        <div>
          {labelEl}
          {slider ? (
            <input id={id} type="range" min={field.min} max={field.max} step={step} value={value === undefined || value === "" ? (field.default as number | undefined) ?? field.min : Number(value)} onChange={(e) => onChange(field.kind === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))} className="h-11 w-full accent-[var(--accent)]" aria-valuetext={String(value ?? "")} />
          ) : (
            <Input id={id} type="number" inputMode={field.kind === "integer" ? "numeric" : "decimal"} min={field.min} max={field.max} step={step} placeholder={field.default !== undefined ? String(field.default) : "Random"} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-invalid={!!error} className="mono" />
          )}
          {help}
          {err}
        </div>
      );
    }
    case "character": {
      const version = /soul-cinema/.test(modelSlug) ? "cinema" : /soul-2/.test(modelSlug) ? "v2" : "v1";
      const options = characters.filter((c) => c.modelVersion === version);
      return (
        <div>
          {labelEl}
          <Select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">No character</option>
            {options.map((c) => (
              <option key={c.id} value={c.referenceId}>
                {c.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[12px] text-fg-subtle">{options.length ? `Trained ${version === "cinema" ? "SOUL Cinema" : `SOUL ${version}`} characters.` : <>No trained characters for this model yet. <a className="text-accent-text underline" href="/characters">Train one</a>.</>}</p>
          {err}
        </div>
      );
    }
    case "ids":
      return (
        <div>
          {labelEl}
          <Input id={id} className="mono" placeholder="Comma-separated IDs" value={Array.isArray(value) ? (value as string[]).join(", ") : ""} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} aria-invalid={!!error} />
          {help}
          {err}
        </div>
      );
    case "json":
      return (
        <div>
          {labelEl}
          <JsonField id={id} value={value} onChange={onChange} error={error} />
          {help}
          {err}
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelEl}
          <Textarea id={id} maxLength={field.maxLength} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} aria-invalid={!!error} />
          {help}
          {err}
        </div>
      );
    default:
      return (
        <div>
          {labelEl}
          <Input id={id} maxLength={field.maxLength} className={/_id$/.test(field.name) ? "mono" : undefined} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} aria-invalid={!!error} />
          {help}
          {err}
        </div>
      );
  }
}

/** Short summary of chosen settings for the collapsed composer: "16:9 · 1080p · 5s". */
export function settingsSummary(fields: FieldSpec[], values: Values): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (f.group !== "settings") continue;
    const v = values[f.name];
    if (v === undefined || v === "") continue;
    if (f.kind === "select" || f.kind === "integer" || f.kind === "number") parts.push(f.name === "duration" ? `${v}s` : String(v));
    else if (f.kind === "boolean" && v === true) parts.push(f.label);
    if (parts.length >= 5) break;
  }
  return parts.join(" · ");
}

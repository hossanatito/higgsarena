"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MagnifyingGlass, Star, ArrowSquareOut } from "@phosphor-icons/react";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import type { PublicModel } from "./types";

export const TOOL_CATEGORIES: Category[] = ["image", "edit", "video", "motion", "character"];

export function CategoryTabs({ value, onChange, counts }: { value: Category; onChange: (c: Category) => void; counts: Record<string, number> }) {
  return (
    <div role="tablist" aria-label="Tools" className="scrollbar-none flex gap-1.5 overflow-x-auto">
      {TOOL_CATEGORIES.map((c) =>
        c === "character" ? (
          <Link key={c} href="/characters" className="h-9 shrink-0 rounded-full border border-border px-3.5 text-[13px] leading-[34px] font-medium text-fg-muted hover:text-fg">
            {CATEGORY_LABELS[c]}
          </Link>
        ) : (
          <button key={c} type="button" role="tab" aria-selected={value === c} onClick={() => onChange(c)} disabled={!counts[c]} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-40", value === c ? "bg-fg text-bg" : "border border-border text-fg-muted hover:text-fg")}>
            {CATEGORY_LABELS[c]}
            <span className="mono ml-1.5 opacity-60">{counts[c] ?? 0}</span>
          </button>
        ),
      )}
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  "text-to-image": "Text to image",
  "text-to-video": "Text to video",
  "image-to-video": "Image to video",
  reference: "Reference",
  "first-last-frame": "First & last frame",
  edit: "Edit",
  extend: "Extend",
  motion: "Motion",
};

/** "Pro" alone is ambiguous when a family has Pro text- and image-to-video: add the mode. */
export function workflowLabel(m: Pick<PublicModel, "workflow" | "mode">): string {
  const mode = MODE_LABEL[m.mode] ?? m.mode;
  if (!m.workflow) return mode;
  const w = m.workflow.toLowerCase();
  if (w.includes(mode.toLowerCase()) || /^(generate|text to image)$/.test(w) || (m.mode === "reference" && w.includes("reference"))) return m.workflow;
  return `${m.workflow} · ${mode}`;
}

export function ModelList({ models, category, selected, onSelect }: { models: PublicModel[]; category: Category; selected: string; onSelect: (slug: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return models
      .filter((m) => m.category === category)
      .filter((m) => !needle || `${m.name} ${m.provider} ${m.mode}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
  }, [models, category, q]);
  return (
    <div className="flex min-h-0 flex-col">
      <label className="relative mb-3 block">
        <span className="sr-only">Search models</span>
        <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models" className="h-10 w-full rounded-[10px] border border-border bg-bg-elevated pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-text focus:outline-none" />
      </label>
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="Models">
        {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-fg-muted">No models match.</li>}
        {list.map((m) => {
          const on = m.slug === selected;
          return (
            <li key={m.slug}>
              <button type="button" onClick={() => onSelect(m.slug)} aria-pressed={on} className={cn("flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors", on ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[11px] font-bold", on ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-muted")} aria-hidden>
                  {m.family.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-fg">{m.family}</span>
                    {m.featured && <Star size={12} weight="fill" className="shrink-0 text-accent-text" aria-label="Featured" />}
                  </span>
                  <span className="block truncate text-[12px] text-fg-subtle">{workflowLabel(m)} · {m.provider}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ModelInfo({ model }: { model: PublicModel }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
      {model.workflow.toLowerCase() !== (MODE_LABEL[model.mode] ?? model.mode).toLowerCase() && <span className="truncate">{MODE_LABEL[model.mode] ?? model.mode}</span>}
      {model.docsUrl && (
        <a href={model.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
          Docs <ArrowSquareOut size={12} aria-hidden />
        </a>
      )}
    </div>
  );
}

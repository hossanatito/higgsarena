"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilmSlate, ImageSquare, MagnifyingGlass, PaintBrush, PersonSimpleRun, Star, UserFocus } from "@phosphor-icons/react";
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
  if (/^(generate|generate ads)$/.test(w)) return mode;
  if (w.includes(mode.toLowerCase()) || (m.mode === "reference" && w.includes("reference"))) return m.workflow;
  return `${m.workflow}, ${mode.toLowerCase()}`;
}

const GLYPH = { image: ImageSquare, edit: PaintBrush, video: FilmSlate, motion: PersonSimpleRun, character: UserFocus } as const;

/** Category glyph instead of two-letter initials. */
function ModelGlyph({ m, on }: { m: PublicModel; on: boolean }) {
  const Icon = GLYPH[m.category as keyof typeof GLYPH] ?? ImageSquare;
  return (
    <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition-colors", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted group-hover:text-fg")}>
      <Icon size={18} weight={on ? "fill" : "regular"} />
    </span>
  );
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
      <ul className="fade-y -mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-6" aria-label="Models">
        {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-fg-muted">No models match.</li>}
        {list.map((m) => {
          const on = m.slug === selected;
          return (
            <li key={m.slug}>
              <button type="button" onClick={() => onSelect(m.slug)} aria-pressed={on} className={cn("group flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors", on ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                <ModelGlyph m={m} on={on} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="fade-x min-w-0 flex-1 whitespace-nowrap text-sm font-medium text-fg">{m.family}</span>
                    {m.featured && <Star size={11} weight="fill" className="shrink-0 text-accent-text" aria-label="Featured" />}
                  </span>
                  <span className="fade-x block whitespace-nowrap text-[12px] text-fg-subtle">{workflowLabel(m)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

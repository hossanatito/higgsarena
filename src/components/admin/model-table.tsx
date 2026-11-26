"use client";
import { useMemo, useState, useTransition } from "react";
import { ArrowSquareOut, Star } from "@phosphor-icons/react";
import { Badge, Input, Table, Td, Th } from "@/components/ui";
import { Switch } from "@/components/studio/fields";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";
import { usd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { setModelFlag } from "@/app/(app)/admin/actions";

type Row = { slug: string; name: string; provider: string; category: Category; enabled: boolean; featured: boolean; verified: boolean; isCustom: boolean; userEdited: boolean; docsUrl: string | null; avgEstimateUsd: number | null; count: number };

export function ModelTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [cat, setCat] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = useMemo(() => rows.filter((r) => (cat === "all" || r.category === cat) && (!q || `${r.name} ${r.provider}`.toLowerCase().includes(q.toLowerCase()))), [rows, cat, q]);
  const flip = (slug: string, flag: "enabled" | "featured", value: boolean) => {
    setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, [flag]: value } : r)));
    start(async () => {
      const res = await setModelFlag(slug, flag, value);
      setMsg(res.message);
      if (!res.ok) setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, [flag]: !value } : r)));
    });
  };
  const cats: (Category | "all")[] = ["all", "image", "edit", "video", "motion", "character"];
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Category">
          {cats.map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} type="button" onClick={() => setCat(c)} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium", cat === c ? "bg-fg text-bg" : "border border-border text-fg-muted hover:text-fg")}>
              {c === "all" ? "All" : CATEGORY_LABELS[c]} <span className="mono opacity-60">{c === "all" ? rows.length : rows.filter((r) => r.category === c).length}</span>
            </button>
          ))}
        </div>
        <label className="sm:w-64"><span className="sr-only">Search models</span><Input type="search" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} className="h-10" /></label>
      </div>
      <p className="mb-3 text-[13px] text-fg-muted" role="status">{msg ?? `${rows.filter((r) => r.enabled).length} of ${rows.length} enabled. Disabled models disappear from every picker and the server rejects them.`}</p>
      <Table>
        <thead><tr><Th>Model</Th><Th>Category</Th><Th className="text-right">Avg estimate</Th><Th>Enabled</Th><Th className="text-center">Featured</Th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.slug}>
              <Td>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.docsUrl && <a href={r.docsUrl} target="_blank" rel="noopener noreferrer" aria-label={`${r.name} docs`} className="text-fg-subtle hover:text-fg"><ArrowSquareOut size={14} aria-hidden /></a>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-fg-subtle">
                  <span>{r.provider}</span>
                  {!r.verified && <Badge tone="warn">schema unverified</Badge>}
                  {r.isCustom && <Badge tone="info">custom</Badge>}
                  {r.userEdited && !r.isCustom && <Badge>edited</Badge>}
                </div>
              </Td>
              <Td className="text-fg-muted">{CATEGORY_LABELS[r.category]}</Td>
              <Td className="mono text-right text-fg-muted">{r.avgEstimateUsd !== null ? `${usd(r.avgEstimateUsd, { precise: true })}` : "-"}{r.count ? <span className="text-fg-subtle"> · {r.count}×</span> : null}</Td>
              <Td><Switch id={`en-${r.slug}`} label={`Enable ${r.name}`} checked={r.enabled} onChange={(v) => flip(r.slug, "enabled", v)} /></Td>
              <Td className="text-center">
                <button type="button" aria-pressed={r.featured} aria-label={`Feature ${r.name}`} title={r.featured ? "Featured at the top of the picker" : "Feature at the top of the picker"} onClick={() => flip(r.slug, "featured", !r.featured)} className={`grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-surface-2 ${r.featured ? "text-accent-text" : "text-fg-subtle hover:text-fg"}`}>
                  <Star size={18} weight={r.featured ? "fill" : "regular"} aria-hidden />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

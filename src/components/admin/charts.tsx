"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usd } from "@/lib/format";

/**
 * Small SVG charts for the admin dashboards. Image = series 1 (blue),
 * video = series 2 (orange); palette validated for CVD separation in both
 * themes. Every chart has a legend, hover tooltips and a table view.
 */

type Point = { label: string; image: number; video: number };

const SERIES = [
  { key: "image" as const, name: "Image", color: "var(--chart-image)" },
  { key: "video" as const, name: "Video", color: "var(--chart-video)" },
];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Bar with a 4px rounded top, square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function Legend() {
  return (
    <ul className="flex gap-4 text-[13px] text-fg-muted" aria-label="Legend">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Track the container's pixel width so text stays at its real size. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function StackedBars({ data, title, labelEvery }: { data: Point[]; title: string; labelEvery?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>(720);
  const H = 220;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(0, ...data.map((d) => d.image + d.video)));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = innerW / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(28, step - 3));
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const every = Math.max(labelEvery ?? 1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 56))));
  const ticks = [0, max / 2, max];
  const h = hover !== null ? data[hover] : null;
  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <Legend />
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--fg-subtle)" className="mono">{usd(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * step + (step - bw) / 2;
            const imgH = (d.image / max) * innerH;
            const vidH = (d.video / max) * innerH;
            const gap = d.image > 0 && d.video > 0 ? 2 : 0;
            const base = pad.t + innerH;
            return (
              <g key={d.label} opacity={hover === null || hover === i ? 1 : 0.55}>
                {/* image segment sits on the baseline; video on top with a 2px surface gap */}
                {d.image > 0 && <path d={d.video > 0 ? `M${x},${base}V${base - imgH}H${x + bw}V${base}Z` : topRounded(x, base - imgH, bw, imgH)} fill="var(--chart-image)" />}
                {d.video > 0 && <path d={topRounded(x, base - imgH - gap - vidH, bw, vidH)} fill="var(--chart-video)" />}
                {i % every === 0 && (
                  <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--fg-subtle)">{d.label.length === 10 ? d.label.slice(5) : d.label}</text>
                )}
                <rect x={pad.l + i * step} y={pad.t} width={step} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-[10px] border border-border bg-bg-elevated px-3 py-2 text-[12px] shadow-[var(--shadow)]" style={{ left: `min(calc(${((pad.l + hover * step + step / 2) / W) * 100}% + 8px), calc(100% - 150px))` }}>
            <p className="mb-1 font-medium">{h.label}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2 text-fg-muted">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden /> {s.name} <span className="mono ml-auto pl-3 text-fg">{usd(h[s.key])}</span>
              </p>
            ))}
            <p className="mt-1 flex border-t border-border pt-1 text-fg-muted">Total <span className="mono ml-auto pl-3 text-fg">{usd(h.image + h.video)}</span></p>
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-fg-subtle hover:text-fg">Show as table</summary>
        <div className="mt-2 max-h-60 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-fg-muted"><th className="py-1 font-medium">Period</th><th className="py-1 text-right font-medium">Image</th><th className="py-1 text-right font-medium">Video</th><th className="py-1 text-right font-medium">Total</th></tr></thead>
            <tbody className="mono">
              {data.map((d) => (
                <tr key={d.label} className="border-t border-border"><td className="py-1">{d.label}</td><td className="py-1 text-right">{usd(d.image)}</td><td className="py-1 text-right">{usd(d.video)}</td><td className="py-1 text-right">{usd(d.image + d.video)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** One horizontal bar per row (single series), with an optional budget marker. */
export function BarList({ rows, title, valueLabel = usd }: { rows: { key: string; label: string; value: number; sub?: string; budget?: number | null }[]; title: string; valueLabel?: (v: number) => string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.value, r.budget ?? 0)));
  if (!rows.length) return <p className="py-6 text-center text-sm text-fg-muted">No data in this range.</p>;
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="grid gap-2.5">
        {rows.map((r) => {
          const over = r.budget ? r.value / r.budget : null;
          return (
            <li key={r.key} title={`${r.label}: ${valueLabel(r.value)}${r.budget ? ` of ${usd(r.budget)} budget` : ""}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-fg">{r.label}{r.sub && <span className="ml-1.5 text-fg-subtle">{r.sub}</span>}</span>
                <span className="mono shrink-0 text-fg">
                  {valueLabel(r.value)}
                  {r.budget ? <span className="text-fg-subtle"> / {usd(r.budget)}</span> : null}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: over !== null && over >= 1 ? "var(--danger)" : over !== null && over >= 0.8 ? "var(--warn)" : "var(--chart-image)" }} />
                {r.budget ? <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-fg-muted" style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }} aria-hidden /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

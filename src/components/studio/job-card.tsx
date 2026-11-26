"use client";
import { motion, useReducedMotion } from "motion/react";
import { ArrowsClockwise, DownloadSimple, Heart, Prohibit, Warning, XCircle, Clock, CircleNotch, FileArchive } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { expiryLabel, relativeTime, usd } from "@/lib/format";
import type { ClientGeneration } from "./types";

export function aspectOf(g: Pick<ClientGeneration, "params" | "outputType">): string {
  const ar = g.params.aspect_ratio;
  if (typeof ar === "string" && /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(ar)) {
    const [w, h] = ar.split(":").map(Number);
    return `${w} / ${h}`;
  }
  return g.outputType === "video" ? "16 / 9" : "1 / 1";
}

export const STATUS: Record<ClientGeneration["status"], { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "danger" | "info" }> = {
  submitting: { label: "Sending", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  in_progress: { label: "Rendering", tone: "accent" },
  completed: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  nsfw: { label: "Moderated", tone: "warn" },
  canceled: { label: "Canceled", tone: "neutral" },
  error: { label: "Not sent", tone: "danger" },
};

export function altText(g: Pick<ClientGeneration, "prompt" | "modelName">): string {
  return g.prompt ? `Generated with ${g.modelName}: ${g.prompt.slice(0, 180)}` : `Generated with ${g.modelName}`;
}

export function MediaPreview({ g, className, controls }: { g: ClientGeneration; className?: string; controls?: boolean }) {
  const visual = g.outputs.filter((o) => o.kind === "image" || o.kind === "video");
  const first = visual[0];
  if (!first) {
    const audio = g.outputs.find((o) => o.kind === "audio");
    if (audio) return <audio src={audio.displayUrl} controls className="w-full p-3" />;
    return <div className={cn("grid place-items-center bg-surface-2 text-fg-subtle", className)} style={{ aspectRatio: aspectOf(g) }}><FileArchive size={28} aria-hidden /></div>;
  }
  if (first.kind === "video") {
    return <video src={first.displayUrl} className={cn("block w-full bg-black object-cover", className)} style={{ aspectRatio: aspectOf(g) }} muted={!controls} loop playsInline autoPlay={!controls} controls={controls} preload="metadata" aria-label={altText(g)} />;
  }
  if (visual.length > 1 && !controls) {
    return (
      <div className={cn("grid grid-cols-2 gap-0.5 bg-surface-2", className)}>
        {visual.slice(0, 4).map((o) => <img key={o.url} src={o.displayUrl} alt={altText(g)} loading="lazy" className="aspect-square w-full object-cover" />)}
      </div>
    );
  }
  return <img src={first.displayUrl} alt={altText(g)} loading="lazy" className={cn("block w-full object-cover", className)} style={{ aspectRatio: aspectOf(g) }} />;
}

const DOT: Record<string, string> = { neutral: "bg-white/60", accent: "bg-[#c6f432]", ok: "bg-[#4ade80]", warn: "bg-[#fbbf24]", danger: "bg-[#f87171]", info: "bg-[#60a5fa]" };

/** Badges that sit on top of media: solid dark backing so they read on any image. */
function MediaBadge({ tone, children, title }: { tone: keyof typeof DOT; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-white backdrop-blur">
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function JobCard({ g, onRemix, onCancel, onOpen, onFavorite }: { g: ClientGeneration; onRemix?: (g: ClientGeneration) => void; onCancel?: (g: ClientGeneration) => void; onOpen?: (g: ClientGeneration) => void; onFavorite?: (g: ClientGeneration) => void }) {
  const reduce = useReducedMotion();
  const st = STATUS[g.status];
  const active = g.status === "submitting" || g.status === "queued" || g.status === "in_progress";
  const expiry = g.status === "completed" && !g.mirrored ? expiryLabel(g.expiresAt) : null;
  const cost = g.status === "completed" ? (g.costUnknown ? "cost unknown" : usd(g.costUsd)) : active ? `≈ ${usd(g.estimatedCostUsd)}` : "$0";
  return (
    <motion.article layout={!reduce} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }} className="panel overflow-hidden" aria-busy={active}>
      <div className="relative">
        {g.status === "completed" && !expiry?.expired ? (
          <button type="button" className="block w-full cursor-zoom-in" onClick={() => onOpen?.(g)} aria-label={`Open ${g.modelName} result`}>
            <MediaPreview g={g} />
          </button>
        ) : (
          <div className={cn("grid place-items-center", active ? "shimmer" : "bg-surface-2")} style={{ aspectRatio: aspectOf(g) }}>
            <div className="flex flex-col items-center gap-2 px-6 text-center text-fg-muted">
              {active && (g.status === "in_progress" ? <CircleNotch size={26} className="animate-spin text-accent-text" aria-hidden /> : <Clock size={26} aria-hidden />)}
              {g.status === "failed" || g.status === "error" ? <XCircle size={26} className="text-danger" aria-hidden /> : null}
              {g.status === "nsfw" && <Prohibit size={26} className="text-warn" aria-hidden />}
              {g.status === "canceled" && <XCircle size={26} aria-hidden />}
              {expiry?.expired && <Warning size={26} className="text-warn" aria-hidden />}
              <p className="text-[13px]">
                {g.status === "queued" && "Waiting in the Higgsfield queue"}
                {g.status === "submitting" && (g.error ? `Retrying: ${g.error}` : "Sending to Higgsfield")}
                {g.status === "in_progress" && "Rendering"}
                {(g.status === "failed" || g.status === "error") && (g.error ?? "Generation failed")}
                {g.status === "nsfw" && "Rejected by content moderation. Not charged."}
                {g.status === "canceled" && "Canceled. Not charged."}
                {expiry?.expired && "This file expired on Higgsfield after 7 days."}
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute top-2.5 left-2.5 flex gap-1.5">
          <MediaBadge tone={st.tone}>{st.label}</MediaBadge>
          {expiry && !expiry.expired && <MediaBadge tone={expiry.urgent ? "warn" : "neutral"} title={expiry.label}>{expiry.short}</MediaBadge>}
        </div>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg" title={g.modelName}>{g.modelName}</p>
          <p className="truncate text-[12px] text-fg-subtle">
            <span className="mono">{cost}</span> · <time suppressHydrationWarning>{relativeTime(g.createdAt)}</time>
            {g.keySource === "personal" && " · my key"}
          </p>
        </div>
        {g.status === "queued" && onCancel && (
          <button type="button" onClick={() => onCancel(g)} className="h-9 rounded-full px-3 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">Cancel</button>
        )}
        {onFavorite && g.status === "completed" && (
          <button type="button" onClick={() => onFavorite(g)} aria-pressed={g.favorite} aria-label={g.favorite ? "Remove from favourites" : "Add to favourites"} className="grid h-9 w-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
            <Heart size={18} weight={g.favorite ? "fill" : "regular"} className={g.favorite ? "text-accent-text" : ""} aria-hidden />
          </button>
        )}
        {g.status === "completed" && g.outputs[0] && (
          <a href={g.outputs[0].displayUrl} download target="_blank" rel="noopener noreferrer" aria-label="Download" className="grid h-9 w-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
            <DownloadSimple size={18} aria-hidden />
          </a>
        )}
        {onRemix && !active && (
          <button type="button" onClick={() => onRemix(g)} aria-label="Remix with the same settings" title="Remix" className="grid h-9 w-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
            <ArrowsClockwise size={18} aria-hidden />
          </button>
        )}
      </div>
    </motion.article>
  );
}

export function JobSkeleton({ aspect = "1 / 1" }: { aspect?: string }) {
  return (
    <div className="panel overflow-hidden">
      <div className="shimmer" style={{ aspectRatio: aspect }} />
      <div className="space-y-2 px-3.5 py-3">
        <div className="shimmer h-3 w-2/3 rounded" />
        <div className="shimmer h-2.5 w-1/3 rounded" />
      </div>
    </div>
  );
}

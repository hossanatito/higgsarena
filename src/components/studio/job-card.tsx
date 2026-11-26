"use client";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ComponentType } from "react";
import { ArrowCounterClockwise, ClockCountdown, FolderSimpleMinus, FolderSimplePlus, ImageBroken, CloudSlash, DownloadSimple, EyeSlash, FileArchive, Heart, HourglassMedium, PaperPlaneTilt, Play, Prohibit, Shuffle, Sparkle, Stack, WarningOctagon, type IconProps } from "@phosphor-icons/react";
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

/** Shown when a file can no longer be loaded (expired or deleted on Higgsfield). */
function Unavailable({ className, aspect }: { className?: string; aspect?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 bg-surface-2 text-fg-subtle", className)} style={aspect ? { aspectRatio: aspect } : undefined}>
      <ImageBroken size={24} aria-hidden />
      <span className="text-[12px]">Preview unavailable</span>
    </div>
  );
}

function SafeImg({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Unavailable className={cn(className, "h-full")} aspect={style?.aspectRatio as string | undefined} />;
  return <img src={src} alt={alt} loading="lazy" className={className} style={style} onError={() => setFailed(true)} />;
}

export function MediaPreview({ g, className, controls, fill }: { g: ClientGeneration; className?: string; controls?: boolean; fill?: boolean }) {
  const visual = g.outputs.filter((o) => o.kind === "image" || o.kind === "video");
  const first = visual[0];
  if (!first) {
    const audio = g.outputs.find((o) => o.kind === "audio");
    if (audio) return <audio src={audio.displayUrl} controls className="w-full p-3" />;
    return <div className={cn("grid place-items-center bg-surface-2 text-fg-subtle", className)} style={{ aspectRatio: aspectOf(g) }}><FileArchive size={28} aria-hidden /></div>;
  }
  if (first.kind === "video") {
    return <video src={first.displayUrl} className={cn("block w-full bg-black object-cover", fill && "h-full", className)} style={fill ? undefined : { aspectRatio: aspectOf(g) }} muted={!controls} loop playsInline autoPlay={!controls} controls={controls} preload="metadata" aria-label={altText(g)} />;
  }
  if (visual.length > 1 && !controls) {
    return (
      <div className={cn("grid grid-cols-2 gap-0.5 bg-surface-2", fill && "h-full grid-rows-2", className)}>
        {visual.slice(0, 4).map((o) => <SafeImg key={o.url} src={o.displayUrl} alt={altText(g)} className={cn("w-full object-cover", fill ? "h-full" : "aspect-square")} />)}
      </div>
    );
  }
  return <SafeImg src={first.displayUrl} alt={altText(g)} className={cn("block w-full object-cover", fill && "h-full", className)} style={fill ? undefined : { aspectRatio: aspectOf(g) }} />;
}

const STATUS_ICON: Record<ClientGeneration["status"], ComponentType<IconProps>> = {
  submitting: PaperPlaneTilt,
  queued: HourglassMedium,
  in_progress: Sparkle,
  completed: Sparkle,
  failed: WarningOctagon,
  nsfw: EyeSlash,
  canceled: Prohibit,
  error: CloudSlash,
};

const STATUS_TEXT: Partial<Record<ClientGeneration["status"], string>> = {
  submitting: "Sending to Higgsfield",
  queued: "Waiting in the queue",
  in_progress: "Rendering",
  nsfw: "Moderated. Not charged.",
  canceled: "Canceled. Not charged.",
};

/** Small glass control that sits on top of media. */
function OverlayButton({ label, onClick, href, children, pressed, hideOnTouch }: { label: string; onClick?: () => void; href?: string; children: React.ReactNode; pressed?: boolean; hideOnTouch?: boolean }) {
  const cls = cn("grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/70 pointer-coarse:h-11 pointer-coarse:w-11", hideOnTouch && "pointer-coarse:hidden");
  if (href) {
    return (
      <a href={href} download target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed} className={cls}>
      {children}
    </button>
  );
}

function Chip({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: "neutral" | "warn"; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap backdrop-blur-md", tone === "warn" ? "bg-black/55 text-[#fcd34d]" : "bg-black/45 text-white/90")}>
      {children}
    </span>
  );
}

export function JobCard({ g, onRemix, onCancel, onOpen, onFavorite, onCollect, onRemove, tile }: { g: ClientGeneration; onRemix?: (g: ClientGeneration) => void; onCancel?: (g: ClientGeneration) => void; onOpen?: (g: ClientGeneration) => void; onFavorite?: (g: ClientGeneration) => void; onCollect?: (g: ClientGeneration) => void; onRemove?: (g: ClientGeneration) => void; tile?: boolean }) {
  const reduce = useReducedMotion();
  const active = g.status === "submitting" || g.status === "queued" || g.status === "in_progress";
  const done = g.status === "completed";
  const expiry = done && !g.mirrored ? expiryLabel(g.expiresAt) : null;
  const expired = !!expiry?.expired;
  const showMedia = done && !expired;
  const cost = done ? (g.costUnknown ? "cost unknown" : usd(g.costUsd)) : active ? `≈ ${usd(g.estimatedCostUsd)}` : "$0";
  const images = g.outputs.filter((o) => o.kind === "image").length;
  const Icon = expired ? ClockCountdown : STATUS_ICON[g.status];
  const failed = g.status === "failed" || g.status === "error";

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={cn("group relative isolate overflow-hidden rounded-[16px] bg-surface-2 ring-1 ring-white/[0.06] ring-inset", tile && "aspect-[4/5]")}
      aria-busy={active}
    >
      {showMedia ? (
        <button type="button" className={cn("block w-full cursor-zoom-in overflow-hidden", tile && "h-full")} onClick={() => onOpen?.(g)} aria-label={`Open ${g.modelName} result`}>
          <MediaPreview g={g} fill={tile} className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />
        </button>
      ) : (
        <div className={cn("relative flex flex-col items-center justify-center pb-16", active && "shimmer", tile && "h-full")} style={tile ? undefined : { aspectRatio: aspectOf(g) }}>
          {active && !reduce && <div aria-hidden className="pulse-glow absolute inset-0" />}
          <div className="relative flex max-w-[85%] flex-col items-center gap-2 text-center">
            <span className={cn("grid h-10 w-10 place-items-center rounded-full", failed ? "bg-danger-soft text-danger" : g.status === "nsfw" || expired ? "bg-warn-soft text-warn" : active ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-fg-muted")}>
              <Icon size={22} weight={g.status === "in_progress" ? "fill" : "regular"} className={cn(g.status === "in_progress" && !reduce && "animate-pulse")} aria-hidden />
            </span>
            <p className="line-clamp-2 text-[12px] leading-snug text-fg-muted sm:text-[13px]">
              {expired ? "Expired on Higgsfield after 7 days" : failed ? (g.error ?? "Generation failed") : g.status === "submitting" && g.error ? `Retrying: ${g.error}` : STATUS_TEXT[g.status]}
            </p>
            {g.status === "queued" && onCancel && (
              <button type="button" onClick={() => onCancel(g)} className="h-8 rounded-full bg-surface-3 px-3 text-[12px] text-fg-muted transition-colors hover:text-fg">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top row: what it is, and quick actions on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
        <div className="flex gap-1">
          {showMedia && g.outputType === "video" && (
            <Chip>
              <Play size={11} weight="fill" aria-hidden /> Video
            </Chip>
          )}
          {showMedia && images > 1 && (
            <Chip>
              <Stack size={12} aria-hidden /> {images}
            </Chip>
          )}
          {expiry && !expiry.expired && expiry.urgent && (
            <Chip tone="warn" title={expiry.label}>
              <ClockCountdown size={12} aria-hidden /> {expiry.short}
            </Chip>
          )}
        </div>
        {showMedia && (
          <div className="pointer-events-auto flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
            {onFavorite && (
              <OverlayButton label={g.favorite ? "Remove from favourites" : "Add to favourites"} onClick={() => onFavorite(g)} pressed={g.favorite}>
                <Heart size={16} weight={g.favorite ? "fill" : "regular"} className={g.favorite ? "text-accent" : ""} aria-hidden />
              </OverlayButton>
            )}
            {onCollect && (
              <OverlayButton label="Add to collection" onClick={() => onCollect(g)}>
                <FolderSimplePlus size={16} aria-hidden />
              </OverlayButton>
            )}
            {onRemove && (
              <OverlayButton label="Remove from this collection" onClick={() => onRemove(g)}>
                <FolderSimpleMinus size={16} aria-hidden />
              </OverlayButton>
            )}
            {g.outputs[0] && (
              <OverlayButton label="Download" href={g.outputs[0].displayUrl} hideOnTouch>
                <DownloadSimple size={16} aria-hidden />
              </OverlayButton>
            )}
            {onRemix && (
              <OverlayButton label="Remix with the same settings" onClick={() => onRemix(g)} hideOnTouch>
                <Shuffle size={16} aria-hidden />
              </OverlayButton>
            )}
          </div>
        )}
        {!showMedia && !active && onRemix && (
          <div className="pointer-events-auto">
            <button type="button" onClick={() => onRemix(g)} aria-label="Try again with the same settings" title="Try again" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-fg-muted transition-colors hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11">
              <ArrowCounterClockwise size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* Bottom: model, cost and prompt on a fading scrim */}
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 px-3 pt-10 pb-2.5", showMedia ? "bg-gradient-to-t from-black/80 via-black/35 to-transparent text-white" : "text-fg")}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="fade-x min-w-0 flex-1 whitespace-nowrap text-[13px] font-semibold" title={g.modelName}>{g.modelName.split(" · ")[0]}</p>
          <p className={cn("mono shrink-0 text-[12px]", showMedia ? "text-white/75" : "text-fg-subtle")}>{cost}</p>
        </div>
        {g.prompt && <p className={cn("fade-x mt-0.5 whitespace-nowrap text-[12px]", showMedia ? "text-white/70" : "text-fg-subtle")}>{g.prompt}</p>}
        <p className={cn("mt-0.5 text-[11px]", showMedia ? "text-white/50" : "text-fg-subtle")}>
          <time suppressHydrationWarning>{relativeTime(g.createdAt)}</time>
          {g.keySource === "personal" && ", my key"}
        </p>
      </div>
    </motion.article>
  );
}

export function JobSkeleton({ aspect = "1 / 1" }: { aspect?: string }) {
  return (
    <div className="shimmer rounded-[16px]" style={{ aspectRatio: aspect }} />
  );
}

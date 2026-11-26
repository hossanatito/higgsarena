"use client";
import { useState } from "react";
import { ArrowsClockwise, FolderSimplePlus, Copy, DownloadSimple, Heart, Trash, X, Check, ArrowSquareOut } from "@phosphor-icons/react";
import { Dialog } from "@/components/dialog";
import { Badge, Button } from "@/components/ui";
import { dateTime, expiryLabel, usd } from "@/lib/format";
import { MediaPreview, STATUS, altText } from "@/components/studio/job-card";
import type { ClientGeneration } from "@/components/studio/types";

export function Viewer({ g, onClose, onRemix, onFavorite, onDelete, onCollect, owner }: { g: ClientGeneration | null; onClose: () => void; onRemix?: (g: ClientGeneration) => void; onFavorite?: (g: ClientGeneration) => void; onDelete?: (g: ClientGeneration) => Promise<void>; onCollect?: (g: ClientGeneration) => void; owner?: string }) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!g) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const expiry = !g.mirrored ? expiryLabel(g.expiresAt) : null;
  const settings = Object.entries(g.params).filter(([k]) => k !== "prompt");
  const images = g.outputs.filter((o) => o.kind === "image");
  const files = g.outputs.filter((o) => o.kind === "file");
  return (
    <Dialog open onClose={() => { setConfirm(false); onClose(); }} title={`${g.modelName} result`} size="full" bare>
      <div className="grid h-full lg:grid-cols-[1fr_360px]">
        <div className="relative flex min-h-[50dvh] items-center justify-center bg-black/90 p-2 sm:p-6">
          {images.length > 1 ? (
            <div className="grid max-h-full w-full grid-cols-2 gap-2 overflow-y-auto">
              {images.map((o) => <img key={o.url} src={o.displayUrl} alt={altText(g)} className="w-full rounded-[10px] object-contain" />)}
            </div>
          ) : (
            <div className="max-h-full w-full max-w-4xl [&_img]:max-h-[80dvh] [&_img]:object-contain [&_video]:max-h-[80dvh] [&_video]:object-contain">
              <MediaPreview g={g} controls className="rounded-[10px]" />
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Close viewer" className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 lg:hidden">
            <X size={20} aria-hidden />
          </button>
        </div>
        <aside className="flex flex-col gap-5 overflow-y-auto border-l border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{g.modelName}</p>
              <p className="text-[13px] text-fg-subtle">{dateTime(g.createdAt)}{owner ? ` · ${owner}` : ""}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close viewer" className="hidden h-11 w-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg lg:grid">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
            {g.mirrored ? <Badge tone="ok">Saved to storage</Badge> : expiry && <Badge tone={expiry.urgent ? "warn" : "neutral"}>{expiry.label}</Badge>}
            {g.keySource === "personal" && <Badge>My key</Badge>}
          </div>
          {g.prompt && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-fg-muted">Prompt</p>
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(g.prompt ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                  {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{g.prompt}</p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <dt className="text-fg-muted">Cost (estimate)</dt>
            <dd className="mono text-right">{g.costUnknown ? "unknown" : usd(g.costUsd ?? g.estimatedCostUsd)}</dd>
            {settings.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="truncate text-fg-muted">{k}</dt>
                <dd className="mono truncate text-right" title={typeof v === "object" ? JSON.stringify(v) : String(v)}>{typeof v === "object" ? (Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : "{…}") : String(v)}</dd>
              </div>
            ))}
            {g.requestId && (
              <>
                <dt className="text-fg-muted">Request ID</dt>
                <dd className="mono truncate text-right text-fg-subtle" title={g.requestId}>{g.requestId.slice(0, 13)}…</dd>
              </>
            )}
          </dl>
          {files.length > 0 && (
            <div className="grid gap-2">
              <p className="text-[13px] font-medium text-fg-muted">Other files</p>
              {files.map((f) => (
                <a key={f.url} href={f.displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline">
                  <ArrowSquareOut size={16} aria-hidden /> {f.label ?? "Download"}
                </a>
              ))}
            </div>
          )}
          <div className="mt-auto grid grid-cols-2 gap-2">
            {g.outputs[0] && (
              <a href={g.outputs[0].displayUrl} download target="_blank" rel="noopener noreferrer" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-accent-fg hover:bg-accent-hover">
                <DownloadSimple size={18} aria-hidden /> Download
              </a>
            )}
            {onRemix && <Button onClick={() => onRemix(g)}><ArrowsClockwise size={18} aria-hidden /> Remix</Button>}
            {onCollect && <Button onClick={() => onCollect(g)}><FolderSimplePlus size={18} aria-hidden /> Collect</Button>}
            {onFavorite && (
              <Button onClick={() => onFavorite(g)} aria-pressed={g.favorite}>
                <Heart size={18} weight={g.favorite ? "fill" : "regular"} className={g.favorite ? "text-accent-text" : ""} aria-hidden /> {g.favorite ? "Favourited" : "Favourite"}
              </Button>
            )}
            {onDelete && !confirm && <Button variant="ghost" className="col-span-2" onClick={() => setConfirm(true)}><Trash size={18} aria-hidden /> Delete</Button>}
            {onDelete && confirm && (
              <div className="col-span-2 rounded-[16px] border border-danger/30 bg-danger-soft p-3">
                <p className="text-[13px] text-fg">Delete this result here and on Higgsfield? This can't be undone.</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" disabled={busy} onClick={async () => { setBusy(true); await onDelete(g); setBusy(false); setConfirm(false); }}>{busy ? "Deleting…" : "Delete"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
                </div>
              </div>
            )}
          </div>
          <p className="text-[12px] text-fg-subtle">Costs are estimates. The <a className="underline" href="https://console.higgsfield.ai" target="_blank" rel="noopener noreferrer">Higgsfield Console</a> is the billing record.</p>
        </aside>
      </div>
    </Dialog>
  );
}

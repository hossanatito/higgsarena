"use client";
import { useState } from "react";
import { CaretLeft, CaretRight, DownloadSimple, ImageBroken, Play, X } from "@phosphor-icons/react";
import { Dialog } from "@/components/dialog";
import type { PublicItem } from "@/lib/collections";

const ratio = (a: string | null) => {
  const m = a?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  return m ? `${m[1]} / ${m[2]}` : undefined;
};

function Media({ item, large }: { item: PublicItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const first = item.media[0];
  if (!first || failed) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-surface-2 text-fg-subtle">
        <ImageBroken size={24} aria-hidden />
        <span className="text-[12px]">No longer available</span>
      </div>
    );
  }
  const alt = item.prompt ? `Generated image: ${item.prompt.slice(0, 160)}` : "Generated image";
  if (first.kind === "video") {
    return <video src={first.url} controls={large} muted={!large} loop playsInline autoPlay={!large} preload="metadata" className={large ? "max-h-[78dvh] w-full rounded-[12px] bg-black object-contain" : "block w-full bg-black object-cover"} style={large ? undefined : { aspectRatio: ratio(item.aspect) }} onError={() => setFailed(true)} aria-label={alt} />;
  }
  return <img src={first.url} alt={alt} loading={large ? "eager" : "lazy"} className={large ? "max-h-[78dvh] w-full rounded-[12px] object-contain" : "block w-full object-cover"} style={large ? undefined : { aspectRatio: ratio(item.aspect) }} onError={() => setFailed(true)} />;
}

export function ShareGallery({ items }: { items: PublicItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const item = open !== null ? items[open] : undefined;
  const go = (d: number) => setOpen((i) => (i === null ? i : (i + d + items.length) % items.length));
  return (
    <>
      <div className="masonry columns-2 md:columns-3 xl:columns-4">
        {items.map((it, i) => (
          <figure key={it.id}>
            <button type="button" onClick={() => setOpen(i)} className="group relative block w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-surface-2 ring-1 ring-white/[0.06] ring-inset" aria-label={`Open item ${i + 1} of ${items.length}`}>
              <Media item={it} />
              {it.outputType === "video" && (
                <span className="pointer-events-none absolute top-2.5 left-2.5 inline-flex h-6 items-center gap-1 rounded-full bg-black/50 px-2 text-[11px] text-white backdrop-blur-md">
                  <Play size={11} weight="fill" aria-hidden /> Video
                </span>
              )}
            </button>
            {it.prompt && <figcaption className="mt-1.5 line-clamp-2 px-1 text-[12px] text-fg-subtle">{it.prompt}</figcaption>}
          </figure>
        ))}
      </div>
      <Dialog open={!!item} onClose={() => setOpen(null)} title="Item" size="full" bare>
        {item && (
          <div className="relative flex h-full flex-col bg-bg-elevated">
            <div className="flex items-center justify-between gap-2 p-3">
              <span className="mono pl-2 text-[12px] text-fg-subtle">{open! + 1} / {items.length}</span>
              <div className="flex gap-1">
                {item.media[0] && (
                  <a href={item.media[0].url} target="_blank" rel="noopener noreferrer" download aria-label="Download" className="grid h-10 w-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
                    <DownloadSimple size={18} aria-hidden />
                  </a>
                )}
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <X size={18} aria-hidden />
                </button>
              </div>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-3 pb-4 sm:px-16">
              <div className="w-full max-w-5xl"><Media item={item} large /></div>
              {items.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70"><CaretLeft size={18} aria-hidden /></button>
                  <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70"><CaretRight size={18} aria-hidden /></button>
                </>
              )}
            </div>
            {(item.prompt || item.model) && (
              <div className="border-t border-border px-5 py-3 text-[13px] text-fg-muted">
                {item.model && <span className="font-medium text-fg">{item.model}</span>}
                {item.model && item.prompt && <span className="mx-2 text-fg-subtle">/</span>}
                {item.prompt}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

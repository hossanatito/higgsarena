"use client";
import { useRef, useState, type DragEvent } from "react";
import { FilmStrip, ImageSquare, Plus, SpeakerHigh, X } from "@phosphor-icons/react";
import { ACCEPT_BY_KIND } from "@/lib/uploads";
import { cn } from "@/lib/cn";
import { uploadFile } from "./upload";

type Item = { url?: string; preview?: string; progress?: number; error?: string; name: string; key: string };

const kindOf = (k: string): "image" | "video" | "audio" => (k.startsWith("video") ? "video" : k.startsWith("audio") ? "audio" : "image");

/**
 * Drag and drop on desktop, tap to pick on mobile (camera roll and files).
 * Value is a URL (single) or URL[] (multiple).
 */
export function Dropzone({ id, kind, label, value, onChange, maxItems, maxMb, keySource, required, compact }: { id: string; kind: string; label: string; value: unknown; onChange: (v: unknown) => void; maxItems?: number; maxMb: number; keySource?: "org" | "personal"; required?: boolean; compact?: boolean }) {
  const multiple = kind.endsWith("s");
  const media = kindOf(kind);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const urls: string[] = multiple ? ((value as string[] | undefined) ?? []) : value ? [value as string] : [];
  const limit = multiple ? (maxItems ?? 10) : 1;
  const room = limit - urls.length - pending.filter((p) => !p.error).length;

  const add = async (files: File[]) => {
    setError(null);
    const take = files.slice(0, Math.max(0, multiple ? room : 1));
    if (files.length > take.length) setError(`You can add up to ${limit} file${limit === 1 ? "" : "s"} here.`);
    const items: Item[] = take.map((f) => ({ name: f.name, key: `${f.name}-${f.size}-${Math.random()}`, preview: media !== "audio" ? URL.createObjectURL(f) : undefined, progress: 0 }));
    setPending((p) => [...p, ...items]);
    const done: string[] = [];
    await Promise.all(
      take.map(async (file, i) => {
        const item = items[i]!;
        try {
          const { publicUrl } = await uploadFile(file, { maxMb, keySource, onProgress: (pr) => setPending((p) => p.map((x) => (x.key === item.key ? { ...x, progress: pr } : x))) });
          done.push(publicUrl);
          setPending((p) => p.filter((x) => x.key !== item.key));
        } catch (e) {
          setPending((p) => p.filter((x) => x.key !== item.key));
          setError(e instanceof Error ? e.message : "Upload failed.");
        } finally {
          if (item.preview) setTimeout(() => URL.revokeObjectURL(item.preview!), 60_000);
        }
      }),
    );
    if (done.length) onChange(multiple ? [...urls, ...done].slice(0, limit) : done[0]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add([...e.dataTransfer.files]);
  };
  const remove = (u: string) => onChange(multiple ? urls.filter((x) => x !== u) : undefined);
  const Icon = media === "video" ? FilmStrip : media === "audio" ? SpeakerHigh : ImageSquare;
  const tile = compact ? "h-16 w-16" : "h-20 w-20";

  return (
    <div>
      <span id={`${id}-label`} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
        {multiple && <span className="ml-1 font-normal text-fg-subtle">{urls.length}/{limit}</span>}
      </span>
      <div className="flex flex-wrap gap-2" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        {urls.map((u) => (
          <div key={u} className={cn("group relative overflow-hidden rounded-[10px] border border-border bg-surface-2", tile)}>
            {media === "image" ? <img src={u} alt="" className="h-full w-full object-cover" /> : media === "video" ? <video src={u} muted playsInline className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-fg-muted"><SpeakerHigh size={22} aria-hidden /></div>}
            <button type="button" onClick={() => remove(u)} aria-label="Remove file" className="absolute top-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white">
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.key} className={cn("relative overflow-hidden rounded-[10px] border border-border bg-surface-2", tile)} aria-label={`Uploading ${p.name}`}>
            {p.preview && media === "image" && <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />}
            <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/40">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round((p.progress ?? 0) * 100)}%` }} />
            </div>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            className={cn("flex flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed text-fg-muted transition-colors hover:border-accent-text hover:text-fg", over ? "border-accent-text bg-accent-soft" : "border-border-strong", tile)}
          >
            {urls.length ? <Plus size={20} aria-hidden /> : <Icon size={22} aria-hidden />}
            <span className="text-[11px]">{urls.length ? "Add" : "Upload"}</span>
          </button>
        )}
        <input ref={input} id={id} type="file" accept={ACCEPT_BY_KIND[kind]} multiple={multiple} className="sr-only" tabIndex={-1} onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      <p id={`${id}-hint`} className="sr-only">Up to {maxMb} MB per file.</p>
      {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

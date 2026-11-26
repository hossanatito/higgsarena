"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserFocus, CircleNotch } from "@phosphor-icons/react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice } from "@/components/ui";
import { Dropzone } from "@/components/studio/dropzone";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type C = { id: string; name: string; modelVersion: "v1" | "v2" | "cinema"; status: "not_ready" | "queued" | "in_progress" | "completed" | "failed"; thumbnailUrl: string | null; failReason: string | null; imageCount: number; createdAt: string };

const VERSIONS = [
  { id: "v1", label: "SOUL", model: "soul-standard" },
  { id: "v2", label: "SOUL V2", model: "soul-2" },
  { id: "cinema", label: "SOUL Cinema", model: "soul-cinema" },
] as const;

const STATUS_LABEL: Record<C["status"], { label: string; tone: "neutral" | "accent" | "ok" | "danger" }> = {
  not_ready: { label: "Preparing", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  in_progress: { label: "Training", tone: "accent" },
  completed: { label: "Ready", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export function CharactersView({ initial, enabled, maxUploadMb }: { initial: C[]; enabled: boolean; maxUploadMb: number }) {
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [version, setVersion] = useState<C["modelVersion"]>("v2");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const training = list.some((c) => ["not_ready", "queued", "in_progress"].includes(c.status));

  useEffect(() => {
    if (!training) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/characters", { cache: "no-store" });
      if (res.ok) setList((await res.json()).characters);
    }, 10_000);
    return () => clearInterval(t);
  }, [training]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, modelVersion: version, imageUrls: images }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not start training.");
    setList((l) => [data.character, ...l]);
    setName("");
    setImages([]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-5 lg:sticky lg:top-10">
        <h2 className="mb-4 text-[17px] font-semibold">Train a new character</h2>
        {!enabled ? (
          <Notice tone="warn">Soul ID training is turned off. An admin can enable it in Admin → Models.</Notice>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Field label="Name" htmlFor="char-name">
              <Input id="char-name" maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div>
              <p id="ver-label" className="mb-1.5 text-sm font-medium">Model</p>
              <div role="radiogroup" aria-labelledby="ver-label" className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
                {VERSIONS.map((v) => (
                  <button key={v.id} type="button" role="radio" aria-checked={version === v.id} onClick={() => setVersion(v.id)} className={cn("h-9 rounded-full px-2 text-[13px] font-medium whitespace-nowrap transition-colors", version === v.id ? "bg-[var(--seg-on)] text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>{v.label}</button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-fg-subtle">Characters work with the matching SOUL model only.</p>
            </div>
            <Dropzone id="char-images" kind="images" label="Reference photos (1 to 100)" value={images} onChange={(v) => setImages((v as string[]) ?? [])} maxItems={100} maxMb={maxUploadMb} required />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" variant="primary" disabled={busy || !name.trim() || images.length === 0}>{busy ? "Starting…" : "Start training"}</Button>
            <p className="text-[12px] text-fg-subtle">Use clear, well-lit photos of one person from several angles. Higgsfield limits how many characters train at once.</p>
          </form>
        )}
      </Card>
      <div>
        {list.length === 0 ? (
          <Card><EmptyState icon={<UserFocus size={28} />} title="No characters yet" body="Train one from reference photos. It shows up in the Character picker of SOUL models." /></Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((c) => {
              const st = STATUS_LABEL[c.status];
              const v = VERSIONS.find((x) => x.id === c.modelVersion)!;
              return (
                <li key={c.id} className="panel overflow-hidden">
                  <div className={cn("grid aspect-square place-items-center", c.status === "completed" ? "bg-surface-2" : "shimmer")}>
                    {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={`${c.name} character thumbnail`} className="h-full w-full object-cover" /> : c.status === "failed" ? <UserFocus size={32} className="text-fg-subtle" aria-hidden /> : <CircleNotch size={28} className="animate-spin text-accent-text" aria-hidden />}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-fg-subtle">{v.label} · {c.imageCount} photos · <time suppressHydrationWarning>{relativeTime(c.createdAt)}</time></p>
                    {c.failReason && <p className="mt-1.5 text-[12px] text-danger">{c.failReason}</p>}
                    {c.status === "completed" && <Link href={`/studio?model=${v.model}`} className="mt-2 inline-block text-[13px] text-accent-text hover:underline">Use in {v.label}</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

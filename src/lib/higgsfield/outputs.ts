import type { OutputFile } from "@/lib/db/schema";
import { insecureMediaOrigin } from "@/lib/env-check";

export const TERMINAL_STATUSES = ["completed", "failed", "nsfw", "canceled"] as const;
export type HfStatus = "queued" | "in_progress" | (typeof TERMINAL_STATUSES)[number];
export const isTerminal = (s: string): boolean => (TERMINAL_STATUSES as readonly string[]).includes(s);

type Media = { url?: unknown; content_type?: unknown } | string;

function allowed(u: string): boolean {
  if (u.startsWith("https://")) return true;
  const dev = insecureMediaOrigin();
  return !!dev && u.startsWith(`${dev}/`);
}

function toUrl(m: Media | undefined | null): { url: string; contentType?: string } | null {
  if (!m) return null;
  if (typeof m === "string") return allowed(m) ? { url: m } : null;
  if (typeof m.url === "string" && allowed(m.url)) {
    return { url: m.url, contentType: typeof m.content_type === "string" ? m.content_type : undefined };
  }
  return null;
}

const EXTRA_ARTIFACTS = ["zip", "mov", "jsx", "fbx", "ply"] as const;

/**
 * Normalise the output fields of a status response or a webhook `payload`
 * into a flat list. Only https URLs are kept.
 */
export function extractOutputs(body: Record<string, unknown> | null | undefined): OutputFile[] {
  if (!body) return [];
  const out: OutputFile[] = [];
  const push = (kind: OutputFile["kind"], m: Media | undefined | null, label?: string) => {
    const u = toUrl(m);
    if (u && !out.some((o) => o.url === u.url)) out.push({ kind, url: u.url, contentType: u.contentType, label });
  };
  if (Array.isArray(body.images)) for (const m of body.images as Media[]) push("image", m);
  if (body.image) push("image", body.image as Media);
  if (body.video) push("video", body.video as Media);
  if (Array.isArray(body.videos)) for (const m of body.videos as Media[]) push("video", m);
  if (body.audio) push("audio", body.audio as Media);
  if (Array.isArray(body.audios)) for (const m of body.audios as Media[]) push("audio", m);
  for (const key of EXTRA_ARTIFACTS) {
    const v = body[key];
    if (Array.isArray(v)) for (const m of v as Media[]) push("file", m, key.toUpperCase());
    else if (v) push("file", v as Media, key.toUpperCase());
  }
  return out;
}

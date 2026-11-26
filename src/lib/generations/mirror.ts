import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, type OutputFile } from "@/lib/db/schema";
import { deleteFromStorage, mirrorToStorage, storageClient, storageUrl } from "@/lib/storage/s3";
import type { Generation } from "./service";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function extFor(o: OutputFile): string {
  if (o.contentType && EXT[o.contentType]) return EXT[o.contentType]!;
  const m = new URL(o.url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1]!.toLowerCase() : o.kind === "video" ? "mp4" : o.kind === "image" ? "png" : "bin";
}

/** Copy outputs of a completed job to S3 / R2 so they outlive Higgsfield's 7 days. */
export async function mirrorGeneration(row: Generation): Promise<boolean> {
  if (row.status !== "completed" || row.mirroredAt || !row.outputs.length) return false;
  const ready = await storageClient();
  if (!ready) return false;
  const d = row.createdAt;
  const outputs: OutputFile[] = [];
  for (const [i, o] of row.outputs.entries()) {
    if (o.storageKey) {
      outputs.push(o);
      continue;
    }
    const key = `generations/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${row.id}/${i}.${extFor(o)}`;
    await mirrorToStorage(ready, o.url, key, o.contentType);
    outputs.push({ ...o, storageKey: key });
  }
  await db
    .update(generation)
    .set({ outputs, mirroredAt: new Date() })
    .where(and(eq(generation.id, row.id), isNull(generation.mirroredAt)));
  return true;
}

/** Remove mirrored copies of a generation's outputs from the bucket. */
export async function deleteMirrored(row: Generation) {
  const keys = row.outputs.map((o) => o.storageKey).filter((k): k is string => !!k);
  if (!keys.length) return;
  const ready = await storageClient();
  if (!ready) return;
  await Promise.allSettled(keys.map((k) => deleteFromStorage(ready, k)));
}

export type DisplayOutput = OutputFile & { displayUrl: string };

/** Resolve the URL the browser should load: the mirror when present, else Higgsfield. */
export async function withDisplayUrls<T extends Pick<Generation, "outputs">>(rows: T[]): Promise<(Omit<T, "outputs"> & { outputs: DisplayOutput[] })[]> {
  const needsStorage = rows.some((r) => r.outputs.some((o) => o.storageKey));
  const ready = needsStorage ? await storageClient() : null;
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      outputs: await Promise.all(
        r.outputs.map(async (o) => ({
          ...o,
          displayUrl: o.storageKey && ready ? await storageUrl(ready, o.storageKey) : o.url,
        })),
      ),
    })),
  );
}

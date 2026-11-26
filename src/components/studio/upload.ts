"use client";
import { UPLOAD_TYPES } from "@/lib/uploads";

export type UploadResult = { publicUrl: string };

/**
 * 1. Ask HiggsArena for a presigned URL (size checked before the upload starts).
 * 2. PUT the file straight to storage with the returned headers.
 *    Higgsfield credentials are never sent from the browser.
 */
export async function uploadFile(file: File, opts: { maxMb: number; keySource?: "org" | "personal"; onProgress?: (p: number) => void }): Promise<UploadResult> {
  let type = file.type;
  if (type === "image/jpg") type = "image/jpeg";
  if (!(UPLOAD_TYPES as readonly string[]).includes(type)) throw new Error("That file type isn't supported. Use JPEG, PNG, WebP, GIF, WAV or MP4.");
  if (file.size > opts.maxMb * 1024 * 1024) throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The upload limit is ${opts.maxMb} MB.`);
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: type, size: file.size, keySource: opts.keySource }),
  });
  const data = (await res.json().catch(() => ({}))) as { uploadUrl?: string; uploadHeaders?: Record<string, string>; publicUrl?: string; error?: string };
  if (!res.ok || !data.uploadUrl || !data.publicUrl) throw new Error(data.error ?? "Could not start the upload.");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.uploadUrl!);
    for (const [k, v] of Object.entries(data.uploadHeaders ?? { "Content-Type": type })) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
  return { publicUrl: data.publicUrl };
}

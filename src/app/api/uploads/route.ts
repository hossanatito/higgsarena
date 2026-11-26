import { z } from "zod";
import { json, route } from "@/lib/api";
import { apiContext, ApiError } from "@/lib/session";
import { hitRateLimit, LIMITS } from "@/lib/rate-limit";
import { clientFor } from "@/lib/credentials";
import { effectiveFor } from "@/lib/policy/load";
import { resolveCredential } from "@/lib/generations/service";
import { DEFAULT_MAX_UPLOAD_MB, UPLOAD_TYPES } from "@/lib/uploads";

export const dynamic = "force-dynamic";


const Body = z.object({
  contentType: z.enum(UPLOAD_TYPES),
  size: z.number().int().positive(),
  keySource: z.enum(["org", "personal"]).optional(),
});

/**
 * Issues a presigned upload URL. The browser uploads straight to it with the
 * returned headers; Higgsfield credentials never leave the server.
 */
export const POST = route(async (req) => {
  const ctx = await apiContext();
  const rl = await hitRateLimit(`upl:${ctx.user.id}`, LIMITS.upload.limit, LIMITS.upload.window);
  if (!rl.ok) throw new ApiError(429, "Too many uploads at once. Try again shortly.");
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    if (raw && typeof raw === "object" && "contentType" in raw) {
      throw new ApiError(415, "That file type isn't supported. Use JPEG, PNG, WebP, GIF, WAV or MP4.");
    }
    throw new ApiError(400, "Invalid upload request.");
  }
  const eff = await effectiveFor(ctx);
  if (eff.paused) throw new ApiError(403, "Generation is paused by an admin.");
  const maxMb = eff.maxUploadMb?.value ?? DEFAULT_MAX_UPLOAD_MB;
  if (parsed.data.size > maxMb * 1024 * 1024) {
    throw new ApiError(413, `That file is ${(parsed.data.size / 1024 / 1024).toFixed(1)} MB. The upload limit is ${maxMb} MB.`, { maxMb });
  }
  const cred = await resolveCredential(ctx, parsed.data.keySource);
  if ("error" in cred) throw new ApiError(400, cred.error);
  const upload = await clientFor(cred.row).generateUploadUrl(parsed.data.contentType);
  return json({ uploadUrl: upload.uploadUrl, uploadHeaders: upload.uploadHeaders, publicUrl: upload.publicUrl, maxMb });
});

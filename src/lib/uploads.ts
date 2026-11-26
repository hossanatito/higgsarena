/** Same allow-list as Higgsfield's file uploads. Safe to import in the browser. */
export const UPLOAD_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "audio/wav", "audio/x-wav", "video/mp4"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const DEFAULT_MAX_UPLOAD_MB = 50;

export const ACCEPT_BY_KIND: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  images: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4",
  videos: "video/mp4",
  audio: "audio/wav,audio/x-wav",
  audios: "audio/wav,audio/x-wav",
};

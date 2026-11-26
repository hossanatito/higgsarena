import { Webhook } from "standardwebhooks";
import { z } from "zod";

export const WebhookEnvelope = z.object({
  request_id: z.string().min(1).max(200),
  status: z.enum(["completed", "failed", "nsfw", "canceled"]),
  error: z.string().nullish(),
  expires_at: z.string().nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
});
export type WebhookEnvelope = z.infer<typeof WebhookEnvelope>;

export type WebhookHeaders = { "webhook-id": string; "webhook-timestamp": string; "webhook-signature": string };

export type VerifyResult = { ok: true; id: string; envelope: WebhookEnvelope } | { ok: false; reason: string };

/**
 * Standard Webhooks verification on the raw body. The library rejects
 * timestamps more than 5 minutes from now. Every configured secret is tried,
 * since Higgsfield keeps the previous secret valid for 24h after rotation.
 */
export function verifyWebhook(raw: string, headers: WebhookHeaders, secrets: string[]): VerifyResult {
  if (!headers["webhook-id"] || !headers["webhook-timestamp"] || !headers["webhook-signature"]) return { ok: false, reason: "missing signature headers" };
  if (!secrets.length) return { ok: false, reason: "no webhook secret configured" };
  let verified = false;
  for (const secret of secrets) {
    try {
      new Webhook(secret).verify(raw, headers);
      verified = true;
      break;
    } catch {
      // try the next secret
    }
  }
  if (!verified) return { ok: false, reason: "signature or timestamp invalid" };
  try {
    return { ok: true, id: headers["webhook-id"], envelope: WebhookEnvelope.parse(JSON.parse(raw)) };
  } catch {
    return { ok: false, reason: "body does not match the documented envelope" };
  }
}

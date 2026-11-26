import { db } from "@/lib/db";
import { webhookEvent } from "@/lib/db/schema";
import { webhookSecrets } from "@/lib/credentials";
import { extractOutputs } from "@/lib/higgsfield/outputs";
import { verifyWebhook } from "@/lib/higgsfield/webhook";
import { finalizeGeneration } from "@/lib/generations/service";
import { getOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * Higgsfield webhook receiver (Standard Webhooks).
 * - signature checked on the raw body against every configured secret
 * - deliveries signed more than 5 minutes ago are rejected (replays)
 * - deduplicated on webhook-id; a valid duplicate is acknowledged and ignored
 * Polling stays on as a fallback, so a rejected delivery never loses a job.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response(null, { status: 400 });
  const org = await getOrg();
  const result = verifyWebhook(
    raw,
    {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    },
    await webhookSecrets(org.id),
  );
  if (!result.ok) {
    console.warn(`[webhook] rejected: ${result.reason}`);
    return new Response(null, { status: 400 });
  }
  const { envelope } = result;
  const inserted = await db.insert(webhookEvent).values({ id: result.id, requestId: envelope.request_id }).onConflictDoNothing().returning();
  if (!inserted.length) return Response.json({ ok: true, duplicate: true });

  await finalizeGeneration(envelope.request_id, {
    status: envelope.status,
    outputs: extractOutputs(envelope.payload ?? null),
    error: envelope.error ?? undefined,
    expiresAt: envelope.expires_at ? new Date(envelope.expires_at) : undefined,
  });
  return Response.json({ ok: true });
}

import { safeEqual } from "@/lib/crypto/vault";
import { runSweep } from "@/lib/generations/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Called every minute by the cron container: `Authorization: Bearer $CRON_SECRET`. */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const report = await runSweep();
  return Response.json({ ok: true, ...report });
}

export const GET = handler;
export const POST = handler;

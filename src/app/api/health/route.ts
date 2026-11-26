import { pingDb } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Public uptime check. Detailed checks live in Admin → Settings → Health. */
export async function GET() {
  try {
    await pingDb();
    return Response.json({ status: "ok", version: APP_VERSION }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "error", version: APP_VERSION, database: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

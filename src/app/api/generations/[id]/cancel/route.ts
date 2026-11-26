import { json, route } from "@/lib/api";
import { apiContext } from "@/lib/session";
import { loadGeneration, toClient } from "@/lib/generations/access";
import { withDisplayUrls } from "@/lib/generations/mirror";
import { cancelGeneration } from "@/lib/generations/service";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await apiContext();
  const { id } = await params;
  const row = await loadGeneration(ctx, id, { write: true });
  const result = await cancelGeneration(row);
  const [out] = await withDisplayUrls([result.row]);
  return json({ ok: result.ok, error: result.message, generation: toClient(out!, ctx) }, { status: result.ok ? 200 : 409 });
});

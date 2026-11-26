/**
 * A local stand-in for the Higgsfield API, for development and end-to-end
 * tests without spending credits. Never use it in production.
 *
 *   pnpm mock:higgsfield            (listens on http://127.0.0.1:4010)
 *   HF_API_BASE_URL=http://127.0.0.1:4010 pnpm dev
 *
 * Behaviour:
 *  - any key works except a secret of "bad" (401) or "broke" (403)
 *  - jobs go queued → in_progress → completed in about 6 seconds
 *  - a prompt containing "fail" fails, "nsfw" is moderated
 *  - with MOCK_WEBHOOK_SECRET=whsec_… and an hf_webhook param, a signed
 *    Standard Webhooks delivery is sent when the job finishes
 */
import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Webhook } from "standardwebhooks";
import seed from "../src/lib/catalog/seed-catalog.json";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const BASE = `http://127.0.0.1:${PORT}`;
const WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET;
const TICK = Number(process.env.MOCK_SPEED_MS ?? 2000);

const outputTypeByEndpoint = new Map((seed as { models: { endpoint: string; outputType: string }[] }).models.map((m) => [m.endpoint, m.outputType]));

type Job = { id: string; endpoint: string; params: Record<string, unknown>; created: number; canceled?: boolean; deleted?: boolean; webhook?: string; delivered?: boolean };
const jobs = new Map<string, Job>();
const byIdempotency = new Map<string, string>();
const files = new Map<string, { type: string; body: Buffer }>();
const characters = new Map<string, { id: string; name: string; model_version: string; created: number }>();

let mp4: Buffer | null = null;
function sampleVideo(): Buffer | null {
  if (mp4) return mp4;
  try {
    const dir = mkdtempSync(path.join(tmpdir(), "mockhf-"));
    const out = path.join(dir, "v.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    if (existsSync(out)) mp4 = readFileSync(out);
  } catch {
    mp4 = null;
  }
  return mp4;
}

function svg(seedText: string, w: number, h: number): string {
  let hash = 0;
  for (const c of seedText) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360},70%,25%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${Math.min(w, h) * 0.18}" fill="rgba(255,255,255,0.35)"/></svg>`;
}

function dims(ar: unknown): [number, number] {
  const m = typeof ar === "string" ? ar.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/) : null;
  if (!m) return [768, 768];
  const r = Number(m[1]) / Number(m[2]);
  return r >= 1 ? [960, Math.round(960 / r)] : [Math.round(960 * r), 960];
}

function state(j: Job): { status: string; body: Record<string, unknown> } {
  if (j.canceled) return { status: "canceled", body: {} };
  const age = Date.now() - j.created;
  if (age < TICK) return { status: "queued", body: {} };
  if (age < TICK * 3) return { status: "in_progress", body: {} };
  const prompt = String(j.params.prompt ?? "");
  if (/\bfail\b/i.test(prompt)) return { status: "failed", body: { error: "Mock generation failed" } };
  if (/\bnsfw\b/i.test(prompt)) return { status: "nsfw", body: {} };
  const type = outputTypeByEndpoint.get(j.endpoint) ?? (/video/.test(j.endpoint) ? "video" : "image");
  const expires_at = new Date(j.created + 7 * 86400_000).toISOString();
  if (type === "video") return { status: "completed", body: { expires_at, video: { url: `${BASE}/out/${j.id}/0.mp4`, content_type: "video/mp4" } } };
  const n = Number(j.params.batch_size ?? j.params.num_images ?? 1) || 1;
  return { status: "completed", body: { expires_at, images: Array.from({ length: Math.min(8, n) }, (_, i) => ({ url: `${BASE}/out/${j.id}/${i}.svg`, content_type: "image/svg+xml" })) } };
}

function estimate(endpoint: string, p: Record<string, unknown>): string {
  const type = outputTypeByEndpoint.get(endpoint) ?? "image";
  if (type === "video") {
    const d = Number(p.duration ?? 5) || 5;
    return (0.06 * d * (String(p.resolution ?? "").includes("1080") ? 1.6 : 1)).toFixed(3);
  }
  const n = Number(p.batch_size ?? 1) || 1;
  return (0.03 * n * (String(p.resolution ?? "").match(/1080|2k|4k/) ? 1.5 : 1)).toFixed(3);
}

const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", "x-correlation-id": `mock-${Math.random().toString(36).slice(2, 10)}`, ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function deliverWebhooks() {
  if (!WEBHOOK_SECRET) return;
  const wh = new Webhook(WEBHOOK_SECRET);
  for (const j of jobs.values()) {
    if (!j.webhook || j.delivered || j.canceled) continue;
    const s = state(j);
    if (!["completed", "failed", "nsfw"].includes(s.status)) continue;
    j.delivered = true;
    const payload = JSON.stringify({ request_id: j.id, status: s.status, error: (s.body.error as string) ?? null, expires_at: s.body.expires_at ?? null, payload: s.status === "completed" ? { ...s.body, expires_at: undefined } : null });
    const id = `msg_${j.id}`;
    const ts = new Date();
    const signature = wh.sign(id, ts, payload);
    try {
      const r = await fetch(j.webhook, { method: "POST", headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)), "webhook-signature": signature }, body: payload });
      console.log(`[mock] webhook ${j.id} → ${r.status}`);
    } catch (e) {
      console.log(`[mock] webhook ${j.id} failed: ${(e as Error).message}`);
    }
  }
}
setInterval(deliverWebhooks, 500);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE);
  const p = url.pathname;
  // Public file routes (no auth), like a CDN / presigned storage.
  if (req.method === "PUT" && p.startsWith("/upload/")) {
    files.set(p.slice(8), { type: req.headers["content-type"] ?? "application/octet-stream", body: await readBody(req) });
    res.writeHead(200, { "access-control-allow-origin": "*" });
    return res.end();
  }
  if (req.method === "OPTIONS" && p.startsWith("/upload/")) {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "PUT", "access-control-allow-headers": "content-type, x-amz-tagging" });
    return res.end();
  }
  if (req.method === "GET" && p.startsWith("/files/")) {
    const f = files.get(p.slice(7));
    if (!f) return send(res, 404, { detail: "Not found" });
    res.writeHead(200, { "content-type": f.type });
    return res.end(f.body);
  }
  if (req.method === "GET" && p.startsWith("/out/")) {
    const [, , id, file] = p.split("/");
    const j = jobs.get(id ?? "");
    if (!j || j.deleted) return send(res, 404, { detail: "Not found" });
    if (file?.endsWith(".mp4")) {
      const v = sampleVideo();
      if (!v) return send(res, 404, { detail: "ffmpeg not installed; no sample video" });
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(v.length) });
      return res.end(v);
    }
    const [w, h] = dims(j.params.aspect_ratio);
    res.writeHead(200, { "content-type": "image/svg+xml" });
    return res.end(svg(`${String(j.params.prompt ?? "HiggsArena")} #${file}`, w, h));
  }
  if (req.method === "GET" && p.startsWith("/chars/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    return res.end(svg(p, 512, 512));
  }

  const auth = req.headers.authorization ?? "";
  const m = auth.match(/^Key ([^:]+):(.+)$/);
  if (!m) return send(res, 401, { detail: "Invalid credentials" });
  if (m[2] === "bad") return send(res, 401, { detail: "Invalid credentials" });
  if (m[2] === "broke") return send(res, 403, { detail: "Insufficient balance" });

  const raw = req.method === "POST" || req.method === "PUT" ? await readBody(req) : Buffer.alloc(0);
  let body: Record<string, unknown> = {};
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch {
    return send(res, 422, { detail: "Invalid JSON" });
  }

  if (req.method === "POST" && p.startsWith("/estimate/")) return send(res, 200, { usd: estimate(p.slice(10), body) });
  if (req.method === "POST" && p === "/files/generate-upload-url") {
    const id = crypto.randomUUID();
    const type = String(body.content_type ?? "image/jpeg");
    return send(res, 200, { public_url: `${BASE}/files/${id}`, upload_url: `${BASE}/upload/${id}`, content_type: type, upload_headers: { "Content-Type": type } });
  }
  if (p === "/v1/custom-references" && req.method === "POST") {
    const id = crypto.randomUUID();
    characters.set(id, { id, name: String(body.name), model_version: String(body.model_version ?? "v1"), created: Date.now() });
    return send(res, 200, { id, name: body.name, model_version: body.model_version ?? "v1", status: "queued", thumbnail_url: null });
  }
  if (p.startsWith("/v1/custom-references/") && req.method === "GET") {
    const c = characters.get(p.split("/")[3] ?? "");
    if (!c) return send(res, 404, { detail: "Not found" });
    const age = Date.now() - c.created;
    const status = age < TICK ? "queued" : age < TICK * 4 ? "in_progress" : "completed";
    return send(res, 200, { ...c, status, thumbnail_url: status === "completed" ? `${BASE}/chars/${c.id}.svg` : null, fail_reason: null });
  }
  if (p.startsWith("/v1/text2image/soul-styles")) return send(res, 200, [{ id: "3db34ab5-3439-4317-9e03-08dc30852e69", name: "General", description: "Default style" }]);

  const reqMatch = p.match(/^\/requests\/([^/]+)(\/status|\/cancel)?$/);
  if (reqMatch) {
    const j = jobs.get(reqMatch[1]!);
    if (!j) return send(res, 404, { detail: "Not found" });
    if (reqMatch[2] === "/status" && req.method === "GET") {
      const s = state(j);
      return send(res, 200, { status: s.status, request_id: j.id, ...(j.deleted ? {} : s.body) });
    }
    if (reqMatch[2] === "/cancel" && req.method === "POST") {
      if (state(j).status !== "queued") return send(res, 400, { detail: "Request is already processing" });
      j.canceled = true;
      return send(res, 202);
    }
    if (!reqMatch[2] && req.method === "DELETE") {
      if (["queued", "in_progress"].includes(state(j).status)) return send(res, 409, { detail: "Request is still running" });
      j.deleted = true;
      return send(res, 200, { request_id: j.id, status: "deleted" });
    }
  }

  if (req.method === "POST") {
    const endpoint = p.slice(1);
    if (!outputTypeByEndpoint.has(endpoint) && !endpoint.startsWith("custom")) return send(res, 404, { detail: "Model not found" });
    const key = req.headers["idempotency-key"];
    if (typeof key === "string" && byIdempotency.has(key)) {
      const j = jobs.get(byIdempotency.get(key)!)!;
      return send(res, 200, { status: state(j).status, request_id: j.id, status_url: `${BASE}/requests/${j.id}/status`, cancel_url: `${BASE}/requests/${j.id}/cancel` });
    }
    const id = crypto.randomUUID();
    jobs.set(id, { id, endpoint, params: body, created: Date.now(), webhook: url.searchParams.get("hf_webhook") ?? undefined });
    if (typeof key === "string") byIdempotency.set(key, id);
    return send(res, 200, { status: "queued", request_id: id, status_url: `${BASE}/requests/${id}/status`, cancel_url: `${BASE}/requests/${id}/cancel`, expires_after: Number(req.headers["hf-expires-after"] ?? 604800) });
  }
  send(res, 404, { detail: "Not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`[mock] Higgsfield mock API on ${BASE}${WEBHOOK_SECRET ? " (signed webhooks on)" : ""}`));

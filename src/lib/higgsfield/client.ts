import "server-only";
import { HiggsfieldError } from "./errors";
import { extractOutputs, type HfStatus } from "./outputs";
import type { OutputFile } from "@/lib/db/schema";

export type HfCredentials = { id: string; secret: string };

export type SubmitResult = {
  requestId: string;
  status: HfStatus;
  expiresAfter?: number;
  correlationId?: string;
};

export type StatusResult = {
  status: HfStatus;
  outputs: OutputFile[];
  error?: string;
  expiresAt?: Date;
  correlationId?: string;
};

export type CharacterResult = {
  id: string;
  name: string;
  modelVersion: string;
  status: "not_ready" | "queued" | "in_progress" | "completed" | "failed";
  thumbnailUrl?: string;
  failReason?: string;
};

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** Total attempts for retryable failures. */
  attempts?: number;
  /** Longest Retry-After we are willing to wait inline, in seconds. */
  maxInlineWait?: number;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base / 2 + Math.random() * base;

/** Very small semaphore so the app never floods the Higgsfield queue. */
class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(public limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.active >= this.limit) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

const globalSem = globalThis as unknown as { __hfSubmitSem?: Semaphore };
export function submitSemaphore(limit: number): Semaphore {
  globalSem.__hfSubmitSem ??= new Semaphore(limit);
  globalSem.__hfSubmitSem.limit = Math.max(1, limit);
  return globalSem.__hfSubmitSem;
}

export class HiggsfieldClient {
  constructor(
    private readonly creds: HfCredentials,
    private readonly baseUrl = process.env.HF_API_BASE_URL || "https://api.higgsfield.ai",
  ) {
    if (!creds.id || !creds.secret) throw new Error("Higgsfield credentials are incomplete");
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; correlationId?: string; status: number }> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/");
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const attempts = opts.attempts ?? 3;
    let lastError: HiggsfieldError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: opts.method ?? "GET",
          headers: {
            Authorization: `Key ${this.creds.id}:${this.creds.secret}`,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...opts.headers,
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
          cache: "no-store",
        });
      } catch {
        lastError = new HiggsfieldError({ status: 0, code: "network" });
        if (attempt < attempts) {
          await sleep(jitter(500 * 2 ** attempt));
          continue;
        }
        throw lastError;
      }
      const correlationId = res.headers.get("x-correlation-id") ?? undefined;
      const text = await res.text();
      let json: unknown = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      if (res.ok) return { data: json as T, correlationId, status: res.status };
      const retryAfterHeader = Number(res.headers.get("retry-after"));
      const detail = (json as { detail?: unknown } | undefined)?.detail ?? (text ? text.slice(0, 300) : undefined);
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
      lastError = new HiggsfieldError({ status: res.status, detail, retryAfterSeconds, correlationId });
      if (!lastError.retryable || lastError.code === "model_blocked" || attempt >= attempts) throw lastError;
      const wait = retryAfterSeconds ?? jitter(2 ** attempt);
      if (wait > (opts.maxInlineWait ?? 8)) throw lastError;
      await sleep(wait * 1000);
    }
    throw lastError ?? new HiggsfieldError({ status: 0, code: "unknown" });
  }

  /** POST /{model}. Always sends an Idempotency-Key so retries never double-charge. */
  async submit(
    endpoint: string,
    params: Record<string, unknown>,
    opts: { idempotencyKey: string; webhookUrl?: string; expiresAfterSeconds?: number },
  ): Promise<SubmitResult> {
    const headers: Record<string, string> = { "Idempotency-Key": opts.idempotencyKey };
    if (opts.expiresAfterSeconds) headers["Hf-Expires-After"] = String(Math.max(3600, Math.round(opts.expiresAfterSeconds)));
    const { data, correlationId } = await this.request<{ request_id: string; status: HfStatus; expires_after?: number }>(endpoint, {
      method: "POST",
      body: params,
      headers,
      query: opts.webhookUrl ? { hf_webhook: opts.webhookUrl } : undefined,
    });
    if (!data?.request_id) throw new HiggsfieldError({ status: 502, code: "unknown", correlationId });
    return { requestId: data.request_id, status: data.status ?? "queued", expiresAfter: data.expires_after, correlationId };
  }

  async status(requestId: string): Promise<StatusResult> {
    const { data, correlationId } = await this.request<Record<string, unknown>>(`requests/${encodeURIComponent(requestId)}/status`);
    return {
      status: (data.status as HfStatus) ?? "queued",
      outputs: extractOutputs(data),
      error: typeof data.error === "string" ? data.error : undefined,
      expiresAt: typeof data.expires_at === "string" ? new Date(data.expires_at) : undefined,
      correlationId,
    };
  }

  /** Returns true on 202. Higgsfield answers 400 once processing has started. */
  async cancel(requestId: string): Promise<boolean> {
    try {
      await this.request(`requests/${encodeURIComponent(requestId)}/cancel`, { method: "POST", attempts: 2 });
      return true;
    } catch (e) {
      if (e instanceof HiggsfieldError && e.status === 400) return false;
      throw e;
    }
  }

  async deleteRequest(requestId: string): Promise<void> {
    try {
      await this.request(`requests/${encodeURIComponent(requestId)}`, { method: "DELETE", attempts: 2 });
    } catch (e) {
      if (e instanceof HiggsfieldError && e.status === 404) return;
      throw e;
    }
  }

  /** POST /estimate/{model} with the same params. */
  async estimate(endpoint: string, params: Record<string, unknown>): Promise<string> {
    const { data } = await this.request<{ usd?: string | number }>(`estimate/${endpoint.replace(/^\//, "")}`, {
      method: "POST",
      body: params,
      attempts: 2,
      timeoutMs: 15_000,
    });
    if (data?.usd === undefined || data.usd === null || Number.isNaN(Number(data.usd))) {
      throw new HiggsfieldError({ status: 502, code: "unknown" });
    }
    return String(data.usd);
  }

  async generateUploadUrl(contentType: string): Promise<{ uploadUrl: string; uploadHeaders: Record<string, string>; publicUrl: string }> {
    const { data } = await this.request<{ upload_url: string; upload_headers?: Record<string, string>; public_url: string }>(
      "files/generate-upload-url",
      { method: "POST", body: { content_type: contentType } },
    );
    return { uploadUrl: data.upload_url, uploadHeaders: data.upload_headers ?? { "Content-Type": contentType }, publicUrl: data.public_url };
  }

  async createCharacter(input: { name: string; modelVersion: "v1" | "v2" | "cinema"; imageUrls: string[] }): Promise<CharacterResult> {
    const { data } = await this.request<Record<string, unknown>>("v1/custom-references", {
      method: "POST",
      body: {
        name: input.name,
        model_version: input.modelVersion,
        input_images: input.imageUrls.map((u) => ({ type: "image_url", image_url: u })),
      },
      attempts: 1,
    });
    return normaliseCharacter(data);
  }

  async getCharacter(id: string): Promise<CharacterResult> {
    const { data } = await this.request<Record<string, unknown>>(`v1/custom-references/${encodeURIComponent(id)}`);
    return normaliseCharacter(data);
  }

  async soulStyles(version: "v1" | "v2" = "v2"): Promise<{ id: string; name: string; description?: string; preview_url?: string }[]> {
    const path = version === "v2" ? "v1/text2image/soul-styles/v2" : "v1/text2image/soul-styles";
    const { data } = await this.request<{ id: string; name: string; description?: string; preview_url?: string }[]>(path, { attempts: 2 });
    return Array.isArray(data) ? data : [];
  }

  /** Cheap authenticated call used by "Test key": an estimate never charges. */
  async verify(): Promise<{ ok: true; sampleEstimateUsd: string }> {
    const usd = await this.estimate("z-image/turbo", { prompt: "HiggsArena key check" });
    return { ok: true, sampleEstimateUsd: usd };
  }
}

function normaliseCharacter(d: Record<string, unknown>): CharacterResult {
  return {
    id: String(d.id),
    name: String(d.name ?? ""),
    modelVersion: String(d.model_version ?? "v1"),
    status: (d.status as CharacterResult["status"]) ?? "not_ready",
    thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : undefined,
    failReason: typeof d.fail_reason === "string" ? d.fail_reason : undefined,
  };
}

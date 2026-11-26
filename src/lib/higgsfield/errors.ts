export type HiggsfieldErrorCode =
  | "bad_request"
  | "unauthorized"
  | "insufficient_balance"
  | "not_found"
  | "conflict"
  | "validation"
  | "model_blocked"
  | "rate_limited"
  | "server_error"
  | "unavailable"
  | "network"
  | "unknown";

const BY_STATUS: Record<number, HiggsfieldErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "insufficient_balance",
  404: "not_found",
  409: "conflict",
  422: "validation",
  423: "model_blocked",
  429: "rate_limited",
  500: "server_error",
  503: "unavailable",
};

const MESSAGES: Record<HiggsfieldErrorCode, string> = {
  bad_request: "Higgsfield rejected the request. Check the inputs and try again.",
  unauthorized: "The Higgsfield API key is missing or invalid. An admin needs to check Admin → API keys.",
  insufficient_balance: "The Higgsfield account has insufficient balance, or the key is disabled. Top up in the Higgsfield Console.",
  not_found: "Higgsfield could not find that model or request for this account.",
  conflict: "That request is still running on Higgsfield. Try again once it finishes.",
  validation: "Higgsfield could not validate these settings.",
  model_blocked: "This model is temporarily blocked by Higgsfield. Try again later.",
  rate_limited: "The Higgsfield queue is full right now. HiggsArena will retry automatically.",
  server_error: "Higgsfield had an unexpected error. HiggsArena will retry.",
  unavailable: "The model is not available right now. Try again shortly.",
  network: "Could not reach Higgsfield. Check the server's network connection.",
  unknown: "Higgsfield returned an unexpected response.",
};

export class HiggsfieldError extends Error {
  readonly code: HiggsfieldErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly correlationId?: string;
  /** Raw `detail` from Higgsfield, for logs only. Never contains credentials. */
  readonly detail?: unknown;

  constructor(opts: {
    status: number;
    detail?: unknown;
    retryAfterSeconds?: number;
    correlationId?: string;
    code?: HiggsfieldErrorCode;
  }) {
    const code = opts.code ?? BY_STATUS[opts.status] ?? (opts.status >= 500 ? "server_error" : "unknown");
    super(HiggsfieldError.describe(code, opts.detail));
    this.name = "HiggsfieldError";
    this.code = code;
    this.status = opts.status;
    this.detail = opts.detail;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.correlationId = opts.correlationId;
    this.retryable = ["rate_limited", "server_error", "unavailable", "network", "model_blocked"].includes(code);
  }

  static describe(code: HiggsfieldErrorCode, detail: unknown): string {
    const base = MESSAGES[code];
    if ((code === "bad_request" || code === "validation") && detail) {
      const text = HiggsfieldError.detailText(detail);
      if (text) return `${base} (${text})`;
    }
    return base;
  }

  static detailText(detail: unknown): string | undefined {
    if (typeof detail === "string") return detail.slice(0, 300);
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          if (d && typeof d === "object" && "msg" in d) {
            const loc = Array.isArray((d as { loc?: unknown[] }).loc) ? (d as { loc: unknown[] }).loc.filter((x) => x !== "body").join(".") : "";
            return `${loc ? loc + ": " : ""}${String((d as { msg: unknown }).msg)}`;
          }
          return JSON.stringify(d);
        })
        .join("; ")
        .slice(0, 300);
    }
    if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: unknown }).message).slice(0, 300);
    return undefined;
  }
}

import { z } from "zod";
import type { FieldSpec } from "./types";

export type ValidateOptions = { allowHttpOrigin?: string | null };

function mediaUrl(opts: ValidateOptions) {
  return z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith("https://") || (!!opts.allowHttpOrigin && u.startsWith(`${opts.allowHttpOrigin}/`)), "Media must be an https:// URL");
}

function zodFor(f: FieldSpec, opts: ValidateOptions): z.ZodType {
  const httpsUrl = mediaUrl(opts);
  switch (f.kind) {
    case "prompt":
    case "text":
    case "textarea": {
      let s = z.string();
      if (f.maxLength) s = s.max(f.maxLength, `${f.label} must be at most ${f.maxLength} characters`);
      if (f.minLength && f.required) s = s.min(f.minLength, `${f.label} is required`);
      if (f.name.endsWith("_url")) return httpsUrl;
      return s;
    }
    case "integer":
    case "number": {
      let n = f.kind === "integer" ? z.coerce.number().int(`${f.label} must be a whole number`) : z.coerce.number();
      if (f.min !== undefined) n = n.min(f.min, `${f.label} must be at least ${f.min}`);
      if (f.max !== undefined) n = n.max(f.max, `${f.label} must be at most ${f.max}`);
      if (f.options?.length) return n.refine((v) => f.options!.includes(v), `${f.label} must be one of ${f.options.join(", ")}`);
      return n;
    }
    case "boolean":
      return z.boolean();
    case "select": {
      const opts = f.options ?? [];
      return z.union([z.string(), z.number()]).refine((v) => opts.some((o) => String(o) === String(v)), `${f.label} must be one of ${opts.join(", ")}`).transform((v) => opts.find((o) => String(o) === String(v))!);
    }
    case "image":
    case "video":
    case "audio":
      return httpsUrl;
    case "images":
    case "videos":
    case "audios":
    case "ids": {
      let a = z.array(f.kind === "ids" ? z.string().trim().min(1) : httpsUrl);
      if (f.maxItems !== undefined) a = a.max(f.maxItems, `${f.label}: at most ${f.maxItems}`);
      if (f.minItems !== undefined && f.minItems > 0) a = a.min(f.minItems, `${f.label}: at least ${f.minItems}`);
      return a;
    }
    case "character":
      return z.string().uuid("Pick a trained character");
    case "json":
      return z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
  }
}

export type ValidationResult =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Validate studio input against a catalog entry. Unknown fields are dropped,
 * empty optional values are omitted so Higgsfield applies its own defaults.
 */
export function validateParams(fields: FieldSpec[], input: Record<string, unknown>, opts: ValidateOptions = {}): ValidationResult {
  const params: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    let value = input[f.name];
    if (f.kind === "json" && typeof value === "string") {
      if (value.trim() === "") value = undefined;
      else {
        try {
          value = JSON.parse(value);
        } catch {
          errors[f.name] = `${f.label} must be valid JSON`;
          continue;
        }
      }
    }
    if ((f.kind === "integer" || f.kind === "number") && value === "") value = undefined;
    if (isEmpty(value)) {
      if (f.required) errors[f.name] = `${f.label} is required`;
      continue;
    }
    const parsed = zodFor(f, opts).safeParse(value);
    if (!parsed.success) {
      errors[f.name] = parsed.error.issues[0]?.message ?? `${f.label} is invalid`;
      continue;
    }
    params[f.name] = parsed.data;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, params };
}

/** Total requested video seconds, including multi-shot prompts. */
export function requestedDuration(params: Record<string, unknown>): number | undefined {
  const shots = params.multi_prompt;
  if (Array.isArray(shots) && shots.length && (params.multi_shots === true || params.multi_shots === undefined)) {
    const sum = shots.reduce<number>((acc, s) => acc + (Number((s as { duration?: unknown })?.duration) || 0), 0);
    if (sum > 0) return sum;
  }
  const d = params.duration;
  return d === undefined ? undefined : Number(d);
}

export function requestedBatch(params: Record<string, unknown>): number {
  for (const k of ["batch_size", "num_images", "n"]) {
    if (params[k] !== undefined) return Number(params[k]) || 1;
  }
  return 1;
}

export function promptOf(params: Record<string, unknown>): string | undefined {
  return typeof params.prompt === "string" ? params.prompt : undefined;
}

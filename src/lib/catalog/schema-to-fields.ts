import type { FieldGroup, FieldKind, FieldSpec } from "./types";

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  $defs?: Record<string, JsonSchema>;
  format?: string;
};

const ADVANCED = new Set([
  "seed",
  "negative_prompt",
  "cfg_scale",
  "aigc_watermark",
  "moderation",
  "bitrate_mode",
  "prompt_extend_mode",
  "output_format",
  "fps",
  "style_strength",
  "image_weight",
  "custom_reference_strength",
  "elements",
  "multi_prompt",
  "multi_shots",
  "colors",
  "background_color",
  "file_url",
  "link_url",
  "language",
]);

const LABELS: Record<string, string> = {
  image_url: "Image",
  image_urls: "Reference images",
  video_url: "Video",
  video_urls: "Reference videos",
  audio_url: "Audio",
  audio_urls: "Reference audio",
  end_image_url: "End frame",
  last_image_url: "Last frame",
  last_frame_url: "Last frame",
  first_frame_url: "First frame",
  image_reference_url: "Image reference",
  custom_reference_id: "Character",
  custom_reference_strength: "Character strength",
  cfg_scale: "CFG scale",
  aigc_watermark: "AI watermark",
  multi_prompt: "Multi-shot prompts",
  multi_shots: "Multi-shot",
  style_id: "Style ID",
  preset_id: "Preset ID",
  elements: "Kling element IDs",
  file_url: "Reference document URL",
  link_url: "Reference web page URL",
};

export function humanize(name: string): string {
  if (LABELS[name]) return LABELS[name];
  const s = name.replace(/_url(s)?$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resolve(s: JsonSchema, root: JsonSchema): JsonSchema {
  if (s.$ref?.startsWith("#/$defs/")) {
    const def = root.$defs?.[s.$ref.slice("#/$defs/".length)];
    if (def) return { ...def, ...s, $ref: undefined };
  }
  return s;
}

function baseType(s: JsonSchema): { type?: string; nullable: boolean; inner: JsonSchema } {
  if (s.anyOf?.length) {
    const nonNull = s.anyOf.filter((x) => x.type !== "null");
    const nullable = nonNull.length !== s.anyOf.length;
    const inner = { ...(nonNull[0] ?? {}), default: s.default, title: s.title, description: s.description };
    return { type: typeof inner.type === "string" ? inner.type : undefined, nullable, inner };
  }
  if (Array.isArray(s.type)) {
    const nonNull = s.type.filter((t) => t !== "null");
    return { type: nonNull[0], nullable: nonNull.length !== s.type.length, inner: s };
  }
  return { type: s.type, nullable: false, inner: s };
}

function kindFor(name: string, s: JsonSchema, root: JsonSchema): FieldKind {
  const { type, inner } = baseType(s);
  if (name === "prompt") return "prompt";
  if (name === "custom_reference_id") return "character";
  if (inner.enum) return "select";
  if (type === "boolean") return "boolean";
  if (type === "integer") return "integer";
  if (type === "number") return "number";
  if (type === "array") {
    const items = resolve(inner.items ?? {}, root);
    if (items.type === "string") {
      if (/image_urls$/.test(name)) return "images";
      if (/video_urls$/.test(name)) return "videos";
      if (/audio_urls$/.test(name)) return "audios";
      return "ids";
    }
    return "json";
  }
  if (type === "object") return "json";
  if (type === "string") {
    if (name === "file_url" || name === "link_url") return "text";
    if (/(image|frame|image_reference)_url$/.test(name)) return "image";
    if (/video_url$/.test(name)) return "video";
    if (/audio_url$/.test(name)) return "audio";
    if (name === "negative_prompt") return "textarea";
    if ((inner.maxLength ?? 0) > 400) return "textarea";
    return "text";
  }
  return "json";
}

function groupFor(name: string, kind: FieldKind): FieldGroup {
  if (kind === "prompt") return "main";
  if (["image", "images", "video", "videos", "audio", "audios", "character"].includes(kind)) return "main";
  if (ADVANCED.has(name) || kind === "json") return "advanced";
  return "settings";
}

/**
 * Turn a model's JSON input schema (as published in the Higgsfield docs)
 * into the field list the studio form renders.
 */
export function schemaToFields(schema: Record<string, unknown>): FieldSpec[] {
  const root = schema as JsonSchema;
  const props = root.properties ?? {};
  const required = new Set(root.required ?? []);
  const fields: FieldSpec[] = [];
  for (const [name, raw] of Object.entries(props)) {
    const s = resolve(raw, root);
    const { nullable, inner } = baseType(s);
    const kind = kindFor(name, s, root);
    const field: FieldSpec = {
      name,
      kind,
      label: humanize(name),
      group: groupFor(name, kind),
    };
    const description = inner.description ?? s.description;
    if (description && description !== "Write your prompt here") field.description = description;
    if (required.has(name)) field.required = true;
    if (nullable) field.nullable = true;
    const def = s.default ?? inner.default;
    if (def !== undefined && def !== null) field.default = def;
    if (inner.enum) field.options = inner.enum.filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    if (inner.minimum !== undefined) field.min = inner.minimum;
    if (inner.maximum !== undefined) field.max = inner.maximum;
    if (inner.multipleOf !== undefined) field.step = inner.multipleOf;
    if (inner.minItems !== undefined) field.minItems = inner.minItems;
    if (inner.maxItems !== undefined) field.maxItems = inner.maxItems;
    if (inner.minLength !== undefined) field.minLength = inner.minLength;
    if (inner.maxLength !== undefined) field.maxLength = inner.maxLength;
    fields.push(field);
  }
  const order: Record<FieldGroup, number> = { main: 0, settings: 1, advanced: 2 };
  const kindOrder = (k: FieldKind) => (k === "prompt" ? 0 : 1);
  return fields.sort((a, b) => order[a.group] - order[b.group] || kindOrder(a.kind) - kindOrder(b.kind));
}

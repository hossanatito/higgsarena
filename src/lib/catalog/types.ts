export type FieldKind =
  | "prompt"
  | "text"
  | "textarea"
  | "number"
  | "integer"
  | "boolean"
  | "select"
  | "image"
  | "images"
  | "video"
  | "videos"
  | "audio"
  | "audios"
  | "character"
  | "ids"
  | "json";

export type FieldGroup = "main" | "settings" | "advanced";

export type FieldSpec = {
  name: string;
  kind: FieldKind;
  label: string;
  group: FieldGroup;
  description?: string;
  required?: boolean;
  nullable?: boolean;
  default?: unknown;
  options?: (string | number)[];
  min?: number;
  max?: number;
  step?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
};

export type Category = "image" | "edit" | "video" | "motion" | "character";
export type OutputType = "image" | "video" | "audio" | "character";

/** One entry of the shipped seed catalog (src/lib/catalog/seed-catalog.json). */
export type SeedModel = {
  slug: string;
  name: string;
  family: string;
  workflow: string;
  provider: string;
  category: Category;
  mode: string;
  endpoint: string;
  outputType: OutputType;
  description?: string;
  notes?: string;
  inputSchema: Record<string, unknown>;
  docsUrl: string;
  verified: boolean;
  featured: boolean;
  sortOrder: number;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  image: "Image",
  edit: "Edit",
  video: "Video",
  motion: "Motion",
  character: "Characters",
};

export const UPLOAD_KINDS: FieldKind[] = ["image", "images", "video", "videos", "audio", "audios"];

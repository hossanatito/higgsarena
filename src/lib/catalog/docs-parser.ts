/**
 * Parses the Higgsfield documentation (Markdown pages published at
 * docs.higgsfield.ai) into seed catalog entries. Used by `pnpm catalog:pull`.
 * Pure functions: no network or filesystem access here.
 */
import type { Category, OutputType, SeedModel } from "./types";

export type FamilyListing = { slug: string; name: string; provider: string; kind: "Image" | "Video"; description: string };

const DOCS = "https://docs.higgsfield.ai/docs/models/";

/** Parse the cards on models/image-generation.md or models/video-generation.md. */
export function parseFamilyListing(md: string): FamilyListing[] {
  const out: FamilyListing[] = [];
  const re = /\[([A-Za-z0-9 ]+?)(Image|Video) · \d+ workflows?\n([^\n]+)\n([^\n]+)\nView API reference →\]\(https:\/\/docs\.higgsfield\.ai\/docs\/models\/([a-z0-9-]+)\.md\)/g;
  for (const m of md.matchAll(re)) {
    out.push({ provider: m[1]!.trim(), kind: m[2] as "Image" | "Video", name: m[3]!.trim(), description: m[4]!.trim(), slug: m[5]! });
  }
  return out;
}

/** Workflow links listed on a family page. */
export function parseFamilyWorkflows(md: string): { title: string; url: string; endpoint: string }[] {
  const re = /^\| \[([^\]]+)\]\((https:\/\/docs\.higgsfield\.ai\/docs\/models\/[^)]+\.md)\) \| `[A-Z]+ ([^`]+)`/gm;
  return [...md.matchAll(re)].map((m) => ({ title: m[1]!, url: m[2]!, endpoint: m[3]!.replace(/^\//, "") }));
}

const unescape = (s: string) => s.replace(/\\([_\[\]{}*\\])/g, "$1");

export type ParsedWorkflow = {
  title: string;
  endpoint: string;
  notes?: string;
  schema: Record<string, unknown>;
  outputs: string[];
};

export function parseWorkflowPage(md: string): ParsedWorkflow | null {
  const title = md.match(/^# (.+)$/m)?.[1]?.replace(/ API$/, "").trim();
  const endpoint = md.match(/\*\*Endpoint:\*\* `[A-Z]+ https:\/\/api\.higgsfield\.ai\/([^`]+)`/)?.[1];
  const schemaBlock = md.match(/> \[accordion\] Complete JSON schema\n>\n> ```json[^\n]*\n([\s\S]*?)\n> ```/)?.[1];
  if (!title || !endpoint || !schemaBlock) return null;
  const json = schemaBlock
    .split("\n")
    .map((l) => (l.startsWith("> ") ? l.slice(2) : l.slice(1)))
    .join("\n");
  const schema = JSON.parse(json) as Record<string, unknown>;
  const notes = md.match(/## Usage notes\n\n([\s\S]*?)\n\n## /)?.[1];
  let outputs: string[] = [];
  const completed = md.match(/A completed response includes the following output fields:\n\n```json[^\n]*\n([\s\S]*?)\n```/)?.[1];
  if (completed) {
    try {
      outputs = Object.keys(JSON.parse(completed)).filter((k) => k !== "status" && k !== "request_id");
    } catch {
      outputs = [];
    }
  }
  return { title, endpoint, notes: notes ? unescape(notes.trim()) : undefined, schema, outputs };
}

const FEATURED = new Set([
  "soul-2",
  "seedance-2-5-text-to-video",
  "seedance-2-5-image-to-video",
  "kling-3-pro-text-to-video",
  "kling-3-pro-image-to-video",
  "z-image-turbo",
  "ideogram-4",
  "qwen-image-3-edit",
  "cinema-studio-4",
  "kling-3-motion-control-pro",
  "soul-id-create-character",
]);

export function modeFor(workflowSlug: string, endpoint: string, category: Category, kind: "Image" | "Video" = "Image"): string {
  const s = `${workflowSlug} ${endpoint}`;
  if (category === "character") return "train";
  if (/video-edit|object-swap|restyle/.test(s)) return "edit";
  if (/video-extend/.test(s)) return "extend";
  if (/motion/.test(s)) return "motion";
  if (/first-last-frame/.test(s)) return "first-last-frame";
  if (/reference/.test(s)) return "reference";
  if (/image-to-video/.test(s)) return "image-to-video";
  if (/text-to-video/.test(s)) return "text-to-video";
  if (/\/edit$|edit/.test(s)) return "edit";
  return kind === "Video" ? "text-to-video" : "text-to-image";
}

export function categoryFor(familySlug: string, workflowSlug: string, endpoint: string, kind: "Image" | "Video"): Category {
  if (familySlug === "soul-id") return "character";
  if (/motion-control|motion-transfer/.test(endpoint)) return "motion";
  if (/video-edit|video-extend|object-swap|restyle/.test(endpoint)) return "edit";
  if (kind === "Image" && /\/edit$/.test(endpoint)) return "edit";
  return kind === "Image" ? "image" : "video";
}

export function buildSeedModel(args: {
  family: FamilyListing;
  workflowUrl: string;
  page: ParsedWorkflow;
  index: number;
  workflowCount: number;
}): SeedModel {
  const { family, workflowUrl, page, index, workflowCount } = args;
  const wf = workflowUrl.replace(DOCS, "").replace(/\.md$/, "").split("/")[1] ?? "generate";
  const slug = workflowCount === 1 && /^(generate|generate-and-edit|text-to-image)$/.test(wf) ? family.slug : `${family.slug}-${wf}`;
  const category = categoryFor(family.slug, wf, page.endpoint, family.kind);
  const outputType: OutputType =
    category === "character" ? "character" : page.outputs.includes("video") ? "video" : page.outputs.includes("audio") ? "audio" : family.kind === "Video" ? "video" : "image";
  const workflowName = page.title.split(" — ")[1] ?? page.title;
  return {
    slug,
    name: `${family.name} · ${workflowName}`,
    family: family.name,
    workflow: workflowName,
    provider: family.provider,
    category,
    mode: modeFor(wf, page.endpoint, category, family.kind),
    endpoint: page.endpoint,
    outputType,
    description: family.description,
    notes: page.notes,
    inputSchema: page.schema,
    docsUrl: workflowUrl,
    verified: true,
    featured: FEATURED.has(slug),
    sortOrder: index,
  };
}

/**
 * Prompt templates and brand presets: pure helpers shared by the server
 * (enforcement) and the studio (UI). No database access here.
 */

export type PresetLike = {
  modelSlug: string;
  promptTemplate: string | null;
  params: Record<string, unknown>;
  lockedFields: string[];
  teamIds: string[];
  archivedAt?: Date | string | null;
};

const VAR = /\{\{\s*([a-zA-Z][\w ]{0,40}?)\s*\}\}/g;
export const MAX_VAR_LENGTH = 500;

/** Placeholders in a template, in order of first appearance: "{{product}}" -> "product". */
export function templateVariables(template: string | null | undefined): string[] {
  if (!template) return [];
  const out: string[] = [];
  for (const m of template.matchAll(VAR)) {
    const name = m[1]!.trim();
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Replace placeholders with values; missing values stay as the placeholder name in brackets. */
export function fillTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(VAR, (_, raw: string) => {
    const v = vars[raw.trim()];
    return v && v.trim() ? v.trim().slice(0, MAX_VAR_LENGTH) : `[${raw.trim()}]`;
  });
}

export function missingVariables(template: string | null | undefined, vars: Record<string, string | undefined>): string[] {
  return templateVariables(template).filter((v) => !vars[v]?.trim());
}

export function promptLocked(p: Pick<PresetLike, "lockedFields">): boolean {
  return p.lockedFields.includes("prompt");
}

/**
 * Force locked settings back to the preset's values, whatever the browser
 * sent. A locked field the preset leaves empty is removed so the model
 * default applies.
 */
export function applyPresetLocks(p: PresetLike, params: Record<string, unknown>, vars: Record<string, string> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const name of p.lockedFields) {
    if (name === "prompt") continue;
    if (p.params[name] === undefined) delete out[name];
    else out[name] = p.params[name];
  }
  if (promptLocked(p) && p.promptTemplate) out.prompt = fillTemplate(p.promptTemplate, vars);
  return out;
}

/** Members see presets with no team list, or one listing a team they belong to. Admins see all. */
export function canUsePreset(p: Pick<PresetLike, "teamIds" | "archivedAt">, teamIds: string[], isAdmin: boolean): boolean {
  if (p.archivedAt) return false;
  if (isAdmin || p.teamIds.length === 0) return true;
  return p.teamIds.some((t) => teamIds.includes(t));
}

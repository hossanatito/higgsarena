/**
 * Restriction engine. Pure functions, no database access, so the rules are
 * easy to test and reason about.
 *
 * Effective policy = the strictest value across the organization default,
 * every team the member belongs to, and the member's own override.
 *
 * Budgets are different: each scope has its own pot. The organization budget
 * caps total org spend, a team budget caps that team's spend, a member budget
 * caps that member's spend. A job is blocked if it would push ANY of them past
 * 100%.
 */
import type { BlockReason, PolicyScope } from "@/lib/db/schema";
import { requestedBatch, requestedDuration } from "@/lib/catalog/validate";

export type PolicyInput = {
  scope: PolicyScope;
  scopeId: string;
  scopeName: string;
  monthlyBudgetUsd: string | null;
  dailyGenerationLimit: number | null;
  maxConcurrentJobs: number | null;
  allowedModels: string[] | null;
  maxVideoDuration: number | null;
  maxBatchSize: number | null;
  maxUploadMb: number | null;
  paused: boolean;
};

type Source = { scope: PolicyScope; scopeId: string; scopeName: string };
type Limit<T> = { value: T; source: Source } | null;

export type EffectivePolicy = {
  dailyGenerationLimit: Limit<number>;
  maxConcurrentJobs: Limit<number>;
  maxVideoDuration: Limit<number>;
  maxBatchSize: Limit<number>;
  maxUploadMb: Limit<number>;
  allowedModels: { value: Set<string>; sources: Source[] } | null;
  paused: Source | null;
  budgets: { source: Source; limitUsd: number }[];
};

const SCOPE_RANK: Record<PolicyScope, number> = { org: 0, team: 1, member: 2 };

function minLimit(current: Limit<number>, value: number | null, source: Source): Limit<number> {
  if (value === null || value === undefined) return current;
  if (!current || value < current.value) return { value, source };
  return current;
}

export function effectivePolicy(rows: PolicyInput[]): EffectivePolicy {
  const eff: EffectivePolicy = {
    dailyGenerationLimit: null,
    maxConcurrentJobs: null,
    maxVideoDuration: null,
    maxBatchSize: null,
    maxUploadMb: null,
    allowedModels: null,
    paused: null,
    budgets: [],
  };
  const sorted = [...rows].sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
  for (const r of sorted) {
    const src: Source = { scope: r.scope, scopeId: r.scopeId, scopeName: r.scopeName };
    eff.dailyGenerationLimit = minLimit(eff.dailyGenerationLimit, r.dailyGenerationLimit, src);
    eff.maxConcurrentJobs = minLimit(eff.maxConcurrentJobs, r.maxConcurrentJobs, src);
    eff.maxVideoDuration = minLimit(eff.maxVideoDuration, r.maxVideoDuration, src);
    eff.maxBatchSize = minLimit(eff.maxBatchSize, r.maxBatchSize, src);
    eff.maxUploadMb = minLimit(eff.maxUploadMb, r.maxUploadMb, src);
    if (r.allowedModels && r.allowedModels.length > 0) {
      const set = new Set(r.allowedModels);
      if (!eff.allowedModels) eff.allowedModels = { value: set, sources: [src] };
      else {
        eff.allowedModels = {
          value: new Set([...eff.allowedModels.value].filter((m) => set.has(m))),
          sources: [...eff.allowedModels.sources, src],
        };
      }
    }
    if (r.paused && !eff.paused) eff.paused = src;
    if (r.monthlyBudgetUsd !== null && r.monthlyBudgetUsd !== undefined && r.monthlyBudgetUsd !== "") {
      eff.budgets.push({ source: src, limitUsd: Number(r.monthlyBudgetUsd) });
    }
  }
  return eff;
}

export function isModelAllowed(eff: EffectivePolicy, slug: string): boolean {
  return !eff.allowedModels || eff.allowedModels.value.has(slug);
}

const scopeLabel = (s: Source) => (s.scope === "org" ? "Organization" : s.scope === "team" ? `Team ${s.scopeName}` : "Your personal");

const block = (rule: string, src: Source, message: string, extra: Partial<BlockReason> = {}): BlockReason => ({
  rule,
  scope: src.scope,
  scopeId: src.scopeId,
  scopeName: src.scopeName,
  message,
  ...extra,
});

export type Usage = { generationsToday: number; activeJobs: number };

/** Every rule except budgets. Returns the first rule that blocks, or null. */
export function checkRestrictions(
  eff: EffectivePolicy,
  req: { modelSlug: string; modelName: string; outputType: string; params: Record<string, unknown> },
  usage: Usage,
): BlockReason | null {
  if (eff.paused) return block("paused", eff.paused, `${scopeLabel(eff.paused)} generation is paused by an admin.`);
  if (eff.allowedModels && !eff.allowedModels.value.has(req.modelSlug)) {
    const src = eff.allowedModels.sources[eff.allowedModels.sources.length - 1]!;
    return block("allowed_models", src, `${req.modelName} is not in the allowed models for ${scopeLabel(src).toLowerCase()} rules.`);
  }
  const daily = eff.dailyGenerationLimit;
  if (daily && usage.generationsToday >= daily.value) {
    return block("daily_limit", daily.source, `Daily generation limit reached: ${usage.generationsToday} of ${daily.value} today (${scopeLabel(daily.source).toLowerCase()} rule).`);
  }
  const conc = eff.maxConcurrentJobs;
  if (conc && usage.activeJobs >= conc.value) {
    return block("max_concurrent", conc.source, `Too many jobs running: ${usage.activeJobs} of ${conc.value} allowed at once. Wait for one to finish.`);
  }
  const dur = eff.maxVideoDuration;
  const requested = requestedDuration(req.params);
  if (dur && req.outputType === "video" && requested !== undefined && requested > dur.value) {
    return block("max_duration", dur.source, `Video duration ${requested}s is over the ${dur.value}s limit (${scopeLabel(dur.source).toLowerCase()} rule).`);
  }
  const batch = eff.maxBatchSize;
  const n = requestedBatch(req.params);
  if (batch && n > batch.value) {
    return block("max_batch", batch.source, `Batch size ${n} is over the limit of ${batch.value} per run (${scopeLabel(batch.source).toLowerCase()} rule).`);
  }
  return null;
}

export type BudgetUsage = { source: Source; limitUsd: number; spentUsd: number };

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Hard stop at 100% of any applicable monthly budget. */
export function checkBudgets(budgets: BudgetUsage[], estimateUsd: number): BlockReason | null {
  for (const b of budgets) {
    if (b.spentUsd + estimateUsd > b.limitUsd + 1e-9) {
      const remaining = Math.max(0, b.limitUsd - b.spentUsd);
      return block(
        "monthly_budget",
        b.source,
        `${scopeLabel(b.source)} monthly budget of ${usd(b.limitUsd)} would be exceeded. This job is estimated at ${usd(estimateUsd)} and ${usd(remaining)} remains this month.`,
        { limitUsd: b.limitUsd.toFixed(5), spentUsd: b.spentUsd.toFixed(5), estimateUsd: estimateUsd.toFixed(5) },
      );
    }
  }
  return null;
}

/** Thresholds crossed by moving from `before` to `after` spend. */
export function crossedThresholds(limitUsd: number, before: number, after: number, thresholds = [0.8, 1]): number[] {
  if (limitUsd <= 0) return [];
  return thresholds.filter((t) => before < limitUsd * t && after >= limitUsd * t);
}

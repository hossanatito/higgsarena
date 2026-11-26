import { describe, expect, it } from "vitest";
import { checkBudgets, checkRestrictions, crossedThresholds, effectivePolicy, type PolicyInput } from "@/lib/policy/engine";

const base = (over: Partial<PolicyInput>): PolicyInput => ({
  scope: "org",
  scopeId: "org",
  scopeName: "Acme",
  monthlyBudgetUsd: null,
  dailyGenerationLimit: null,
  maxConcurrentJobs: null,
  allowedModels: null,
  maxVideoDuration: null,
  maxBatchSize: null,
  maxUploadMb: null,
  paused: false,
  ...over,
});

const req = (params: Record<string, unknown> = {}, slug = "soul-2", outputType = "image") => ({ modelSlug: slug, modelName: "SOUL V2", outputType, params });

describe("effective policy", () => {
  it("takes the strictest value across org, teams and member", () => {
    const eff = effectivePolicy([
      base({ dailyGenerationLimit: 50, maxConcurrentJobs: 3 }),
      base({ scope: "team", scopeId: "t1", scopeName: "Freelancers", dailyGenerationLimit: 40 }),
      base({ scope: "team", scopeId: "t2", scopeName: "Marketing", dailyGenerationLimit: 100, maxConcurrentJobs: 2 }),
      base({ scope: "member", scopeId: "m1", scopeName: "personal", dailyGenerationLimit: 60 }),
    ]);
    expect(eff.dailyGenerationLimit?.value).toBe(40);
    expect(eff.dailyGenerationLimit?.source.scopeName).toBe("Freelancers");
    expect(eff.maxConcurrentJobs?.value).toBe(2);
  });

  it("intersects allowed-model lists", () => {
    const eff = effectivePolicy([
      base({ allowedModels: ["soul-2", "z-image-turbo", "kling-3-pro-text-to-video"] }),
      base({ scope: "team", scopeId: "t", scopeName: "Interns", allowedModels: ["soul-2", "z-image-turbo"] }),
    ]);
    expect([...eff.allowedModels!.value].sort()).toEqual(["soul-2", "z-image-turbo"]);
    expect(checkRestrictions(eff, req({}, "kling-3-pro-text-to-video", "video"), { generationsToday: 0, activeJobs: 0 })?.rule).toBe("allowed_models");
  });

  it("treats an empty list as no restriction", () => {
    expect(effectivePolicy([base({ allowedModels: [] })]).allowedModels).toBeNull();
  });

  it("pauses if any level is paused", () => {
    const eff = effectivePolicy([base({}), base({ scope: "team", scopeId: "t", scopeName: "Design", paused: true })]);
    expect(checkRestrictions(eff, req(), { generationsToday: 0, activeJobs: 0 })?.rule).toBe("paused");
  });
});

describe("restrictions", () => {
  const eff = effectivePolicy([base({ dailyGenerationLimit: 2, maxConcurrentJobs: 1, maxVideoDuration: 10, maxBatchSize: 1 })]);
  const free = { generationsToday: 0, activeJobs: 0 };

  it("blocks on the daily limit", () => {
    expect(checkRestrictions(eff, req(), { generationsToday: 2, activeJobs: 0 })?.rule).toBe("daily_limit");
  });
  it("blocks on concurrency", () => {
    expect(checkRestrictions(eff, req(), { generationsToday: 0, activeJobs: 1 })?.rule).toBe("max_concurrent");
  });
  it("checks video duration including multi-shot totals", () => {
    expect(checkRestrictions(eff, req({ duration: 15 }, "k", "video"), free)?.rule).toBe("max_duration");
    expect(checkRestrictions(eff, req({ duration: 5, multi_shots: true, multi_prompt: [{ duration: 6 }, { duration: 6 }] }, "k", "video"), free)?.rule).toBe("max_duration");
    expect(checkRestrictions(eff, req({ duration: 10 }, "k", "video"), free)).toBeNull();
  });
  it("checks batch size", () => {
    expect(checkRestrictions(eff, req({ batch_size: 4 }), free)?.rule).toBe("max_batch");
  });
  it("names the rule in the message", () => {
    expect(checkRestrictions(eff, req(), { generationsToday: 2, activeJobs: 0 })?.message).toMatch(/Daily generation limit reached: 2 of 2/);
  });
});

describe("budgets", () => {
  const team = { scope: "team" as const, scopeId: "t", scopeName: "Marketing" };
  it("hard-stops at 100% and names the rule and amount", () => {
    const r = checkBudgets([{ source: team, limitUsd: 250, spentUsd: 249.9 }], 0.25);
    expect(r?.rule).toBe("monthly_budget");
    expect(r?.message).toContain("Team Marketing monthly budget of $250.00");
    expect(r?.message).toContain("$0.25");
    expect(r?.message).toContain("$0.10 remains");
  });
  it("allows a job that lands exactly on the budget", () => {
    expect(checkBudgets([{ source: team, limitUsd: 1, spentUsd: 0.75 }], 0.25)).toBeNull();
  });
  it("detects 80% and 100% crossings once", () => {
    expect(crossedThresholds(100, 70, 85)).toEqual([0.8]);
    expect(crossedThresholds(100, 70, 100)).toEqual([0.8, 1]);
    expect(crossedThresholds(100, 85, 90)).toEqual([]);
  });
});

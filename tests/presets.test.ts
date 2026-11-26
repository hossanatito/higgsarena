import { describe, expect, it } from "vitest";
import { applyPresetLocks, canUsePreset, fillTemplate, missingVariables, templateVariables } from "@/lib/presets/core";

const preset = {
  modelSlug: "soul-2",
  promptTemplate: "Studio photo of {{product}} on {{ backdrop }}, soft light. {{product}} centered.",
  params: { aspect_ratio: "4:5", resolution: "1080p", style_id: "abc" },
  lockedFields: ["aspect_ratio", "style_id", "seed"],
  teamIds: [] as string[],
};

describe("prompt templates", () => {
  it("finds unique placeholders in order", () => {
    expect(templateVariables(preset.promptTemplate)).toEqual(["product", "backdrop"]);
    expect(templateVariables(null)).toEqual([]);
  });
  it("fills placeholders and marks missing ones", () => {
    expect(fillTemplate(preset.promptTemplate, { product: "a ceramic vase", backdrop: "grey paper" })).toBe("Studio photo of a ceramic vase on grey paper, soft light. a ceramic vase centered.");
    expect(fillTemplate("Shot of {{product}}", {})).toBe("Shot of [product]");
    expect(missingVariables(preset.promptTemplate, { product: "x" })).toEqual(["backdrop"]);
  });
  it("caps filled values", () => {
    expect(fillTemplate("{{a}}", { a: "x".repeat(900) }).length).toBe(500);
  });
});

describe("brand preset locks", () => {
  it("forces locked fields back to the preset values", () => {
    const out = applyPresetLocks(preset, { prompt: "hi", aspect_ratio: "16:9", style_id: "evil", resolution: "720p", seed: 42 });
    expect(out.aspect_ratio).toBe("4:5");
    expect(out.style_id).toBe("abc");
    expect(out.resolution).toBe("720p"); // not locked: member's choice stays
    expect("seed" in out).toBe(false); // locked but unset in the preset: model default
    expect(out.prompt).toBe("hi");
  });
  it("builds the prompt from the template when the prompt is locked", () => {
    const out = applyPresetLocks({ ...preset, lockedFields: ["prompt"] }, { prompt: "ignore the brand" }, { product: "sneakers", backdrop: "sand" });
    expect(out.prompt).toBe("Studio photo of sneakers on sand, soft light. sneakers centered.");
  });
  it("limits presets to their teams", () => {
    expect(canUsePreset({ teamIds: ["t1"], archivedAt: null }, ["t2"], false)).toBe(false);
    expect(canUsePreset({ teamIds: ["t1"], archivedAt: null }, ["t1"], false)).toBe(true);
    expect(canUsePreset({ teamIds: ["t1"], archivedAt: null }, [], true)).toBe(true);
    expect(canUsePreset({ teamIds: [], archivedAt: new Date() }, [], true)).toBe(false);
  });
});

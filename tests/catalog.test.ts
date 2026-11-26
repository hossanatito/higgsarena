import { describe, expect, it } from "vitest";
import seed from "@/lib/catalog/seed-catalog.json";
import { schemaToFields } from "@/lib/catalog/schema-to-fields";
import { validateParams } from "@/lib/catalog/validate";
import type { SeedModel } from "@/lib/catalog/types";

const models = (seed as { models: SeedModel[] }).models;
const by = (slug: string) => models.find((m) => m.slug === slug)!;

describe("seed catalog", () => {
  it("ships all 84 Higgsfield workflows with unique slugs and endpoints", () => {
    expect(models.length).toBe(84);
    expect(new Set(models.map((m) => m.slug)).size).toBe(84);
    expect(new Set(models.map((m) => m.endpoint)).size).toBe(84);
  });
  it("turns every schema into renderable fields", () => {
    for (const m of models) {
      const fields = schemaToFields(m.inputSchema);
      expect(fields.length, m.slug).toBeGreaterThan(0);
      for (const f of fields) expect(f.label, `${m.slug}.${f.name}`).toBeTruthy();
    }
  });
  it("maps SOUL V2 fields to the right kinds", () => {
    const f = Object.fromEntries(schemaToFields(by("soul-2").inputSchema).map((x) => [x.name, x]));
    expect(f.prompt!.kind).toBe("prompt");
    expect(f.prompt!.required).toBe(true);
    expect(f.aspect_ratio!.kind).toBe("select");
    expect(f.batch_size!.options).toEqual([1, 4]);
    expect(f.custom_reference_id!.kind).toBe("character");
    expect(f.seed!.group).toBe("advanced");
  });
  it("maps media and JSON fields", () => {
    const motion = Object.fromEntries(schemaToFields(by("genjutsu-motion-transfer").inputSchema).map((x) => [x.name, x]));
    expect(motion.video_url!.kind).toBe("video");
    expect(motion.image_urls!.kind).toBe("images");
    expect(motion.image_urls!.maxItems).toBe(8);
    const recraft = Object.fromEntries(schemaToFields(by("recraft-v4-1").inputSchema).map((x) => [x.name, x]));
    expect(recraft.colors!.kind).toBe("json");
  });
});

describe("param validation", () => {
  const fields = schemaToFields(by("soul-2").inputSchema);
  it("drops unknown fields and keeps valid ones", () => {
    const r = validateParams(fields, { prompt: "hi", aspect_ratio: "16:9", evil: "x", style_strength: 0.5 });
    expect(r.ok && r.params).toEqual({ prompt: "hi", aspect_ratio: "16:9", style_strength: 0.5 });
  });
  it("requires required fields", () => {
    const r = validateParams(fields, {});
    expect(!r.ok && r.errors.prompt).toMatch(/required/);
  });
  it("enforces enums and ranges", () => {
    expect(validateParams(fields, { prompt: "x", aspect_ratio: "7:3" }).ok).toBe(false);
    expect(validateParams(fields, { prompt: "x", batch_size: 2 }).ok).toBe(false);
    expect(validateParams(fields, { prompt: "x", seed: 0 }).ok).toBe(false);
  });
  it("only accepts https media URLs", () => {
    const f = schemaToFields(by("genjutsu-motion-transfer").inputSchema);
    expect(validateParams(f, { video_url: "http://169.254.169.254/latest", image_urls: ["https://cdn.example.com/a.png"] }).ok).toBe(false);
    expect(validateParams(f, { video_url: "https://cdn.example.com/v.mp4", image_urls: ["https://cdn.example.com/a.png"] }).ok).toBe(true);
  });
});

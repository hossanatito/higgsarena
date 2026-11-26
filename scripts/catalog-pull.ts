/**
 * Rebuilds src/lib/catalog/seed-catalog.json from the public Higgsfield docs.
 *
 *   pnpm catalog:pull
 *
 * Run it when Higgsfield adds or changes models, review the diff, and open a
 * pull request. Admins then pick up the changes with "Sync catalog".
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildSeedModel,
  parseFamilyListing,
  parseFamilyWorkflows,
  parseWorkflowPage,
} from "../src/lib/catalog/docs-parser";
import type { SeedModel } from "../src/lib/catalog/types";

const BASE = "https://docs.higgsfield.ai/docs/models";

async function get(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "higgsarena-catalog-pull" } });
    if (res.ok) return res.text();
    if (res.status < 500 && res.status !== 429) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`${url}: gave up after retries`);
}

async function main() {
  const listings = [
    ...parseFamilyListing(await get(`${BASE}/image-generation.md`)),
    ...parseFamilyListing(await get(`${BASE}/video-generation.md`)),
  ];
  console.log(`Found ${listings.length} model families`);
  const models: SeedModel[] = [];
  let index = 0;
  for (const family of listings) {
    const workflows = parseFamilyWorkflows(await get(`${BASE}/${family.slug}.md`));
    for (const wf of workflows) {
      const page = parseWorkflowPage(await get(wf.url));
      if (!page) {
        console.warn(`  ! could not parse ${wf.url}`);
        continue;
      }
      models.push(buildSeedModel({ family, workflowUrl: wf.url, page, index: index++, workflowCount: workflows.length }));
    }
    console.log(`  ${family.name}: ${workflows.length} workflow(s)`);
  }
  const slugs = new Set<string>();
  for (const m of models) {
    if (slugs.has(m.slug)) throw new Error(`Duplicate slug ${m.slug}`);
    slugs.add(m.slug);
  }
  const out = path.join(process.cwd(), "src/lib/catalog/seed-catalog.json");
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), source: "https://docs.higgsfield.ai/docs/llms.txt", models }, null, 1) + "\n");
  console.log(`Wrote ${models.length} models to ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { character, generation } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { listModels, toPublicModel } from "@/lib/catalog/repo";
import { isModelAllowed } from "@/lib/policy/engine";
import { budgetUsage, effectiveFor } from "@/lib/policy/load";
import { getOrgCredentialRow, getPersonalCredentialRow } from "@/lib/credentials";
import { loadGeneration, toClient } from "@/lib/generations/access";
import { withDisplayUrls } from "@/lib/generations/mirror";
import { DEFAULT_MAX_UPLOAD_MB } from "@/lib/uploads";
import { Studio } from "@/components/studio/studio";
import type { CharacterOption } from "@/components/studio/types";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const eff = await effectiveFor(ctx);
  const models = (await listModels()).filter((m) => m.enabled && m.category !== "character" && isModelAllowed(eff, m.slug)).map(toPublicModel);

  const chars = await db
    .select()
    .from(character)
    .where(and(eq(character.memberId, ctx.member.id), eq(character.status, "completed")))
    .orderBy(desc(character.createdAt));
  const characters: CharacterOption[] = chars.filter((c) => c.referenceId).map((c) => ({ id: c.id, referenceId: c.referenceId!, name: c.name, modelVersion: c.modelVersion, thumbnailUrl: c.thumbnailUrl }));

  const orgKey = await getOrgCredentialRow(ctx.org.id);
  const personalKey = ctx.org.settings.personalKeysAllowed ? await getPersonalCredentialRow(ctx.org.id, ctx.user.id) : undefined;

  let remainingUsd: number | null = null;
  if (orgKey) {
    const budgets = await budgetUsage(ctx, eff);
    if (budgets.length) remainingUsd = Math.min(...budgets.map((b) => b.limitUsd - b.spentUsd));
  }

  const rows = await db
    .select()
    .from(generation)
    .where(and(eq(generation.memberId, ctx.member.id), isNull(generation.deletedAt)))
    .orderBy(desc(generation.createdAt))
    .limit(24);
  const feed = (await withDisplayUrls(rows)).map((r) => toClient(r, ctx));

  let initial: { slug: string; values: Record<string, unknown> } | undefined;
  if (sp.remix) {
    try {
      const g = await loadGeneration(ctx, sp.remix);
      initial = { slug: g.modelSlug, values: g.params };
    } catch {
      initial = undefined;
    }
  } else if (sp.model) {
    initial = { slug: sp.model, values: {} };
  }

  const setupHint = !orgKey && !personalKey
    ? hasRole(ctx.role, "admin")
      ? "Add your organization's Higgsfield key in Admin → API keys to start generating."
      : "An admin needs to add a Higgsfield key before anyone can generate."
    : null;

  return (
    <Studio
      models={models}
      characters={characters}
      initialFeed={feed}
      keys={{ org: !!orgKey, personal: !!personalKey, personalAllowed: ctx.org.settings.personalKeysAllowed }}
      maxUploadMb={eff.maxUploadMb?.value ?? DEFAULT_MAX_UPLOAD_MB}
      remainingUsd={remainingUsd}
      initial={initial}
      setupHint={setupHint}
    />
  );
}

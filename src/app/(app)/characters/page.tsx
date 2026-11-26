import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { character } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { refreshCharacters } from "@/lib/generations/characters";
import { effectiveFor } from "@/lib/policy/load";
import { getModel } from "@/lib/catalog/repo";
import { DEFAULT_MAX_UPLOAD_MB } from "@/lib/uploads";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/ui";
import { CharactersView } from "@/components/characters/characters-view";

export const metadata = { title: "Characters" };

export default async function CharactersPage() {
  const ctx = await requireContext();
  const rows = await db.select().from(character).where(and(eq(character.organizationId, ctx.org.id), eq(character.memberId, ctx.member.id))).orderBy(desc(character.createdAt));
  const fresh = await refreshCharacters(rows);
  const eff = await effectiveFor(ctx);
  const soulId = await getModel("soul-id-create-character");
  return (
    <Page>
      <PageHeader title="Characters" description="Train a Soul ID character from 1 to 100 reference photos, then use it in SOUL models' Character picker." />
      <CharactersView
        enabled={!!soulId?.enabled}
        maxUploadMb={eff.maxUploadMb?.value ?? DEFAULT_MAX_UPLOAD_MB}
        initial={fresh.map((c) => ({ id: c.id, name: c.name, modelVersion: c.modelVersion, status: c.status, thumbnailUrl: c.thumbnailUrl, failReason: c.failReason, imageCount: c.imageCount, createdAt: c.createdAt.toISOString() }))}
      />
    </Page>
  );
}

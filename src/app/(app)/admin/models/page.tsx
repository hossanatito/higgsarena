import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { listModels } from "@/lib/catalog/repo";
import { LinkButton, PageHeader } from "@/components/ui";
import { ModelTable } from "@/components/admin/model-table";

export const metadata = { title: "Models" };

export default async function ModelsPage() {
  const ctx = await requireContext("admin");
  const models = await listModels();
  const stats = await db
    .select({ slug: generation.modelSlug, avg: sql<string | null>`avg(${generation.estimatedCostUsd})`, count: sql<number>`count(*)` })
    .from(generation)
    .where(sql`${generation.organizationId} = ${ctx.org.id}`)
    .groupBy(generation.modelSlug);
  const bySlug = new Map(stats.map((s) => [s.slug, s]));
  return (
    <>
      <PageHeader title="Models" description="Choose which Higgsfield workflows your team can use. Schemas come from the Higgsfield docs." actions={hasRole(ctx.role, "owner") ? <LinkButton href="/admin/settings#catalog" size="sm">Edit catalog</LinkButton> : undefined} />
      <ModelTable
        rows={models.map((m) => ({ slug: m.slug, name: m.name, provider: m.provider, category: m.category, enabled: m.enabled, featured: m.featured, verified: m.verified, isCustom: m.isCustom, userEdited: m.userEdited, docsUrl: m.docsUrl, avgEstimateUsd: bySlug.get(m.slug)?.avg ? Number(bySlug.get(m.slug)!.avg) : null, count: Number(bySlug.get(m.slug)?.count ?? 0) }))}
      />
    </>
  );
}

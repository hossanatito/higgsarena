import { and, desc, eq, gte, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, member, team, teamMember, user } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { visibleMemberIds, toClient } from "@/lib/generations/access";
import { withDisplayUrls } from "@/lib/generations/mirror";
import { listModels } from "@/lib/catalog/repo";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/ui";
import { LibraryView } from "@/components/library/library-view";

export const metadata = { title: "Library" };
const PAGE_SIZE = 40;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const isAdmin = hasRole(ctx.role, "admin");
  const orgView = isAdmin && sp.scope === "org";
  const page = Math.max(1, Number(sp.page) || 1);

  const parts: SQL[] = [eq(generation.organizationId, ctx.org.id), isNull(generation.deletedAt)];
  if (orgView) {
    if (sp.member) parts.push(eq(generation.memberId, sp.member));
    if (sp.team) {
      const ids = (await db.select({ id: teamMember.memberId }).from(teamMember).where(eq(teamMember.teamId, sp.team))).map((r) => r.id);
      parts.push(inArray(generation.memberId, ids.length ? ids : ["-"]));
    }
  } else if (sp.scope === "shared") {
    const visible = await visibleMemberIds(ctx);
    if (visible !== "all") parts.push(inArray(generation.memberId, visible));
  } else {
    parts.push(eq(generation.memberId, ctx.member.id));
  }
  if (sp.model) parts.push(eq(generation.modelSlug, sp.model));
  if (sp.type === "image" || sp.type === "video") parts.push(eq(generation.outputType, sp.type));
  if (sp.fav === "1") parts.push(eq(generation.favorite, true));
  if (sp.status) parts.push(eq(generation.status, sp.status as typeof generation.$inferSelect.status));
  else parts.push(inArray(generation.status, ["completed", "failed", "nsfw", "canceled", "queued", "in_progress", "submitting"]));
  if (sp.from) parts.push(gte(generation.createdAt, new Date(`${sp.from}T00:00:00Z`)));
  if (sp.to) parts.push(lt(generation.createdAt, new Date(new Date(`${sp.to}T00:00:00Z`).getTime() + 86_400_000)));

  const rows = await db
    .select({ g: generation, email: user.email, name: user.name })
    .from(generation)
    .innerJoin(member, eq(member.id, generation.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(...parts))
    .orderBy(desc(generation.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  const display = await withDisplayUrls(rows.slice(0, PAGE_SIZE).map((r) => r.g));
  const owners = Object.fromEntries(rows.map((r) => [r.g.id, r.name || r.email]));
  const items = display.map((r) => ({ ...toClient(r, ctx), owner: owners[r.id] as string }));

  const models = (await listModels()).map((m) => ({ slug: m.slug, name: m.name }));
  const members = orgView ? (await db.select({ id: member.id, email: user.email, name: user.name }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, ctx.org.id))) : [];
  const teams = orgView ? await db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, ctx.org.id)) : [];
  const hasShared = !isAdmin && ctx.teamIds.length > 0 && (await db.select({ id: team.id }).from(team).where(and(inArray(team.id, ctx.teamIds), eq(team.sharedLibrary, true)))).length > 0;

  return (
    <Page wide>
      <PageHeader title="Library" description="Your images and videos. Files hosted by Higgsfield expire after 7 days unless your admins mirror them to storage." />
      <LibraryView key={JSON.stringify(sp)} items={items} filters={sp} models={models} members={members} teams={teams} isAdmin={isAdmin} hasShared={hasShared} page={page} hasMore={hasMore} />
    </Page>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, user } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { canEdit, collectionGenerations, getCollection, shareActive } from "@/lib/collections";
import { withDisplayUrls } from "@/lib/generations/mirror";
import { toClient } from "@/lib/generations/access";
import { Page } from "@/components/page";
import { LibraryTabs } from "@/components/collections/library-tabs";
import { CollectionBoard } from "@/components/collections/collection-board";

export const metadata = { title: "Collection" };

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const c = await getCollection(ctx, id);
  if (!c) notFound();
  const gens = await withDisplayUrls(await collectionGenerations(c.id));
  const [owner] = await db.select({ name: user.name, email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.id, c.ownerMemberId));
  return (
    <Page wide>
      <LibraryTabs active="collections" />
      <CollectionBoard
        collection={{
          id: c.id,
          name: c.name,
          description: c.description,
          visibility: c.visibility,
          owner: c.ownerMemberId === ctx.member.id ? "you" : (owner?.name || owner?.email || "a teammate"),
          share: shareActive(c) ? { expiresAt: c.shareExpiresAt?.toISOString() ?? null, showPrompts: c.shareShowPrompts, createdAt: c.shareCreatedAt?.toISOString() ?? null } : null,
        }}
        editable={canEdit(ctx, c)}
        items={gens.map((g) => toClient(g, ctx))}
      />
    </Page>
  );
}

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgetOverride } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";
import { Page } from "@/components/page";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext("admin");
  const pending = (await db.select({ id: budgetOverride.id }).from(budgetOverride).where(and(eq(budgetOverride.organizationId, ctx.org.id), eq(budgetOverride.status, "pending")))).length;
  return (
    <Page wide>
      <AdminNav isOwner={hasRole(ctx.role, "owner")} pending={pending} />
      {children}
    </Page>
  );
}

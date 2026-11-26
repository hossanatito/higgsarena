import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgetOverride } from "@/lib/db/schema";
import { requireContext, hasRole } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const isAdmin = hasRole(ctx.role, "admin");
  const pending = isAdmin
    ? (await db.select({ id: budgetOverride.id }).from(budgetOverride).where(and(eq(budgetOverride.organizationId, ctx.org.id), eq(budgetOverride.status, "pending")))).length
    : 0;
  const collapsed = (await cookies()).get("sidebar")?.value === "collapsed";
  return (
    <AppShell
      user={{ name: ctx.user.name, email: ctx.user.email, image: ctx.user.image }}
      isAdmin={isAdmin}
      isOwner={hasRole(ctx.role, "owner")}
      pending={pending}
      demo={process.env.DEMO_MODE === "true"}
      sidebarCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}

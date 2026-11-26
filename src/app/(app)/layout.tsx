import { requireContext, hasRole } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <AppShell user={{ name: ctx.user.name, email: ctx.user.email, image: ctx.user.image }} isAdmin={hasRole(ctx.role, "admin")} demo={process.env.DEMO_MODE === "true"}>
      {children}
    </AppShell>
  );
}

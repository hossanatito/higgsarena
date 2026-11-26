import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, team, teamMember, user } from "@/lib/db/schema";
import { requireContext } from "@/lib/session";
import { byTeam } from "@/lib/analytics";
import { monthStart } from "@/lib/policy/load";
import { Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/admin/action-ui";
import { TeamCard } from "@/components/admin/team-card";
import { createTeam } from "../actions";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const ctx = await requireContext("admin");
  const teams = await db.select().from(team).where(eq(team.organizationId, ctx.org.id)).orderBy(team.name);
  const all = await db.select({ id: member.id, email: user.email, name: user.name, suspended: member.suspendedAt }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, ctx.org.id));
  const links = await db.select().from(teamMember);
  const usage = new Map((await byTeam(ctx.org.id, { from: monthStart(), to: new Date(Date.now() + 60_000) })).map((u) => [u.teamId, u]));
  const label = (m: (typeof all)[number]) => m.name || m.email;
  return (
    <>
      <PageHeader title="Teams" description="Group members, give teams their own budget and rules, and optionally share a library." />
      <Card className="mb-6 p-4 sm:p-5">
        <ActionForm action={createTeam} submitLabel="Create team" resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end [&>div:last-child]:mt-0">
          <Field label="New team" htmlFor="team-name"><Input id="team-name" name="name" maxLength={80} placeholder="e.g. Marketing" required /></Field>
        </ActionForm>
      </Card>
      {teams.length === 0 ? (
        <Card><EmptyState title="No teams yet" body="Teams let you set budgets and rules for groups like Marketing, Design or Freelancers." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((t) => (
            <TeamCard key={t.id} t={t} members={links.filter((l) => l.teamId === t.id).map((l) => all.find((a) => a.id === l.memberId)).filter((m): m is (typeof all)[number] => !!m).map((m) => ({ id: m.id, label: label(m) }))} all={all.filter((a) => !a.suspended).map((a) => ({ id: a.id, label: label(a) }))} spend={usage.get(t.id)?.spendUsd ?? 0} count={usage.get(t.id)?.count ?? 0} budget={usage.get(t.id)?.budgetUsd ?? null} />
          ))}
        </div>
      )}
    </>
  );
}

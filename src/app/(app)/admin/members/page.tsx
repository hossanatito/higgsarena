import Link from "next/link";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation, invitation, member, team, teamMember, user } from "@/lib/db/schema";
import { hasRole, requireContext } from "@/lib/session";
import { monthStart } from "@/lib/policy/load";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm } from "@/components/admin/action-ui";
import { InviteActions, MemberActions, RoleSelect } from "@/components/admin/member-controls";
import { dateTime, relativeTime, usd } from "@/lib/format";
import { inviteMember } from "../actions";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireContext("admin");
  const isOwner = hasRole(ctx.role, "owner");
  const members = await db
    .select({ m: member, email: user.email, name: user.name, verified: user.emailVerified })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.org.id))
    .orderBy(member.createdAt);
  const usage = await db
    .select({ memberId: generation.memberId, spend: sql<string>`coalesce(sum(${generation.costUsd}), 0)`, count: sql<number>`count(*)`, last: sql<Date | null>`max(${generation.createdAt})` })
    .from(generation)
    .where(and(eq(generation.organizationId, ctx.org.id), gte(generation.createdAt, monthStart())))
    .groupBy(generation.memberId);
  const usageBy = new Map(usage.map((u) => [u.memberId, u]));
  const teams = await db.select().from(team).where(eq(team.organizationId, ctx.org.id)).orderBy(team.name);
  const memberships = await db.select().from(teamMember);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const invites = await db.select().from(invitation).where(and(eq(invitation.organizationId, ctx.org.id), isNull(invitation.acceptedAt), isNull(invitation.revokedAt))).orderBy(desc(invitation.createdAt));

  return (
    <>
      <PageHeader title="Members" description="Invite people, set roles and see their usage this month." />
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-semibold">Invite someone</h2>
        <ActionForm action={inviteMember} submitLabel="Send invitation" pendingLabel="Sending…" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Email" htmlFor="inv-email"><Input id="inv-email" name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Role" htmlFor="inv-role">
              <Select id="inv-role" name="role" defaultValue="member">
                <option value="member">Member</option>
                {isOwner && <option value="admin">Admin</option>}
              </Select>
            </Field>
          </div>
          {teams.length > 0 && (
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-sm font-medium">Teams <span className="font-normal text-fg-subtle">optional</span></legend>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <label key={t.id} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
                    <input type="checkbox" name="teamIds" value={t.id} className="accent-[var(--accent)]" /> {t.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p className="mt-3 text-[12px] text-fg-subtle">Invitations are single-use links valid for 7 days. Accepting requires signing in with the invited email.</p>
        </ActionForm>
      </Card>

      {invites.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-semibold">Pending invitations</h2>
          <Table>
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Expires</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}{i.teamIds.length > 0 && <span className="ml-2 text-[12px] text-fg-subtle">{i.teamIds.map((t) => teamName.get(t)).filter(Boolean).join(", ")}</span>}</Td>
                  <Td className="capitalize text-fg-muted">{i.role}</Td>
                  <Td>{i.expiresAt.getTime() < Date.now() ? <Badge tone="warn">Expired</Badge> : <span className="text-fg-muted" title={dateTime(i.expiresAt)}>{relativeTime(i.expiresAt)}</span>}</Td>
                  <Td className="text-right"><InviteActions id={i.id} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 font-semibold">Members <span className="mono text-fg-subtle">{members.length}</span></h2>
      <Table>
        <thead><tr><Th>Person</Th><Th>Role</Th><Th>Teams</Th><Th className="text-right">This month</Th><Th className="text-right">Actions</Th></tr></thead>
        <tbody>
          {members.map(({ m, email, name, verified }) => {
            const u = usageBy.get(m.id);
            const self = m.id === ctx.member.id;
            const canEdit = !self && (isOwner || m.role === "member");
            return (
              <tr key={m.id} className={m.suspendedAt ? "opacity-60" : undefined}>
                <Td>
                  <p className="font-medium">{name || email}{self && <span className="ml-1.5 text-[12px] text-fg-subtle">(you)</span>}</p>
                  <p className="text-[12px] text-fg-subtle">{email}{!verified && " · unverified"}</p>
                  {m.suspendedAt && <Badge tone="warn" className="mt-1">Suspended</Badge>}
                </Td>
                <Td><RoleSelect memberId={m.id} role={m.role} canEdit={canEdit} isOwnerViewer={isOwner} /></Td>
                <Td className="text-[13px] text-fg-muted">{memberships.filter((tm) => tm.memberId === m.id).map((tm) => teamName.get(tm.teamId)).filter(Boolean).join(", ") || "-"}</Td>
                <Td className="text-right">
                  <Link href={`/admin/analytics?member=${m.id}`} className="mono hover:underline">{usd(u?.spend ?? 0)}</Link>
                  <p className="text-[12px] text-fg-subtle">{Number(u?.count ?? 0)} jobs{u?.last ? ` · ${relativeTime(u.last)}` : ""}</p>
                </Td>
                <Td className="text-right"><MemberActions memberId={m.id} suspended={!!m.suspendedAt} canEdit={canEdit} canTransfer={isOwner && !self && !m.suspendedAt && m.role !== "owner"} /></Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-[12px] text-fg-subtle">Owners come from OWNER_EMAILS or <code>pnpm admin:promote</code>. Set per-member rules in <Link href="/admin/restrictions" className="underline">Restrictions</Link>.</p>
    </>
  );
}

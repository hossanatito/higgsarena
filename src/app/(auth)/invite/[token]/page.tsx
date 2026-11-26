import { redirect } from "next/navigation";
import { UsersThree } from "@phosphor-icons/react/ssr";
import { getSession } from "@/lib/session";
import { acceptInvitation, findInvitationByToken, invitationState } from "@/lib/invitations";
import { audit } from "@/lib/audit";
import { getOrg } from "@/lib/org";
import { LinkButton, Notice } from "@/components/ui";
import { SignOutButton } from "@/components/auth/forms";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvitationByToken(token);
  const org = await getOrg();
  if (!invite || invite.organizationId !== org.id) {
    return (
      <div className="auth-card">
        <Notice tone="danger" title="This invitation link isn't valid">Ask the person who invited you to send a new one.</Notice>
      </div>
    );
  }
  const state = invitationState(invite);
  if (state !== "valid") {
    return (
      <div className="auth-card">
        <Notice tone="warn" title={state === "accepted" ? "This invitation was already used" : state === "revoked" ? "This invitation was revoked" : "This invitation has expired"}>
          {state === "accepted" ? "Sign in to continue." : "Ask an admin to send you a new invitation."}
        </Notice>
        {state === "accepted" && <LinkButton href="/sign-in" variant="primary" className="mt-4 w-full">Sign in</LinkButton>}
      </div>
    );
  }

  const session = await getSession();
  const path = `/invite/${encodeURIComponent(token)}`;
  if (session) {
    if (session.user.email.toLowerCase() === invite.email) {
      const m = await acceptInvitation(invite, session.user.id);
      if (m) {
        await audit({ userId: session.user.id, email: session.user.email, orgId: org.id }, "invite.accept", { type: "invitation", id: invite.id }, null, { role: m.role });
      }
      redirect("/studio");
    }
    return (
      <div className="auth-card">
        <Notice tone="warn" title="Wrong account">
          This invitation is for <strong>{invite.email}</strong>, but you're signed in as <strong>{session.user.email}</strong>. Sign out and sign in with the invited address.
        </Notice>
        <div className="mt-4"><SignOutButton variant="secondary" /></div>
      </div>
    );
  }
  return (
    <div className="auth-card text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <UsersThree size={28} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Join {org.name}</h1>
      <p className="mt-2 mb-6 text-[15px] text-fg-muted">
        You've been invited as {invite.role === "admin" ? "an admin" : "a member"}. Use <strong className="text-fg">{invite.email}</strong> to accept.
      </p>
      <div className="grid gap-2.5">
        <LinkButton href={`/sign-up?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(path)}`} variant="primary" size="lg">Create account</LinkButton>
        <LinkButton href={`/sign-in?next=${encodeURIComponent(path)}`} variant="secondary" size="lg">I already have an account</LinkButton>
      </div>
    </div>
  );
}

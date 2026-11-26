import { redirect } from "next/navigation";
import { EnvelopeSimple } from "@phosphor-icons/react/ssr";
import { getContext } from "@/lib/session";
import { ResendVerification, SignOutButton } from "@/components/auth/forms";

export const metadata = { title: "Verify your email" };

export default async function VerifyPage() {
  const ctx = await getContext();
  if (ctx.state === "signed-out") redirect("/sign-in");
  if (ctx.state === "ok") redirect("/studio");
  const email = ctx.user.email;
  return (
    <div className="auth-card text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <EnvelopeSimple size={28} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
      <p className="mt-2 mb-6 text-[15px] text-fg-muted">
        We sent a link to <strong className="text-fg">{email}</strong>. Open it on this device to continue.
      </p>
      <ResendVerification email={email} />
      <div className="mt-3">
        <SignOutButton label="Use a different account" />
      </div>
    </div>
  );
}

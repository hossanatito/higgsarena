import { redirect } from "next/navigation";
import { LockSimple } from "@phosphor-icons/react/ssr";
import { getContext } from "@/lib/session";
import { SignOutButton } from "@/components/auth/forms";

export const metadata = { title: "No access" };

export default async function NoAccessPage() {
  const ctx = await getContext();
  if (ctx.state === "signed-out") redirect("/sign-in");
  if (ctx.state === "ok") redirect("/studio");
  if (ctx.state === "unverified") redirect("/verify-email");
  const suspended = ctx.state === "suspended";
  return (
    <div className="panel p-6 text-center sm:p-8">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-fg-muted">
        <LockSimple size={28} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{suspended ? "Your access is suspended" : "You're not a member yet"}</h1>
      <p className="mt-2 mb-6 text-[15px] text-fg-muted">
        {suspended
          ? "An admin suspended this account. Contact them if you think this is a mistake."
          : `You're signed in as ${ctx.user.email}, but this studio is invite only. Ask an admin to invite this address, then open the link in the invitation email.`}
      </p>
      <SignOutButton variant="secondary" />
    </div>
  );
}

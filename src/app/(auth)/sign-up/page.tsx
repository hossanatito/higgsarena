import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { SignUpForm } from "@/components/auth/forms";
import { SocialButtons } from "@/components/auth/social-buttons";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (ctx.state === "ok") redirect("/studio");
  const social = enabledSocialProviders();
  const { value: signup } = await getSetting("signup");
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/studio";
  const policyNote =
    signup.policy === "invite"
      ? "This studio is invite only. Use the email address your invitation was sent to."
      : signup.policy === "domains"
        ? `Sign-up is open to ${signup.domains.map((d) => `@${d.replace(/^@/, "")}`).join(", ")} addresses.`
        : undefined;
  return (
    <div className="auth-card">
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 mb-6 text-[15px] text-fg-muted">Generate images and video with your team's Higgsfield models.</p>
      <SocialButtons google={social.google} github={social.github} next={next} />
      <SignUpForm next={next} email={sp.email} policyNote={policyNote} />
      <p className="mt-6 text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href={`/sign-in${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent-text hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

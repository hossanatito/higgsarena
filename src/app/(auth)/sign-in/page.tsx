import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/auth";
import { SignInForm } from "@/components/auth/forms";
import { SocialButtons } from "@/components/auth/social-buttons";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (ctx.state === "ok") redirect("/studio");
  const social = enabledSocialProviders();
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/studio";
  return (
    <div className="panel p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-[15px] text-fg-muted">Welcome back to the studio.</p>
      {sp.reset && <div className="mb-4"><Notice tone="ok">Password updated. Sign in with your new password.</Notice></div>}
      {process.env.DEMO_MODE === "true" && (
        <div className="mb-4">
          <Notice tone="info" title="Demo mode">
            Sign in as <code>owner@demo.local</code>, <code>admin@demo.local</code> or <code>member@demo.local</code> with password <code>arena-demo-password</code>.
          </Notice>
        </div>
      )}
      <SocialButtons google={social.google} github={social.github} next={next} />
      <SignInForm next={next} initialError={sp.error === "oauth" ? "That sign-in didn't work. Your email may not be invited yet." : undefined} />
      <p className="mt-6 text-center text-sm text-fg-muted">
        New here?{" "}
        <Link href={`/sign-up${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent-text hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

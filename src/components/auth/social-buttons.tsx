"use client";
import { useState } from "react";
import { GithubLogo, GoogleLogo } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";

export function SocialButtons({ google, github, next }: { google: boolean; github: boolean; next: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!google && !github) return null;
  const go = async (provider: "google" | "github") => {
    setBusy(provider);
    await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: "/sign-in?error=oauth" });
    setBusy(null);
  };
  return (
    <div className="grid gap-2.5">
      {google && (
        <Button size="lg" variant="secondary" onClick={() => go("google")} disabled={!!busy}>
          <GoogleLogo size={20} aria-hidden /> {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
      )}
      {github && (
        <Button size="lg" variant="secondary" onClick={() => go("github")} disabled={!!busy}>
          <GithubLogo size={20} aria-hidden /> {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
        </Button>
      )}
      <div className="my-2 flex items-center gap-3 text-[13px] text-fg-subtle">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

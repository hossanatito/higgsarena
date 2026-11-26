"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, safeNext } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { busy, error, setError, setBusy };
}

const message = (e: { message?: string; status?: number } | null | undefined, fallback: string) => {
  if (!e) return fallback;
  if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
  return e.message || fallback;
};

export function SignInForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const s = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    const { error } = await authClient.signIn.email({ email, password, rememberMe: true });
    s.setBusy(false);
    if (error) return s.setError(message(error, "Email or password is incorrect."));
    router.replace(safeNext(next));
    router.refresh();
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {(s.error || initialError) && <Notice tone="danger">{s.error ?? initialError}</Notice>}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={<span className="flex justify-between"><span>Password</span><Link href="/forgot-password" className="font-normal text-accent-text hover:underline">Forgot?</Link></span>} htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={s.busy}>
        {s.busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function SignUpForm({ next, email: initialEmail, policyNote }: { next?: string; email?: string; policyNote?: string }) {
  const router = useRouter();
  const s = useSubmit();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return s.setError("Use at least 10 characters for your password.");
    s.setBusy(true);
    s.setError(null);
    const { error } = await authClient.signUp.email({ name: name || email.split("@")[0]!, email, password, callbackURL: safeNext(next) });
    s.setBusy(false);
    if (error) return s.setError(message(error, "Could not create the account."));
    setDone(true);
    router.replace(safeNext(next));
    router.refresh();
  };
  if (done) return <Notice tone="ok" title="Account created">Taking you in…</Notice>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {s.error && <Notice tone="danger">{s.error}</Notice>}
      {policyNote && <p className="text-[13px] text-fg-subtle">{policyNote}</p>}
      <Field label="Name" htmlFor="name" optional>
        <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} readOnly={!!initialEmail} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters. Avoid common passwords.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={s.busy}>
        {s.busy ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const s = useSubmit();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    s.setBusy(false);
    if (error && error.status === 429) return s.setError(message(error, ""));
    // Same answer whether or not the account exists.
    setSent(true);
  };
  if (sent) return <Notice tone="ok" title="Check your inbox">If an account exists for {email}, a reset link is on its way. It works for one hour.</Notice>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {s.error && <Notice tone="danger">{s.error}</Notice>}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={s.busy}>
        {s.busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const s = useSubmit();
  const [password, setPassword] = useState("");
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    s.setBusy(false);
    if (error) return s.setError(message(error, "This reset link is invalid or has expired. Request a new one."));
    router.replace("/sign-in?reset=1");
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {s.error && <Notice tone="danger">{s.error}</Notice>}
      <Field label="New password" htmlFor="password" hint="At least 10 characters. Signing in again signs out your other devices.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={s.busy}>
        {s.busy ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <div className="grid gap-3">
      <Button
        variant="primary"
        size="lg"
        disabled={state === "busy" || state === "sent"}
        onClick={async () => {
          setState("busy");
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/studio" });
          setState(error ? "error" : "sent");
        }}
      >
        {state === "sent" ? "Email sent" : state === "busy" ? "Sending…" : "Resend verification email"}
      </Button>
      {state === "error" && <p className="text-sm text-danger">Could not send right now. Try again in a few minutes.</p>}
    </div>
  );
}

export function SignOutButton({ label = "Sign out", variant = "ghost" as const }: { label?: string; variant?: "ghost" | "secondary" }) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}

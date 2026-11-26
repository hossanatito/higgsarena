import Link from "next/link";
import { ForgotForm } from "@/components/auth/forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <div className="auth-card">
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1 mb-6 text-[15px] text-fg-muted">We'll email you a link that works for one hour.</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="font-medium text-accent-text hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { ResetForm } from "@/components/auth/forms";
import { Notice } from "@/components/ui";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token, error } = await searchParams;
  return (
    <div className="panel p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <div className="mt-6">
        {!token || error ? (
          <Notice tone="danger" title="This link is invalid or has expired">
            <Link href="/forgot-password" className="text-accent-text underline">Request a new reset link</Link>.
          </Notice>
        ) : (
          <ResetForm token={token} />
        )}
      </div>
    </div>
  );
}

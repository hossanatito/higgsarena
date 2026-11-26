import "server-only";
import { headers } from "next/headers";

export async function requestInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const trust = process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1";
  const forwarded = trust ? h.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

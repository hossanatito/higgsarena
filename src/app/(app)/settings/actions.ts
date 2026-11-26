"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { requireContext, actorOf } from "@/lib/session";
import { clientFor, deleteCredential, getPersonalCredentialRow, markCredential, parseKeyPair, saveCredential } from "@/lib/credentials";
import { HiggsfieldError } from "@/lib/higgsfield/errors";
import { hitRateLimit, LIMITS } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export type ActionResult = { ok: boolean; message: string };

const KeyInput = z.object({ keyId: z.string().trim().min(4).max(300), keySecret: z.string().trim().max(300).optional() });

export async function savePersonalKey(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.org.settings.personalKeysAllowed) return { ok: false, message: "Personal keys are turned off by your admins." };
  const parsed = KeyInput.safeParse({ keyId: form.get("keyId"), keySecret: form.get("keySecret") || undefined });
  if (!parsed.success) return { ok: false, message: "Enter your key ID and secret." };
  const key = parseKeyPair(parsed.data.keyId, parsed.data.keySecret);
  if (!key.secret) return { ok: false, message: "Enter the key secret too (or paste id:secret)." };
  const row = await saveCredential({ orgId: ctx.org.id, ownerType: "user", userId: ctx.user.id, key });
  await audit(actorOf(ctx), "personal_key.save", { type: "api_credential", id: row.id }, null, { hint: row.keyHint });
  revalidatePath("/settings");
  return { ok: true, message: "Key saved. Use “Test” to check it works." };
}

export async function testPersonalKey(): Promise<ActionResult> {
  const ctx = await requireContext();
  const rl = await hitRateLimit(`keytest:${ctx.user.id}`, LIMITS.keyTest.limit, LIMITS.keyTest.window);
  if (!rl.ok) return { ok: false, message: "Too many tests. Wait a minute." };
  const row = await getPersonalCredentialRow(ctx.org.id, ctx.user.id);
  if (!row) return { ok: false, message: "No personal key saved." };
  try {
    await clientFor(row).verify();
    await markCredential(row.id, { lastVerifiedAt: new Date(), lastError: null });
    revalidatePath("/settings");
    return { ok: true, message: "Key works." };
  } catch (e) {
    const message = e instanceof HiggsfieldError ? e.message : "Could not reach Higgsfield.";
    await markCredential(row.id, { lastError: message });
    revalidatePath("/settings");
    return { ok: false, message };
  }
}

export async function removePersonalKey(): Promise<ActionResult> {
  const ctx = await requireContext();
  const row = await getPersonalCredentialRow(ctx.org.id, ctx.user.id);
  if (row) {
    await deleteCredential(row.id);
    await audit(actorOf(ctx), "personal_key.remove", { type: "api_credential", id: row.id }, { hint: row.keyHint }, null);
  }
  revalidatePath("/settings");
  return { ok: true, message: "Key removed." };
}

export async function setNotifyOnFinish(value: boolean): Promise<ActionResult> {
  const ctx = await requireContext();
  await db.update(member).set({ notifyOnFinish: value }).where(eq(member.id, ctx.member.id));
  revalidatePath("/settings");
  return { ok: true, message: value ? "We'll email you when long videos finish." : "Finish emails turned off." };
}

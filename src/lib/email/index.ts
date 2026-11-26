import "server-only";
import { Resend } from "resend";
import { getSetting, getSettingSecrets, type EmailSettings } from "@/lib/settings";
import type { Email } from "./templates";

export type Provider = "resend" | "brevo";
export type SendAttempt = { provider: Provider | "console"; ok: boolean; error?: string };

type Config = { settings: EmailSettings; keys: { resend?: string; brevo?: string } };

async function config(): Promise<Config> {
  const { value } = await getSetting("email");
  const secrets = await getSettingSecrets("email");
  const keys = { resend: secrets.resendApiKey || process.env.RESEND_API_KEY, brevo: secrets.brevoApiKey || process.env.BREVO_API_KEY };
  const settings = { ...value };
  // .env fallback when nothing is configured in the console.
  if (!settings.primary) settings.primary = keys.resend ? "resend" : keys.brevo ? "brevo" : null;
  if (!settings.fallback && settings.primary) {
    const other: Provider = settings.primary === "resend" ? "brevo" : "resend";
    if (keys[other]) settings.fallback = other;
  }
  if (!settings.fromAddress && process.env.EMAIL_FROM) {
    const m = process.env.EMAIL_FROM.match(/^(.*)<(.+)>$/);
    settings.fromAddress = (m ? m[2] : process.env.EMAIL_FROM)!.trim();
    if (m && m[1]!.trim()) settings.fromName = m[1]!.trim().replace(/^"|"$/g, "");
  }
  return { settings, keys };
}

async function sendResend(key: string, s: EmailSettings, to: string, email: Email) {
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: `${s.fromName || "HiggsArena"} <${s.fromAddress}>`,
    to: [to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: s.replyTo || undefined,
  });
  if (error) throw new Error(`${error.name ?? "error"}: ${error.message}`);
}

async function sendBrevo(key: string, s: EmailSettings, to: string, email: Email) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: s.fromName || "HiggsArena", email: s.fromAddress },
      to: [{ email: to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      ...(s.replyTo ? { replyTo: { email: s.replyTo } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

const providers: Record<Provider, typeof sendResend> = { resend: sendResend, brevo: sendBrevo };

/**
 * Send an email through the primary provider, retrying once on the fallback.
 * Errors are logged with the provider's message, never the API key.
 */
export async function sendEmail(to: string, email: Email, opts: { only?: Provider } = {}): Promise<{ ok: boolean; attempts: SendAttempt[] }> {
  const { settings, keys } = await config();
  const order: Provider[] = opts.only
    ? [opts.only]
    : ([settings.primary, settings.fallback].filter((p, i, a): p is Provider => !!p && a.indexOf(p) === i) as Provider[]);
  const attempts: SendAttempt[] = [];

  if (order.length === 0 || !settings.fromAddress) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[email] No email provider configured; could not send "${email.subject}" to ${to}`);
      return { ok: false, attempts: [{ provider: "console", ok: false, error: "No email provider configured" }] };
    }
    console.info(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${email.subject}\n${email.text}\n`);
    return { ok: true, attempts: [{ provider: "console", ok: true }] };
  }

  for (const p of order) {
    const key = keys[p];
    if (!key) {
      attempts.push({ provider: p, ok: false, error: "API key not set" });
      continue;
    }
    try {
      await providers[p](key, settings, to, email);
      attempts.push({ provider: p, ok: true });
      if (attempts.length > 1) console.warn(`[email] Sent "${email.subject}" via fallback ${p}`, attempts);
      return { ok: true, attempts };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: p, ok: false, error });
      console.error(`[email] ${p} failed for "${email.subject}": ${error}`);
    }
  }
  return { ok: false, attempts };
}

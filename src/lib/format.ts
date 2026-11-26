/** Formatting helpers shared by server and client components. */
export function usd(value: string | number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const digits = opts.precise || (n > 0 && n < 0.1) ? 3 : 2;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return `${Math.round(v * 100)}%`;
}

export function num(v: number): string {
  return v.toLocaleString("en-US");
}

export function relativeTime(date: Date | string | null | undefined, now = Date.now()): string {
  if (!date) return "-";
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function dateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** "expires in 2 days" for Higgsfield-hosted outputs. */
export function expiryLabel(expiresAt: string | Date | null | undefined, now = Date.now()): { label: string; short: string; urgent: boolean; expired: boolean } | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  const ms = t - now;
  if (ms <= 0) return { label: "Expired", short: "Expired", urgent: true, expired: true };
  const hours = ms / 3_600_000;
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return { label: `Expires in ${h}h`, short: `${h}h left`, urgent: true, expired: false };
  }
  const days = Math.round(hours / 24);
  return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, short: `${days}d left`, urgent: days <= 2, expired: false };
}

import "server-only";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

/** DNS lookup that refuses private addresses. Used as the socket's lookup, so rebinding cannot slip past it. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (Array.isArray(addresses) ? addresses : [{ address: addresses as unknown as string, family: 4 }]) as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) return callback(Object.assign(new Error(`Blocked address for ${hostname}`), { code: "EBLOCKED" }), "", 4);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

export function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Only https URLs can be fetched");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("Private addresses are not allowed");
  }
  return url;
}

/**
 * GET an https URL as a stream, blocking private, loopback and link-local
 * targets (including after redirects).
 */
export function safeGet(raw: string, opts: { maxRedirects?: number; timeoutMs?: number } = {}): Promise<IncomingMessage> {
  const maxRedirects = opts.maxRedirects ?? 3;
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = assertSafeUrl(raw);
    } catch (e) {
      return reject(e);
    }
    const req = https.get(url, { lookup: safeLookup, timeout: opts.timeoutMs ?? 30_000, headers: { "user-agent": "HiggsArena/1.0" } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
        const next = new URL(res.headers.location, url).toString();
        return safeGet(next, { ...opts, maxRedirects: maxRedirects - 1 }).then(resolve, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`Fetch failed with HTTP ${status}`));
      }
      resolve(res);
    });
    req.on("timeout", () => req.destroy(new Error("Fetch timed out")));
    req.on("error", reject);
  });
}

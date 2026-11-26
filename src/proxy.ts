import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce Content-Security-Policy. Next.js applies the nonce to its
 * own scripts automatically when it finds it in the request's CSP header.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  // Development only: the local Higgsfield mock serves media over http.
  const mock = !isDev ? "" : (process.env.HF_API_BASE_URL ?? "").match(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/)?.[0] ?? "";
  const extra = mock ? ` ${mock}` : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by the motion library; no inline scripts are allowed.
    "style-src 'self' 'unsafe-inline'",
    // Generated media is served from Higgsfield's CDN or your own bucket.
    `img-src 'self' https: data: blob:${extra}`,
    `media-src 'self' https: blob:${extra}`,
    "font-src 'self'",
    // Browsers upload straight to presigned storage URLs.
    `connect-src 'self' https:${extra}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

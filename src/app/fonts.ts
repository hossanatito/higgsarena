import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

/** Figtree (SIL OFL 1.1), self-hosted: no runtime Google Fonts request. */
export const figtree = localFont({
  src: [
    { path: "./fonts/figtree-latin-wght-normal.woff2", weight: "300 900", style: "normal" },
    { path: "./fonts/figtree-latin-ext-wght-normal.woff2", weight: "300 900", style: "normal" },
  ],
  variable: "--font-figtree",
  display: "swap",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
});

export const geistMono = GeistMono;

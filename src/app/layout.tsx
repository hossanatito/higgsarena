import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { figtree, geistMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HiggsArena", template: "%s · HiggsArena" },
  description: "A self-hosted studio for the Higgsfield API with team budgets, model controls and analytics.",
  applicationName: "HiggsArena",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="en" data-theme={dataTheme} className={`${figtree.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

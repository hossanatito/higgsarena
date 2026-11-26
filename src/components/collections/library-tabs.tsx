import Link from "next/link";
import { cn } from "@/lib/cn";

/** Switch between all results and collections (handy on phones, where the sidebar is hidden). */
export function LibraryTabs({ active }: { active: "results" | "collections" }) {
  const item = (href: string, id: typeof active, label: string) => (
    <Link href={href} aria-current={active === id ? "page" : undefined} className={cn("h-9 rounded-full px-4 text-[13px] leading-9 font-medium transition-colors", active === id ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Library sections" className="mb-6 inline-flex rounded-full bg-surface-2 p-1">
      {item("/library", "results", "Results")}
      {item("/collections", "collections", "Collections")}
    </nav>
  );
}

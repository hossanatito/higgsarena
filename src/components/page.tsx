import type { ReactNode } from "react";
import { FooterNotice } from "@/components/footer-notice";
import { cn } from "@/lib/cn";

/** Standard page frame for everything except the studio. */
export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <main className={cn("mx-auto px-4 pt-6 pb-28 sm:px-6 lg:pt-10 lg:pb-12", wide ? "max-w-7xl" : "max-w-5xl", className)}>
      {children}
      <FooterNotice className="mt-16 border-t border-border pt-6" />
    </main>
  );
}

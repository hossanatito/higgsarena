/** Original HiggsArena mark: an arena ring with a rising particle. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <ellipse cx="16" cy="19.5" rx="9" ry="4.2" fill="none" stroke="var(--accent-fg)" strokeWidth="2.2" />
      <circle cx="16" cy="11" r="3.4" fill="var(--accent-fg)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark />
      <span className="text-[17px] font-bold tracking-tight text-fg">HiggsArena</span>
    </span>
  );
}

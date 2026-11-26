export function FooterNotice({ className }: { className?: string }) {
  return (
    <p className={`text-[12px] leading-relaxed text-fg-subtle ${className ?? ""}`}>
      HiggsArena is an independent open-source project that works with the Higgsfield API. It is not affiliated with or endorsed by Higgsfield.
    </p>
  );
}

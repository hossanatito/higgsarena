import type { Metadata } from "next";
import { LinkSimpleBreak } from "@phosphor-icons/react/ssr";
import { collectionByShareToken, publicItems } from "@/lib/collections";
import { requestInfo } from "@/lib/request-info";
import { hitRateLimit } from "@/lib/rate-limit";
import { LogoMark } from "@/components/logo";
import { FooterNotice } from "@/components/footer-notice";
import { ShareGallery } from "@/components/collections/share-gallery";

export const dynamic = "force-dynamic";

// Never indexed, and the token in the URL is never sent to other sites.
export const metadata: Metadata = { title: "Shared collection", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-fg-muted"><LinkSimpleBreak size={28} aria-hidden /></span>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] text-fg-muted">{body}</p>
    </main>
  );
}

export default async function SharedCollection({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { ip } = await requestInfo();
  const rl = await hitRateLimit(`share:${ip ?? "unknown"}`, 120, 60);
  let body: React.ReactNode;
  if (!rl.ok) {
    body = <Unavailable title="Slow down a little" body="Too many requests from your network. Try again in a minute." />;
  } else {
    const c = await collectionByShareToken(token);
    if (!c) {
      body = <Unavailable title="This link doesn't work" body="It may have expired or been turned off. Ask the person who shared it for a new one." />;
    } else {
      const items = await publicItems(c);
      body = (
        <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{c.name}</h1>
            {c.description && <p className="mt-2 text-[16px] leading-relaxed text-fg-muted">{c.description}</p>}
            <p className="mono mt-3 text-[12px] text-fg-subtle">{items.length} item{items.length === 1 ? "" : "s"}</p>
          </div>
          {items.length === 0 ? <p className="text-fg-muted">Nothing here yet.</p> : <ShareGallery items={items} />}
        </main>
      );
    }
  }
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-7xl items-center gap-2.5 px-4 safe-top sm:px-6">
        <LogoMark size={26} />
        <span className="text-[14px] text-fg-muted">Shared with HiggsArena</span>
      </header>
      {body}
      <footer className="mx-auto max-w-7xl border-t border-border px-4 py-6 sm:px-6"><FooterNotice /></footer>
    </div>
  );
}

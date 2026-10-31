/* An SEC page we hold no filings for yet (an insider, fund or company a crawler or an old link points at): it says
 * so, links the filer on SEC EDGAR and the pages that do have data, and isn't indexed. Better than a dead end. */
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";

export async function SecPending({ title, what, edgar }: { title: string; what: string; edgar: string }) {
  const viewer = await getViewer().catch(() => null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer?.user)} plan={viewer?.plan} tone="light" />
      <main className="wrap trail2" data-testid="sec-pending">
        <p className="trail2__code">SEC EDGAR</p>
        <h1 className="trail2__h">{title}</h1>
        <p className="trail2__p">Insidir doesn&apos;t hold any open-market Form 4 purchases or sales for {what} yet. When one is filed, it shows here within minutes.</p>
        <nav className="trail2__links" aria-label="Elsewhere">
          <a href={edgar} target="_blank" rel="noopener noreferrer">Their filings on SEC EDGAR</a>
          <Link href="/stocks">Insider buying</Link><Link href="/trackers/ceo-buys">CEO Purchases</Link><Link href="/open">Open now</Link>
        </nav>
      </main>
    </>
  );
}

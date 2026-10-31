/* One large position (/position/<id>): the card (headline, amount, who, where it stands), its analyst note under the
 * headline with the Sources toggle, and links to the market and the account. Visitors see positions 30 minutes late;
 * a newer one says so. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { moves as movesT } from "@/lib/db/schema";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { headlineOf } from "@/lib/moves/headline";
import { fromRow } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { eq } from "drizzle-orm";
import { GET_CTA } from "@/lib/copy";

export const dynamic = "force-dynamic";

async function load(raw: string) {
  const id = decodeURIComponent(raw);
  if (!hasDatabase() || id.length > 300) return null;
  const r = await getDb().select().from(movesT).where(eq(movesT.id, id)).limit(1).catch(() => []);
  return r[0] && !r[0].hiddenAt ? fromRow(r[0]) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = await load((await params).id);
  return { title: m ? headlineOf(m) : "Position", description: m ? `A large position on ${m.marketTitle}, with its analyst note and sources.` : undefined, robots: { index: false } };
}

export default async function PositionPage({ params }: { params: Promise<{ id: string }> }) {
  const m = await load((await params).id);
  if (!m) notFound();
  const viewer = await getViewer();
  const now = Date.now();
  const paid = isPaid(viewer.plan);
  const until = now - movePlan(viewer.plan).delayMs;
  const trial = unlockHref();
  const tooNew = m.at > until;
  const [item] = tooNew ? [] : await feedItems(getDb(), [m], viewer.plan, viewer.region, now);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/position" />
      <main className="wrap app2 position">
        {item ? (
          <>
            <h1 className="sr-only">{item.headline}</h1>
            <MoveCard m={item} follow={paid ? "off" : "locked"} trialHref={trial} />
            <AsOf at={until} live={paid} sources={[m.source === "sec" ? SOURCES.sec : m.source === "polymarket" ? SOURCES.polymarket : SOURCES.kalshi, SOURCES.methodology]} />
            <p className="position__links">
              {m.source !== "sec" ? <Link className="tlink tlink--go" href={`/market/${encodeURIComponent(m.marketId)}`}>The market and everyone in it <span className="arrow" aria-hidden="true">→</span></Link> : null}
              {m.wallet ? <Link className="tlink tlink--go" href={`/p/${m.wallet}`}>This account&apos;s record <span className="arrow" aria-hidden="true">→</span></Link> : null}
            </p>
          </>
        ) : (
          <section className="empty">
            <h1 className="empty__h">This position is still live</h1>
            <p className="muted small">Visitors see large positions 30 minutes after they&apos;re placed. Members see them as they happen, with the analyst note.</p>
            <div className="row-gap"><Link className="btn btn--primary" href={trial}>{GET_CTA}</Link></div>
          </section>
        )}
      </main>
    </>
  );
}

/* One page per thing Insidir tracks (/sports, /markets, /stocks), all on one template so they read as one product:
 * the header band, what it is in one line, the latest real big moves from that tab (the same cards as the feed),
 * what every card tells you, where the numbers come from, then one action: Get Insidir (members: the live feed on that tab).
 * Every move is a row from terminal.moves on the viewer's clock (free: 30 minutes late). Server component. */
import Link from "next/link";
import type { ReactNode } from "react";
import { PageBand } from "@/components/PageBand";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isMainstream } from "@/lib/home/curate";
import { memo } from "@/lib/memo";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { listMoves } from "@/lib/moves/store";
import type { PhotoN } from "@/components/Photo";
import { CANCEL_LINE, GET_CTA } from "@/lib/copy";
import { isPaid } from "@/lib/plans";

export interface ProductCopy {
  tab: "sports" | "markets" | "stocks";
  photo: PhotoN;
  title: string;
  /** One line under the title, on the band. */
  line: string;
  /** What we cover, as short chips. */
  covers: string[];
  /** What every card tells you: [heading, one line]. */
  card: Array<[string, string]>;
  /** Where it comes from: [source, one line]. */
  sources: Array<[string, ReactNode]>;
}

export async function ProductPage({ copy }: { copy: ProductCopy }) {
  const viewer = await getViewer();
  const now = Date.now();
  const until = now - movePlan(viewer.plan).delayMs;
  const trial = unlockHref();
  const items: FeedItem[] = hasDatabase()
    ? await memo(`product:${copy.tab}:${viewer.plan}:${viewer.region ?? ""}`, 15_000, async () => {
      const db = getDb();
      const list = (await listMoves(db, { tab: copy.tab, until, limit: 120 })).filter(isMainstream).slice(0, 4);
      return feedItems(db, list, viewer.plan, viewer.region, now);
    }).catch(() => [])
    : [];
  const feed = `/feed?tab=${copy.tab}`;
  const paid = isPaid(viewer.plan);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current={`/${copy.tab}`} trialHref={trial} />
      <main className="dark mkt">
        <PageBand n={copy.photo} title={copy.title} kicker="What we track">
          <p className="pband__sub">{copy.line}</p>
        </PageBand>
        <section className="sec2" aria-labelledby="covers-h">
          <div className="wrap prod__intro">
            <h2 id="covers-h" className="sr-only">What we cover</h2>
            <ul className="prod__covers">{copy.covers.map(c => <li key={c}>{c}</li>)}</ul>
            <div className="mkt__ctas">{paid ? <Link className="btn btn--primary" href={feed}>See the live {copy.title.toLowerCase()} feed</Link>
              : <><Link className="btn btn--primary" href={trial} data-checkout={`product-${copy.tab}`}>{GET_CTA}</Link><span className="mkt__fine">{CANCEL_LINE}</span></>}</div>
          </div>
        </section>
        <section className="sec2" aria-labelledby="latest-h">
          <div className="wrap">
            <div className="prod__head">
              <h2 id="latest-h" className="sec2__h">Latest big moves</h2>
              {!paid ? <p className="prod__note">Preview: 30 minutes late</p> : null}
            </div>
            {items.length ? (
              <ol className="prod__list">{items.map((m, i) => <li key={m.id} className="rv" style={{ ["--i" as string]: i }}><MoveCard m={m} follow={paid ? "off" : "locked"} trialHref={trial} compact /></li>)}</ol>
            ) : <p className="mkt__lead">Catching up with the source. The next big move shows up here the moment it lands.</p>}
            <p className="prod__more"><Link href={paid ? feed : trial}>{paid ? "See every move on the live feed" : "See every move live with Insidir"} <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
        <section className="sec2" aria-labelledby="card-h">
          <div className="wrap">
            <h2 id="card-h" className="sec2__h">What every card tells you</h2>
            <ol className="prod__grid">{copy.card.map(([h, p], i) => (
              <li key={h} className="prod__tile rv" style={{ ["--i" as string]: i }}><span className="prod__n">{i + 1}</span><p className="prod__h">{h}</p><p className="prod__p">{p}</p></li>
            ))}</ol>
          </div>
        </section>
        <section className="sec2" aria-labelledby="src-h">
          <div className="wrap">
            <h2 id="src-h" className="sec2__h">Where it comes from</h2>
            <div className="prod__grid prod__grid--2">{copy.sources.map(([h, p]) => (
              <div key={h} className="prod__tile"><p className="prod__h">{h}</p><p className="prod__p">{p}</p></div>
            ))}</div>
            <p className="prod__more"><Link href="/data">How we check every number <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
        <section className="sec2">
          <div className="wrap mkt__endIn">
            <h2 className="sec2__h">Follow the big money.</h2>
            <p className="mkt__lead">{GET_CTA}. {CANCEL_LINE}</p>
            <div className="mkt__ctas"><Link className="btn btn--primary" href={paid ? feed : trial}>{paid ? "See the live feed" : GET_CTA}</Link><Link className="btn btn--secondary" href="/pricing">See pricing</Link></div>
          </div>
        </section>
      </main>
    </>
  );
}

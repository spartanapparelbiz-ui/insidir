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
import { ScrollOffer } from "@/components/home/ScrollOffer";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isMainstream } from "@/lib/home/curate";
import { memo } from "@/lib/memo";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { listMoves } from "@/lib/moves/store";
import type { PhotoN } from "@/components/Photo";
import { CANCEL_LINE, GAMBLER, GET_CTA, PAST } from "@/lib/copy";
import { isPaid } from "@/lib/plans";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { TrackerTile } from "@/components/trackers/Tracker";
import { coverStats } from "@/components/trackers/TrackerCover";
import { isReady } from "@/lib/features";
import { marketPreview, type ProofItem } from "@/lib/markets/preview";
import { visibleTrackers, type TrackerGroup, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";

/** Each page's tracker group, and the sources its numbers come from. */
const GROUP: Record<ProductCopy["tab"], TrackerGroup> = { sports: "Leagues", markets: "Topics", stocks: "Stocks" };
const SRC = { sports: [SOURCES.polymarket, SOURCES.kalshi], markets: [SOURCES.polymarket, SOURCES.kalshi], stocks: [SOURCES.sec] } as const;

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
  const [proof, stats] = hasDatabase()
    ? await Promise.all([
      memo(`product-proof:${copy.tab}`, 60_000, () => marketPreview(getDb(), copy.tab, viewer.plan, viewer.region, now).then(p => p.proof)).catch((): ProofItem[] => []),
      trackerStats(getDb(), now).catch(() => new Map<TrackerSlug, TrackerStats>()),
    ])
    : [[] as ProofItem[], new Map<TrackerSlug, TrackerStats>()];
  const trackers = visibleTrackers(isReady).filter(t => t.group === GROUP[copy.tab]);
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
              : <><Link className="btn btn--primary" href={trial} data-checkout={`product-${copy.tab}`}>{GET_CTA}</Link><span className="mkt__fine">{CANCEL_LINE} Secure sign-in and payments by Whop.</span></>}</div>
          </div>
        </section>
        <section className="sec2" aria-labelledby="latest-h">
          <div className="wrap">
            <div className="prod__head">
              <h2 id="latest-h" className="sec2__h">Latest large positions</h2>
              {!paid ? <p className="prod__note">Preview: 30 minutes late</p> : null}
            </div>
            {items.length ? (
              <ol className="prod__list">{items.map((m, i) => <li key={m.id} className="rv" style={{ ["--i" as string]: i }}><MoveCard m={m} follow={paid ? "off" : "locked"} trialHref={trial} compact /></li>)}</ol>
            ) : <p className="mkt__lead">Catching up with the source. The next large position shows up here the moment it lands.</p>}
            <AsOf at={until} live={paid} sources={[...SRC[copy.tab]]} />
            <p className="prod__more"><Link href={paid ? feed : trial}>{paid ? "See every position in Activity" : "See every position live with Insidir"} <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
        {trackers.length ? (
          <section className="sec2" aria-labelledby="trk-h">
            <div className="wrap">
              <h2 id="trk-h" className="sec2__h">Trackers</h2>
              <ul className="tgrid" data-testid="product-trackers">
                {trackers.map((t, i) => { const st = stats.get(t.slug); return <TrackerTile key={t.slug} t={t} r={st?.records.all ?? null} tracked30d={st?.tracked30d ?? 0} s={coverStats(st)} i={Math.min(i, 5)} />; })}
              </ul>
              <p className="prod__fine">{PAST} Followable ROI: $100 on every position at the price Insidir showed it, plus one point. <Link href="/methodology">How it&apos;s computed</Link></p>
            </div>
          </section>
        ) : null}
        {proof.length ? (
          <section className="sec2" aria-labelledby="proof-h">
            <div className="wrap">
              <h2 id="proof-h" className="sec2__h">By the numbers</h2>
              <dl className="proof__grid" data-testid="product-proof">
                {proof.map(p => <div key={p.label} className="proof__item"><dt>{p.label}</dt><dd className="proof__v">{p.value}</dd>{p.note ? <dd className="proof__note">{p.note}</dd> : null}</div>)}
              </dl>
              <AsOf at={now} live={paid} sources={[...SRC[copy.tab], SOURCES.methodology]} />
            </div>
          </section>
        ) : null}
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
            <p className="mkt__lead">{GET_CTA}. {CANCEL_LINE} Secure sign-in and payments by Whop.</p>
            {copy.tab === "sports" ? <p className="prod__fine" data-testid="gambler">{GAMBLER}</p> : null}
            <div className="mkt__ctas"><Link className="btn btn--primary" href={paid ? feed : trial}>{paid ? "Open Activity" : GET_CTA}</Link><Link className="btn btn--secondary" href="/pricing">See pricing</Link></div>
          </div>
        </section>
      </main>
      {paid ? null : <ScrollOffer where={copy.tab} />}
    </>
  );
}

/* One page per thing Insidir tracks (/sports, /markets, /stocks), all on one template so they read as one product:
 * the page head, what it is in one line, the latest real big moves from that tab (the same cards as the feed),
 * what every card tells you, where the numbers come from, then one action: Start for $1 (members: the live feed on that tab).
 * Every move is a row from terminal.moves on the viewer's clock (free: 30 minutes late). Server component. */
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHead, Sec } from "@/components/page/Page";
import { RevealGroup } from "@/components/motion/Reveal";
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
import { CANCEL_LINE, GAMBLER, PAST } from "@/lib/copy";
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
      <main className="lp3 pgpage">
        <PageHead kicker="What we track" title={copy.title} sub={copy.line} />
        <div className="pg prod__intro">
          <p className="prod__covers" data-testid="product-covers">{copy.covers.join(" · ")}</p>
          <div className="mkt__ctas">{paid ? <Link className="btn btn--primary" href={feed}>See the live {copy.title.toLowerCase()} feed</Link>
            : <><Link className="btn btn--primary" href={trial} data-checkout={`product-${copy.tab}`}>Start for $1</Link><span className="mkt__fine">{CANCEL_LINE} Secure sign-in and payments by Whop.</span></>}</div>
        </div>
        <Sec id="latest-h" title="Latest large positions" sub={!paid ? "Preview: 30 minutes late" : undefined}>
          {items.length ? (
            <RevealGroup as="ol" className="prod__list">{items.map(m => <li key={m.id}><MoveCard m={m} follow={paid ? "off" : "locked"} trialHref={trial} compact /></li>)}</RevealGroup>
          ) : <p className="mkt__lead">Catching up with the source. The next large position shows up here the moment it lands.</p>}
          <AsOf at={until} live={paid} sources={[...SRC[copy.tab]]} />
          <p className="prod__more"><Link href={paid ? feed : trial}>{paid ? "See every position in Activity" : "See every position live with Insidir"} <span aria-hidden="true">→</span></Link></p>
        </Sec>
        {trackers.length ? (
          <Sec id="trk-h" title="Trackers">
            <ul className="tgrid" data-testid="product-trackers">
              {trackers.map((t, i) => { const st = stats.get(t.slug); return <TrackerTile key={t.slug} t={t} r={st?.records.all ?? null} tracked30d={st?.tracked30d ?? 0} s={coverStats(st)} i={Math.min(i, 5)} />; })}
            </ul>
            <p className="prod__fine">{PAST} Followable ROI: $100 on every position at the price Insidir showed it, plus one point. <Link href="/methodology">How it&apos;s computed</Link></p>
          </Sec>
        ) : null}
        {proof.length ? (
          <Sec id="proof-h" title="By the numbers">
            <RevealGroup as="dl" className="proof__grid" data-testid="product-proof">
              {proof.map(p => <div key={p.label} className="proof__item"><dt>{p.label}</dt><dd className="proof__v">{p.value}</dd>{p.note ? <dd className="proof__note">{p.note}</dd> : null}</div>)}
            </RevealGroup>
            <AsOf at={now} live={paid} sources={[...SRC[copy.tab], SOURCES.methodology]} />
          </Sec>
        ) : null}
        <Sec id="card-h" title="What every card tells you">
          <RevealGroup as="ol" className="prod__grid">{copy.card.map(([h, p], i) => (
            <li key={h} className="prod__tile"><span className="prod__n">{i + 1}</span><p className="prod__h">{h}</p><p className="prod__p">{p}</p></li>
          ))}</RevealGroup>
        </Sec>
        <Sec id="src-h" title="Where it comes from">
          <RevealGroup className="prod__grid prod__grid--2">{copy.sources.map(([h, p]) => (
            <div key={h} className="prod__tile"><p className="prod__h">{h}</p><p className="prod__p">{p}</p></div>
          ))}</RevealGroup>
          <p className="prod__more"><Link href="/data">How we check every number <span aria-hidden="true">→</span></Link></p>
        </Sec>
        <Sec id="end-h" title="Follow the big money.">
          <p className="mkt__lead">Your first week is $1, then $39/month. Cancel anytime. Secure sign-in and payments by Whop.</p>
          {copy.tab === "sports" ? <p className="prod__fine" data-testid="gambler">{GAMBLER}</p> : null}
          <div className="mkt__ctas sec3__foot"><Link className="btn btn--primary" href={paid ? feed : trial}>{paid ? "Open Activity" : "Start for $1"}</Link><Link className="btn btn--secondary" href="/pricing">See pricing</Link></div>
        </Sec>
      </main>
    </>
  );
}

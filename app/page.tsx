/* The home page, all about Insidir's own product, all real data:
 *   1. Hero: "Follow the big money.", one line, Start your 7-day trial (the one black button) and Explore trackers.
 *   2. Three laptops (Sports, Prediction markets, Stocks; components/home/Laptops.tsx) whose screens are live Insidir
 *      previews; a click opens the market's panel. Crypto is one "Crypto · Soon" line under them.
 *   3. Open now from winning trackers (lib/follow/open.ts): the 3 newest for visitors and how many more.
 *   4. Leaderboard preview: the top 5 trackers by followable ROI on 30+ settled.
 *   5. How Insidir works, in 3 steps.
 *   6. The live proof strip (lib/home/proof.ts): 30-day volume, positions this week, accounts with a verified record,
 *      the last accuracy check.
 *   7. Track record (components/TrustBlock.tsx), a pricing teaser, FAQ.
 * Every block of numbers carries its data stamp (as of, source, 30-min delay or live). Members open on Discover. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { Discover } from "@/components/home/Discover";
import { HeroCta } from "@/components/home/HeroCta";
import { Laptops } from "@/components/home/Laptops";
import { OpenNow } from "@/components/follow/OpenNow";
import { tone } from "@/components/stats/Stats";
import { TrackerCover, coverStats } from "@/components/trackers/TrackerCover";
import { TrustBlock } from "@/components/TrustBlock";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { LOGO } from "@/components/Wordmark";
import { PAST } from "@/lib/copy";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { isReady } from "@/lib/features";
import { hundredLine, MIN_SETTLED, roiText, type FollowRecord } from "@/lib/follow/math";
import { openFromWinners, type OpenRow } from "@/lib/follow/open";
import { proofStrip, type Proof } from "@/lib/home/proof";
import { marketPreviews, type MarketKind, type MarketPreview } from "@/lib/markets/preview";
import { movePlan } from "@/lib/moves/gate";
import { short as money } from "@/lib/moves/headline";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { visibleTrackers, type Tracker, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";
import { trustFacts, type TrustFacts } from "@/lib/trust";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

const NO_MARKET = (kind: MarketKind, now: number): MarketPreview => ({ kind, rows: [], total: 0, window: "", proof: [], live: false, at: now });
interface Board { t: Tracker; s: TrackerStats | undefined; r: FollowRecord }
interface HomeData { markets: Record<MarketKind, MarketPreview>; board: Board[]; open: { rows: OpenRow[]; total: number }; proof: Proof | null; trust: TrustFacts | null }
const empty = (now: number): HomeData => ({
  markets: { sports: NO_MARKET("sports", now), markets: NO_MARKET("markets", now), stocks: NO_MARKET("stocks", now), crypto: NO_MARKET("crypto", now) },
  board: [], open: { rows: [], total: 0 }, proof: null, trust: null,
});

/** The top 5 trackers by followable ROI, all time, among those with 30+ settled (the same ranking as /top). */
function topFive(stats: Map<TrackerSlug, TrackerStats>): Board[] {
  return visibleTrackers(isReady).filter(t => t.kind === "bets").map(t => {
    const a = stats.get(t.slug)?.records.all;
    return { t, s: stats.get(t.slug), r: a ? { n: a.won + a.lost, won: a.won, lost: a.lost, staked: a.staked ?? 0, net: a.net } : null };
  }).filter((x): x is Board => Boolean(x.r && x.r.n >= MIN_SETTLED && x.r.staked > 0))
    .sort((a, b) => b.r.net / b.r.staked - a.r.net / a.r.staked).slice(0, 5);
}

async function homeData(db: Db, plan: Plan, region: Region | null, now: number): Promise<HomeData> {
  const [stats, markets, open, proof, trust] = await Promise.all([
    trackerStats(db, now).catch(() => new Map<TrackerSlug, TrackerStats>()),
    marketPreviews(db, plan, region, now),
    openFromWinners(db, plan, now).catch(() => ({ rows: [], total: 0 })),
    proofStrip(db, now).catch(() => null),
    trustFacts(db).catch(() => null),
  ]);
  return { markets, board: topFive(stats), open, proof, trust };
}

const STEPS = [
  ["We read every public trade and filing.", "Large positions on Polymarket and Kalshi as they're placed, and SEC Form 4 and 13F filings as they're published."],
  ["We verify each one against the source.", "Every row links its source, and every hour we re-read random positions from it. Anything that doesn't match is hidden until it does."],
  ["You follow the trackers with real records.", "Each tracker is a live portfolio with a public record: what $100 on every position would have made, losses included."],
] as const;

function ProofStrip({ p, live }: { p: Proof; live: boolean }) {
  const a = p.accuracy;
  const ago = a ? Math.max(1, Math.round((p.at - a.runAt) / 60_000)) : null;
  const items = [
    { label: "Volume tracked, last 30 days", value: money(p.volume30d), testid: "proof-volume" },
    { label: "Large positions this week", value: p.positionsWeek.toLocaleString("en-US"), testid: "proof-week" },
    { label: "Accounts with a verified record", value: p.verifiedAccounts.toLocaleString("en-US"), testid: "proof-accounts" },
    { label: "Last accuracy check", value: a ? `${a.ok} of ${a.checked}` : "—", note: a ? `positions matched the source, ${ago! < 60 ? `${ago} min` : `${Math.round(ago! / 60)} h`} ago` : "Runs every hour", testid: "proof-check" },
  ];
  return (
    <section className="sec3 proof" aria-labelledby="proof-h">
      <div className="wrap">
        <h2 id="proof-h" className="sec3__h">Insidir, live</h2>
        <dl className="proof__grid">
          {items.map(i => <div key={i.label} className="proof__item" data-testid={i.testid}><dt>{i.label}</dt><dd className="num">{i.value}</dd>{i.note ? <dd className="proof__note">{i.note}</dd> : null}</div>)}
        </dl>
        <AsOf at={p.at} live={live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.sec, { label: "Accuracy checks", href: "/data" }]} />
      </div>
    </section>
  );
}

export default async function Home() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  // Members open the app on Trackers; a new member goes through onboarding first, once.
  if (paid && viewer.user && !viewer.user.onboarded) redirect("/onboarding");
  if (paid) {
    return (
      <>
        <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/discover" trialHref={unlockHref()} />
        <Discover db={hasDatabase() ? getDb() : null} viewer={viewer} now={now} />
      </>
    );
  }
  const live = movePlan(viewer.plan).delayMs === 0;
  // Every visitor on the same plan and region sees the same home page: computed once per 15 seconds.
  const { markets, board, open, proof, trust } = hasDatabase()
    ? await memo(`home:${viewer.plan}:${viewer.region ?? ""}`, 15_000, () => homeData(getDb(), viewer.plan, viewer.region, now))
    : empty(now);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref();

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h">
          <div className="wrap hero3__in">
            <span className="hero3__mark rise" style={{ ["--i" as string]: 0 }} aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h rise" style={{ ["--i" as string]: 1 }}>Follow the big money.</h1>
            <p className="hero3__sub rise" style={{ ["--i" as string]: 2 }}>Insidir tracks every large position on Polymarket, Kalshi and SEC filings, and shows what following each tracker would have made.</p>
            <div className="hero3__acts rise" style={{ ["--i" as string]: 3 }}><HeroCta trialHref={trial} /></div>
          </div>
          <Laptops data={markets} trialHref={trial} signedIn={Boolean(viewer.user)} />
        </section>

        <section className="sec3" aria-labelledby="open-h">
          <div className="wrap">
            <h2 id="open-h" className="sec3__h">Open now from winning trackers</h2>
            <p className="tcol__note">Positions still open from trackers and traders with a positive followable return on 30 or more settled. {PAST}</p>
            <OpenNow rows={open.rows} total={open.total} member={false} now={now} trialHref={trial} />
            <AsOf at={now} live={live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />
          </div>
        </section>

        <section className="sec3" aria-labelledby="board-h">
          <div className="wrap">
            <h2 id="board-h" className="sec3__h">Leaderboard</h2>
            <p className="tcol__note">The top trackers by followable ROI: $100 on every position at the price Insidir showed it, plus a point of slippage. 30 or more settled. {PAST}</p>
            {board.length ? (
              <ol className="board__list" data-testid="home-board">
                {board.map(({ t, s, r }, i) => (
                  <li key={t.slug} className="board__row">
                    <span className="board__rank">{i + 1}</span>
                    <Link href={`/trackers/${t.slug}`} className="board__art"><TrackerCover t={t} s={coverStats(s)} small /></Link>
                    <span className="board__who"><Link href={`/trackers/${t.slug}`} className="board__name">{t.name}</Link><span className="board__line">{hundredLine(r)}</span></span>
                    <span className="board__fig"><b className={tone(r.net)}>{roiText(r.net, r.staked)}</b><span>{r.n.toLocaleString("en-US")} settled</span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="tlist__empty">No tracker has 30 settled positions yet. Each tracker&apos;s page shows its record so far.</p>}
            <AsOf at={now} live={live} sources={[SOURCES.methodology]} />
            <div className="sec3__foot"><Link className="tlink tlink--go" href="/top">See the full leaderboard <span className="arrow" aria-hidden="true">→</span></Link></div>
          </div>
        </section>

        <section className="sec3 steps" aria-labelledby="steps-h">
          <div className="wrap">
            <h2 id="steps-h" className="sec3__h">How Insidir works</h2>
            <ol className="steps__list">
              {STEPS.map(([h, p], i) => <li key={h} className="steps__item"><span className="steps__n num">{i + 1}</span><h3 className="steps__h">{h}</h3><p className="steps__p">{p}</p></li>)}
            </ol>
            <div className="sec3__foot"><Link className="tlink tlink--go" href="/methodology">Read the methodology <span className="arrow" aria-hidden="true">→</span></Link></div>
          </div>
        </section>

        {proof ? <ProofStrip p={proof} live={live} /> : null}

        <TrustBlock facts={trust} now={now} />
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} href={trial} actions={false} title="One plan. Every tracker." />
        <FaqV2 />
      </main>
    </>
  );
}

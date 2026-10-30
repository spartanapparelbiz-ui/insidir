/* The home page: one centred hero (the logo mark, "Follow the big money.", one line, one black button "Explore
 * trackers →" with a text link to the track record); "Four markets. One membership." (four laptops whose screens are live
 * previews of sports, prediction markets, stocks and crypto, components/home/Laptops.tsx); "A live
 * portfolio of big money" (one tracker: what it holds now and its latest results); "Featured"; two columns, "Top
 * performers" by window and "Popular"; pricing; FAQ. Home lists lead with stocks, then prediction markets, then sports.
 * Under the hero, "Open now from winning trackers" (lib/follow/open.ts): the 3 newest open positions from trackers and
 * traders with a positive followable record on 30+ settled, and how many more (all of them on /open for members).
 * Every number is a row from terminal.moves on the viewer's clock (free: 30 minutes late), and a tracker's record is
 * what following it would have made (lib/follow). Nothing is made up: a market with nothing yet says so, a
 * tracker with under 30 settled says "Building record · N of 30", one with none yet isn't listed, and a losing tracker
 * is never the live portfolio. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Discover } from "@/components/home/Discover";
import { OpenNow } from "@/components/follow/OpenNow";
import { dedupe, openFromWinners, type OpenRow } from "@/lib/follow/open";
import { PAST } from "@/lib/copy";
import { HeroCta } from "@/components/home/HeroCta";
import { LivePortfolio, type PortfolioData } from "@/components/home/LivePortfolio";
import { Laptops } from "@/components/home/Laptops";
import { PeriodTabs } from "@/components/trackers/PeriodTabs";
import { TrackerFeature, TrackerRow } from "@/components/trackers/Tracker";
import { coverStats } from "@/components/trackers/TrackerCover";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { LOGO } from "@/components/Wordmark";
import { countsToRecord } from "@/lib/trust";
import { marketPreviews, type MarketKind, type MarketPreview } from "@/lib/markets/preview";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { FEATURED, homeOrder, PERIODS, popular, topPerformers, trackerBySlug, visibleTrackers, type TrackerSlug } from "@/lib/trackers";
import { isReady } from "@/lib/features";
import { trackerHoldings, trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A tracker with at least one settled, followable position (its record or "Building record · N of 30" to show). */
const hasSettled = (s: TrackerStats | undefined): boolean => Boolean(s && s.records.all.won + s.records.all.lost > 0);

interface HomeData { markets: Record<MarketKind, MarketPreview>; stats: Map<TrackerSlug, TrackerStats>; portfolio: PortfolioData | null; open: { rows: OpenRow[]; total: number } }
const NO_MARKET = (kind: MarketKind): MarketPreview => ({ kind, rows: [], total: 0, window: "", proof: [], live: false });
const EMPTY: HomeData = { markets: { sports: NO_MARKET("sports"), markets: NO_MARKET("markets"), stocks: NO_MARKET("stocks"), crypto: NO_MARKET("crypto") }, stats: new Map(), portfolio: null, open: { rows: [], total: 0 } };

/** The live portfolio: the best tracker by ROI with a record (bets only), else Whales; its largest open positions and
 *  its latest settled results. */
async function portfolioData(db: Db, stats: Map<TrackerSlug, TrackerStats>, plan: Plan, region: Region | null, until: number, now: number): Promise<PortfolioData | null> {
  const shown = visibleTrackers(isReady).filter(t => t.kind === "bets");
  // Only a tracker that made money for anyone following it; none yet, no live portfolio.
  const best = topPerformers(shown.map(t => ({ t, slug: t.slug, record: stats.get(t.slug)?.records.all ?? null }))).find(x => (x.record?.net ?? 0) > 0)?.t;
  if (!best) return null;
  const [holdings, open, settled] = await Promise.all([
    trackerHoldings(db, until, now).catch(() => new Map()),
    trackerMoves(db, best, { until, since: now - 60 * 86_400_000, byAmount: true, limit: 12 }).then(l => l.filter(m => !m.result).slice(0, 4)).catch(() => []),
    trackerMoves(db, best, { settled: true, source: "polymarket", limit: 20 }).then(l => l.filter(m => countsToRecord(m)).slice(0, 4)).catch(() => []),
  ]);
  const [o, r] = await Promise.all([feedItems(db, open, plan, region, now).catch(() => []), feedItems(db, settled, plan, region, now, now).catch(() => [])]);
  const h = holdings.get(best.slug);
  const s = stats.get(best.slug);
  return { t: best, record: s?.records.all ?? null, cover: coverStats(s), open: o, results: r, openCount: h?.open ?? o.length, openAmount: h?.amount ?? o.reduce((a, m) => a + m.amount, 0) };
}

async function homeData(db: Db, plan: Plan, region: Region | null, until: number, now: number): Promise<HomeData> {
  const stats = await trackerStats(db, now).catch(() => new Map<TrackerSlug, TrackerStats>());
  return {
    stats,
    markets: await marketPreviews(db, plan, region, now),
    open: await openFromWinners(db, plan, now).catch(() => ({ rows: [], total: 0 })),
    portfolio: await portfolioData(db, stats, plan, region, until, now).catch(() => null),
  };
}

export default async function Home() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  // Members open the app on Trackers; a new member goes through onboarding first (three skippable screens), once.
  if (paid && viewer.user && !viewer.user.onboarded) redirect("/onboarding");
  if (paid) {
    return (
      <>
        <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/discover" trialHref={unlockHref()} />
        <Discover db={hasDatabase() ? getDb() : null} viewer={viewer} now={now} />
      </>
    );
  }
  const plan = movePlan(viewer.plan);
  const until = now - plan.delayMs;
  // Every visitor on the same plan and region sees the same home page: computed once per 15 seconds.
  const { markets, stats, portfolio, open } = hasDatabase()
    ? await memo(`home:${viewer.plan}:${viewer.region ?? ""}`, 15_000, () => homeData(getDb(), viewer.plan, viewer.region, until, now))
    : EMPTY;
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref();

  // No wall of "Building record · 0 of 30": a tracker shows here once it has a settled position.
  const rows = visibleTrackers(isReady).filter(t => hasSettled(stats.get(t.slug))).map(t => ({ t, s: stats.get(t.slug) }));
  const periodTabs = PERIODS.map(p => {
    const ranked = homeOrder(topPerformers(rows.map(({ t, s }) => ({ t, s, slug: t.slug, record: s?.records[p.key] ?? null }))).slice(0, 6));
    return {
      key: p.key, label: p.label,
      body: ranked.length ? <ol className="tlist">{ranked.map(({ t, s, record }) => <TrackerRow key={t.slug} t={t} r={record} s={coverStats(s)} />)}</ol>
        : <p className="tlist__empty">No tracker has 30 settled positions in this window yet.</p>,
    };
  });
  const pop = homeOrder(popular(rows.filter(r => r.s).map(({ t, s }) => ({ t, s, followers: s!.followers, tracked30d: s!.tracked30d }))).slice(0, 6));

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h">
          <div className="wrap hero3__in">
            <span className="hero3__mark rise" style={{ ["--i" as string]: 0 }} aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h rise" style={{ ["--i" as string]: 1 }}>Follow the big money.</h1>
            <p className="hero3__sub rise" style={{ ["--i" as string]: 2 }}>Trackers follow large positions on Polymarket, Kalshi and SEC filings as they are opened and settled. Each one is a live portfolio with a public track record.</p>
            <div className="hero3__acts rise" style={{ ["--i" as string]: 3 }}><HeroCta /></div>
          </div>
          <Laptops data={markets} trialHref={trial} signedIn={Boolean(viewer.user)} />
        </section>

        <section className="sec3" aria-labelledby="open-h">
          <div className="wrap">
            <h2 id="open-h" className="sec3__h">Open now from winning trackers</h2>
            <p className="tcol__note">Positions still open from trackers and traders with a positive followable return on 30 or more settled. {PAST}</p>
            <OpenNow rows={open.rows} total={open.total} member={false} now={now} trialHref={trial} />
            <div className="sec3__foot"><Link className="tlink tlink--go" href="/top">See the leaderboard <span className="arrow" aria-hidden="true">→</span></Link></div>
          </div>
        </section>

        {portfolio ? <LivePortfolio d={portfolio} /> : null}

        <section className="sec3" aria-labelledby="feat-h">
          <div className="wrap">
            <h2 id="feat-h" className="sec3__h">Featured</h2>
            <div className="tfeats">
              {FEATURED.map((slug, i) => <TrackerFeature key={slug} t={trackerBySlug(slug)!} s={coverStats(stats.get(slug))} i={i} />)}
            </div>
          </div>
        </section>

        <section className="sec3 sec3--tight" aria-label="Trackers">
          <div className="wrap tcols">
            <div className="tcol">
              <h2 className="sec3__h sec3__h--sm">Top performers</h2>
              <PeriodTabs tabs={periodTabs} initial="1m" />
            </div>
            <div className="tcol">
              <h2 className="sec3__h sec3__h--sm">Popular</h2>
              <p className="tcol__note">By followers, then money of 30-day volume.</p>
              {pop.length ? (
                <ol className="tlist">
                  {pop.map(({ t, s, followers, tracked30d }, i) => (
                    <TrackerRow key={t.slug} t={t} rank={i + 1} s={coverStats(s)}
                      figure={followers > 0 ? { value: followers.toLocaleString("en-US"), label: followers === 1 ? "follower" : "followers" } : tracked30d > 0 ? { value: dollars(tracked30d), label: "30-day volume" } : { value: null, label: "No positions yet" }} />
                  ))}
                </ol>
              ) : <p className="tlist__empty">Catching up: the trackers fill in as the first positions arrive.</p>}
            </div>
          </div>
          <div className="wrap sec3__foot"><Link className="tlink tlink--go" href="/trackers">See all trackers <span className="arrow" aria-hidden="true">→</span></Link></div>
        </section>

        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} href={trial} actions={false} title="One plan. Every tracker." />
        <FaqV2 />
      </main>
    </>
  );
}

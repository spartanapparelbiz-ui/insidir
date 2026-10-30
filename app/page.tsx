/* The home page: one centred hero (the logo mark, "Follow the big money.", one line, one black button "Explore
 * trackers →" with a text link to the track record, then five real app screens in phone frames fanned across); "A live
 * portfolio of big money" (one tracker: what it holds now and its latest results); "Featured"; two columns, "Top
 * performers" by window and "Popular"; pricing; FAQ. Home lists lead with stocks, then prediction markets, then sports.
 * Under the hero, "Open now from winning trackers" (lib/follow/open.ts): the 3 newest open positions from trackers and
 * traders with a positive followable record on 30+ settled, and how many more (all of them on /open for members).
 * Every number is a row from terminal.moves on the viewer's clock (free: 30 minutes late), and a tracker's record is
 * what following it would have made (lib/follow). Nothing is made up: a phone with nothing to show is left out, a
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
import { Phones, type PhoneData } from "@/components/home/Phones";
import { PeriodTabs } from "@/components/trackers/PeriodTabs";
import { TrackerFeature, TrackerRow } from "@/components/trackers/Tracker";
import { coverStats } from "@/components/trackers/TrackerCover";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { LOGO } from "@/components/Wordmark";
import { homeCopy, isMainstream } from "@/lib/home/curate";
import { countsToRecord } from "@/lib/trust";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { clockET, dollars } from "@/lib/moves/copy";
import { short as shortMoney } from "@/lib/moves/headline";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { listMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { FEATURED, homeOrder, PERIODS, popular, topPerformers, trackerBySlug, visibleTrackers, type TrackerSlug } from "@/lib/trackers";
import { isReady } from "@/lib/features";
import { trackerHoldings, trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONTH = 30 * 86_400_000;

/** Home lists lead with stocks, then prediction markets, then sports (each kind keeps its own order). */
const KIND_ORDER: Record<string, number> = { stocks: 0, markets: 1, crypto: 1, sports: 2 };
const moveOrder = (l: Move[]): Move[] => l.map((m, i) => ({ m, i })).sort((a, b) => (KIND_ORDER[a.m.tab] ?? 1) - (KIND_ORDER[b.m.tab] ?? 1) || a.i - b.i).map(x => x.m);

/** A feed item said the home page's short way. */
function homeItem(fi: FeedItem, m: Move | undefined): FeedItem {
  const c = homeCopy({ ...fi, detail: m?.detail ?? null }, fi.who.name);
  return { ...fi, sentence: c.line, context: c.context };
}

/** Results' phone: recent settled bets that count toward the record, won ones and lost ones, biggest first. */
function resultPick(settled: Move[], now: number): Move[] {
  const pool = settled.filter(m => (m.settledAt ?? m.at) > now - MONTH && countsToRecord(m)).sort((a, b) => b.amount - a.amount);
  const won = pool.filter(m => m.result === "won").slice(0, 2), lost = pool.filter(m => m.result === "lost").slice(0, 2);
  return [...won, ...lost].sort((a, b) => b.amount - a.amount);
}

/** A tracker with at least one settled, followable position (its record or "Building record · N of 30" to show). */
const hasSettled = (s: TrackerStats | undefined): boolean => Boolean(s && s.records.all.won + s.records.all.lost > 0);

interface HomeData { phones: PhoneData; stats: Map<TrackerSlug, TrackerStats>; portfolio: PortfolioData | null; open: { rows: OpenRow[]; total: number } }
const EMPTY: HomeData = { phones: { feed: [], results: [], tracker: null, list: [], alert: null }, stats: new Map(), portfolio: null, open: { rows: [], total: 0 } };

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
  const lead = trackerBySlug("biggest-bets")!;
  const [latestAll, settledAll, stats, leadMoves] = await Promise.all([
    listMoves(db, { until, limit: 60 }).catch(() => []),
    listMoves(db, { settled: true, source: "polymarket", limit: 200 }).catch(() => []),
    trackerStats(db, now).catch(() => new Map<TrackerSlug, TrackerStats>()),
    trackerMoves(db, lead, { until, limit: 3 }).catch(() => []),
  ]);
  // The same account on the same side of the same market within an hour is one row.
  const latest = moveOrder(dedupe(latestAll.filter(isMainstream))).slice(0, 4);
  const picked = resultPick(settledAll, now);
  const byId = new Map([...latest, ...picked, ...leadMoves].map(m => [m.id, m]));
  const [feed, results, leadItems] = await Promise.all([
    feedItems(db, latest, plan, region, now).catch(() => []),
    feedItems(db, picked, plan, region, now, now).catch(() => []),
    feedItems(db, leadMoves, plan, region, now).catch(() => []),
  ]);
  const short = (l: FeedItem[]) => l.map(fi => homeItem(fi, byId.get(fi.id)));
  const leadShort = short(leadItems);
  const shown = visibleTrackers(isReady).filter(t => hasSettled(stats.get(t.slug)));
  const ranked = topPerformers(shown.map(t => ({ t, slug: t.slug, record: stats.get(t.slug)?.records["1m"] ?? null })));
  const list = homeOrder([...ranked, ...shown.filter(t => !ranked.some(r => r.slug === t.slug)).map(t => ({ t, slug: t.slug, record: stats.get(t.slug)?.records.all ?? null }))]);
  return {
    stats,
    open: await openFromWinners(db, plan, now).catch(() => ({ rows: [], total: 0 })),
    portfolio: await portfolioData(db, stats, plan, region, until, now).catch(() => null),
    phones: {
      feed: short(feed), results: short(results),
      tracker: leadShort.length ? { t: lead, record: stats.get(lead.slug)?.records.all ?? null, cover: coverStats(stats.get(lead.slug)), moves: leadShort } : null,
      list: stats.size ? list.map(x => ({ ...x, cover: coverStats(stats.get(x.slug)) })) : [],
      alert: leadShort[0] ? { tracker: lead.name, body: `${shortMoney(leadShort[0].amount)} on ${leadShort[0].headline.replace(/^\w/, c => c.toLowerCase())}. ${leadShort[0].subline}.`, time: clockET(leadShort[0].at).replace(/ (AM|PM) ET$/, "") } : null,
    },
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
  const { phones, stats, portfolio, open } = hasDatabase()
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
          <Phones d={phones} />
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

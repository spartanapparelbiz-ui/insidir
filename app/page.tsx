/* The home page, for visitors (members open on Discover). Six sections, all real data, every figure rendered final on
 * the server (nothing counts up or animates in):
 *   1. Hero: "Follow the big money.", the line, Start your 7-day trial and Explore trackers, the Research bar, then the
 *      markets as tabs (Stocks · Sports · Prediction markets), one live card each. Visitors from our stock accounts
 *      (?ref=, lib/home/ref.ts) get the insider-trading line, the Stocks tab first and a stock Research example.
 *   2. Open now from winning trackers (the first row's analyst note under it).
 *   3. Leaderboard: the top 5 by followable ROI, the #1 row expanded into its live portfolio.
 *   4. How Insidir works.  5. Proof: sources, the hourly check, who builds it, the real record, and links to the full
 *      pages (/feed, /results, /data).  6. Pricing (one card) and FAQ.
 * The hero renders first; the data sections stream in (Suspense), each cached for 20 seconds. */
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Sec } from "@/components/page/Page";
import { unlockHref } from "@/components/app/links";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { Discover } from "@/components/home/Discover";
import { HeroCta } from "@/components/home/HeroCta";
import { MarketTabs, type TabData, type TabKind } from "@/components/home/MarketTabs";
import { OpenNow } from "@/components/follow/OpenNow";
import { tone } from "@/components/stats/Stats";
import { TrackerCover, coverStats } from "@/components/trackers/TrackerCover";
import { TrustBlock } from "@/components/TrustBlock";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { LOGO } from "@/components/Wordmark";
import { MoveArt } from "@/components/MoveArt";
import { ResearchBar } from "@/components/research/ResearchBar";
import { PAST } from "@/lib/copy";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { topTrackers, type Board } from "@/lib/follow/board";
import { hundredLine, roiText } from "@/lib/follow/math";
import { openFromWinners } from "@/lib/follow/open";
import { cleanRef, HERO_SUB, homeMode, REF_COOKIE } from "@/lib/home/ref";
import { marketPreviews, type MarketKind, type MarketPreview } from "@/lib/markets/preview";
import { movePlan } from "@/lib/moves/gate";
import { signedShort } from "@/lib/moves/copy";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { short } from "@/lib/moves/headline";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { suggestionsFor } from "@/lib/research/suggest";
import type { TrackerSlug } from "@/lib/trackers";
import { trackerHoldings, trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";
import { countsToRecord, trustFacts } from "@/lib/trust";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Every section's data is read once per plan and region, then served to everyone for 20 seconds. */
const TTL = 20_000;
type Ctx = { db: Db; plan: Plan; region: Region | null; now: number; live: boolean; trial: string };
const key = (c: Ctx, k: string) => `home:${k}:${c.plan}:${c.region ?? ""}`;

const NO_MARKET = (kind: MarketKind, now: number): MarketPreview => ({ kind, rows: [], total: 0, window: "", proof: [], live: false, at: now });

/** The #1 tracker's live portfolio, shown inside its leaderboard row: its largest open positions and its latest
 *  settled results (only when its followable return is positive). */
interface Portfolio { open: FeedItem[]; results: FeedItem[]; openCount: number; openAmount: number }
async function portfolioOf(c: Ctx, top: Board | undefined): Promise<Portfolio | null> {
  if (!top || top.r.net <= 0) return null;
  const until = c.now - movePlan(c.plan).delayMs;
  const [holdings, open, settled] = await Promise.all([
    trackerHoldings(c.db, until, c.now).catch(() => new Map()),
    trackerMoves(c.db, top.t, { until, since: c.now - 60 * 86_400_000, byAmount: true, limit: 12 }).then(l => l.filter(m => !m.result).slice(0, 3)).catch(() => []),
    trackerMoves(c.db, top.t, { settled: true, limit: 20 }).then(l => l.filter(m => countsToRecord(m)).slice(0, 3)).catch(() => []),
  ]);
  const [o, r] = await Promise.all([feedItems(c.db, open, c.plan, c.region, c.now).catch(() => []), feedItems(c.db, settled, c.plan, c.region, c.now, c.now).catch(() => [])]);
  const h = holdings.get(top.t.slug);
  return { open: o, results: r, openCount: h?.open ?? o.length, openAmount: h?.amount ?? o.reduce((a, m) => a + m.amount, 0) };
}

const STEPS = [
  ["We read every public trade and filing.", "Large positions on Polymarket and Kalshi as they're placed, and SEC Form 4 and 13F filings as they're published.", "/methodology#sources"],
  ["We verify each one against its source.", "Every row links its source, and every hour we re-read random positions from it. Anything that doesn't match is hidden until it does.", "/data#checks"],
  ["You follow the trackers with real records.", "Each tracker is a live portfolio with a public record: what $100 on every position would have made, losses included.", "/methodology#followable"],
] as const;

const INCLUDED = [
  "Every open position from winning trackers, live",
  "Followable records for every tracker and trader",
  "Analyst notes, and Research over all of Insidir's data",
  "The leaderboard and Following",
];

/* ---------- sections ---------- */
/** What a streaming section shows until its data arrives: its title and a block of its usual height. */
const Wait = ({ id, title, h }: { id: string; title: string; h: number }) => <Sec id={id} title={title}><div className="sec3__wait" style={{ minHeight: h }} aria-busy="true" /></Sec>;

async function OpenSection({ c }: { c: Ctx }) {
  const open = await memo(key(c, "open"), TTL, () => openFromWinners(c.db, c.plan, c.now)).catch(() => ({ rows: [], total: 0 }));
  return (
    <Sec id="open-h" title="Open now from winning trackers" sub={<>Positions still open from trackers and traders with a positive followable return on 30 or more settled. {PAST}</>}>
      <OpenNow rows={open.rows} total={open.total} member={false} now={c.now} trialHref={c.trial} />
      <AsOf at={c.now - movePlan(c.plan).delayMs} live={c.live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />
    </Sec>
  );
}

function PortfolioRows({ p }: { p: Portfolio }) {
  return (
    <div className="board__port" data-testid="board-portfolio">
      <div className="board__col">
        <h3 className="board__colh">Holding now <span>{p.openCount.toLocaleString("en-US")} open · {short(p.openAmount)}</span></h3>
        {p.open.length ? <ul className="board__items">{p.open.map(m => (
          <li key={m.id}><MoveArt art={m.art} /><span className="board__itemh">{m.headline}<span>{m.subline}</span></span><b className="num">{short(m.amount)}</b></li>
        ))}</ul> : <p className="board__none">Nothing open right now.</p>}
      </div>
      <div className="board__col">
        <h3 className="board__colh">Latest results</h3>
        {p.results.length ? <ul className="board__items">{p.results.map(m => (
          <li key={m.id}><MoveArt art={m.art} /><span className="board__itemh">{m.headline}<span>{m.subline}</span></span>
            <b className={`num ${m.result === "won" ? "money" : m.result === "lost" ? "loss" : ""}`}>{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Voided"}{m.pnl !== null ? ` · ${signedShort(m.pnl)}` : ""}</b></li>
        ))}</ul> : <p className="board__none">No settled positions yet.</p>}
      </div>
    </div>
  );
}

async function BoardSection({ c }: { c: Ctx }) {
  const stats = await memo("home:stats", TTL, () => trackerStats(c.db, c.now)).catch(() => new Map<TrackerSlug, TrackerStats>());
  const board = topTrackers(stats, 5);
  const portfolio = await memo(key(c, "portfolio"), TTL, () => portfolioOf(c, board[0])).catch(() => null);
  return (
    <Sec id="board-h" title="Leaderboard" sub={<>The top trackers by followable ROI: $100 on every position at the price Insidir showed it, plus a point of slippage. 30 or more settled. {PAST}</>}>
      {board.length ? (
        <ol className="board__list" data-testid="home-board">
          {board.map(({ t, s, r }, i) => (
            <li key={t.slug} className={`board__row${i === 0 && portfolio ? " board__row--open" : ""}`}>
              <span className="board__rank">{i + 1}</span>
              <Link href={`/trackers/${t.slug}`} className="board__art"><TrackerCover t={t} s={coverStats(s)} small /></Link>
              <span className="board__who"><Link href={`/trackers/${t.slug}`} className="board__name">{t.name}</Link><span className="board__line">{hundredLine(r)}</span></span>
              <span className="board__fig"><b className={tone(r.net)}>{roiText(r.net, r.staked)}</b><span>{r.won.toLocaleString("en-US")}–{r.lost.toLocaleString("en-US")} · {r.n.toLocaleString("en-US")} settled</span></span>
              {i === 0 && portfolio ? <PortfolioRows p={portfolio} /> : null}
            </li>
          ))}
        </ol>
      ) : <p className="tlist__empty">No tracker has 30 settled positions yet. Each tracker&apos;s page shows its record so far.</p>}
      <AsOf at={c.now} live={c.live} sources={[SOURCES.methodology]} />
      <div className="sec3__foot"><Link className="tlink tlink--go" href="/top">The full leaderboard <span className="arrow" aria-hidden="true">→</span></Link><Link className="tlink tlink--go" href="/trackers">Every tracker <span className="arrow" aria-hidden="true">→</span></Link></div>
    </Sec>
  );
}

async function ProofSection({ c }: { c: Ctx }) {
  const trust = await memo("home:trust", TTL, () => trustFacts(c.db)).catch(() => null);
  return (
    <TrustBlock facts={trust} now={c.now}>
      <p className="trust__more" data-testid="proof-links">
        <Link className="tlink tlink--go" href="/feed">Every position, analyzed <span className="arrow" aria-hidden="true">→</span></Link>
        <Link className="tlink tlink--go" href="/results">The whole track record <span className="arrow" aria-hidden="true">→</span></Link>
        <Link className="tlink tlink--go" href="/data">Insidir, live: freshness and checks <span className="arrow" aria-hidden="true">→</span></Link>
      </p>
    </TrustBlock>
  );
}

/** One plan, one card: the price, the $1 week, what's included and the button. */
function PricingCard({ trial }: { trial: string }) {
  return (
    <section className="sec3 hprice" aria-labelledby="price-h">
      <div className="pg">
        <h2 id="price-h" className="sec3__h">Pricing</h2>
        <div className="hprice__card" data-testid="home-plan">
          <p className="hprice__name">Insidir</p>
          <p className="hprice__price"><b className="num">${PLANS.insidir.price}</b><span>/mo</span></p>
          <p className="hprice__trial">${TRIAL.fee} for your first week</p>
          <ul className="hprice__list">{INCLUDED.map(x => <li key={x}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{x}</li>)}</ul>
          <Link className="btn btn--primary hprice__cta" href={trial} data-checkout="home-pricing">Start for ${TRIAL.fee}</Link>
          <p className="hprice__fine">Then ${PLANS.insidir.price}/month. Cancel anytime. Secure sign-in and payments by Whop. <Link href="/pricing">Visitor vs. member</Link></p>
        </div>
      </div>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
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
  const trial = unlockHref();
  // Where they came from: this link's ?ref=, else the first-touch one (middleware.ts keeps it).
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const mode = homeMode(ref);
  const c: Ctx | null = hasDatabase() ? { db: getDb(), plan: viewer.plan, region: viewer.region, now, live, trial } : null;
  // The market tabs sit in the first screen: read before the page is sent, so nothing shifts.
  const markets = c ? await memo(key(c, "markets"), TTL, () => marketPreviews(c.db, c.plan, c.region, now)).catch(() => null) : null;
  const tab = (k: TabKind): TabData => { const d = markets?.[k] ?? NO_MARKET(k, now); return { row: d.rows[0] ?? null, total: d.total, window: d.window, live: d.live }; };
  const order: TabKind[] = mode === "stocks" ? ["stocks", "sports", "markets"] : ["sports", "markets", "stocks"];
  const suggestions = mode === "stocks" ? [...new Set([...suggestionsFor("/stocks"), ...suggestionsFor("/")])] : suggestionsFor("/");
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: ref ? { ref, mode } : undefined }).catch(() => undefined));

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h" data-hero="" data-mode={mode}>
          <div className="pg hero3__in">
            <span className="hero3__mark" aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h">Follow the big money.</h1>
            <p className="hero3__sub" data-testid="hero-sub">{HERO_SUB[mode]}</p>
            <div className="hero3__acts"><HeroCta trialHref={trial} /></div>
            <ResearchBar suggestions={suggestions} />
          </div>
          <MarketTabs order={order} data={{ stocks: tab("stocks"), sports: tab("sports"), markets: tab("markets") }} />
        </section>

        {c ? <>
          <Suspense fallback={<Wait id="open-h" title="Open now from winning trackers" h={420} />}><OpenSection c={c} /></Suspense>
          <Suspense fallback={<Wait id="board-h" title="Leaderboard" h={520} />}><BoardSection c={c} /></Suspense>
        </> : null}

        <Sec id="steps-h" title="How Insidir works" className="steps">
          <ol className="steps__list">
            {STEPS.map(([h, p, href], i) => <li key={h} className="steps__item"><span className="steps__n num">{i + 1}</span><h3 className="steps__h"><Link href={href}>{h}</Link></h3><p className="steps__p">{p}</p></li>)}
          </ol>
          <div className="sec3__foot"><Link className="tlink tlink--go" href="/methodology">Read the methodology <span className="arrow" aria-hidden="true">→</span></Link></div>
        </Sec>

        {c ? <Suspense fallback={<Wait id="trust-h" title="Where the data comes from" h={360} />}><ProofSection c={c} /></Suspense> : null}

        <PricingCard trial={trial} />
        <FaqV2 />
      </main>
    </>
  );
}

/* The home page, for visitors (members open on Discover), all real data, each figure with its source and "as of":
 *   1. The sticky header (Trackers · Open now · Leaderboard · Research · Pricing · Log in · Get started).
 *   2. Hero: "Follow the big money.", the line, Start your 7-day trial (the one black button) and Explore trackers, then
 *      the Research bar (its placeholder cycles through real suggested questions; it opens the Research palette).
 *   3. Three laptops (components/home/Laptops.tsx): Sports, Prediction markets, Stocks; "Crypto · Soon" under them.
 *   4. Open now from winning trackers (the first row's analyst note shown).
 *   5. Every position, analyzed: the newest analysed position per market, one with its Sources open.
 *   6. The live portfolio: the best tracker by followable ROI on 30+ settled, only when that's positive.
 *   7. Leaderboard preview: the top 5 by followable ROI, with artwork, ROI, the $100 line and the record.
 *   8. How Insidir works (3 steps, each to /methodology), then the proof strip.
 *   9. Track record: the latest settled positions, wins and losses.  10. Pricing: visitor vs. member.  11. FAQ.
 * The hero and laptops render first; every section below streams on its own (Suspense), each cached for 20 seconds. */
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
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
import { LOGO } from "@/components/Wordmark";
import { PAST } from "@/lib/copy";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { isReady } from "@/lib/features";
import { hundredLine, MIN_SETTLED, roiText, type FollowRecord } from "@/lib/follow/math";
import { openFromWinners } from "@/lib/follow/open";
import { proofStrip, type Proof } from "@/lib/home/proof";
import { marketPreviews, type MarketKind, type MarketPreview } from "@/lib/markets/preview";
import { movePlan } from "@/lib/moves/gate";
import { short as money } from "@/lib/moves/headline";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { visibleTrackers, type Tracker, type TrackerSlug } from "@/lib/trackers";
import { trackerHoldings, trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";
import { LivePortfolio, type PortfolioData } from "@/components/home/LivePortfolio";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { AnalystNote } from "@/components/analyst/AnalystNote";
import { MoveArt } from "@/components/MoveArt";
import { ResearchBar } from "@/components/research/ResearchBar";
import { suggestionsFor } from "@/lib/research/suggest";
import { analyzedPositions, latestSettled } from "@/lib/home/analyzed";
import { dollars } from "@/lib/money";
import { signedShort } from "@/lib/moves/copy";
import { PLANS, TRIAL } from "@/lib/plans";
import { countsToRecord } from "@/lib/trust";
import { trustFacts } from "@/lib/trust";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Every section's data is read once per plan and region, then served to everyone for 20 seconds. */
const TTL = 20_000;
type Ctx = { db: Db; plan: Plan; region: Region | null; now: number; live: boolean; trial: string };
const key = (c: Ctx, k: string) => `home:${k}:${c.plan}:${c.region ?? ""}`;

const NO_MARKET = (kind: MarketKind, now: number): MarketPreview => ({ kind, rows: [], total: 0, window: "", proof: [], live: false, at: now });
interface Board { t: Tracker; s: TrackerStats | undefined; r: FollowRecord }

/** The top 5 trackers by followable ROI, all time, among those with 30+ settled (the same ranking as /top). */
function topFive(stats: Map<TrackerSlug, TrackerStats>): Board[] {
  return visibleTrackers(isReady).filter(t => t.kind === "bets").map(t => {
    const a = stats.get(t.slug)?.records.all;
    return { t, s: stats.get(t.slug), r: a ? { n: a.won + a.lost, won: a.won, lost: a.lost, staked: a.staked ?? 0, net: a.net } : null };
  }).filter((x): x is Board => Boolean(x.r && x.r.n >= MIN_SETTLED && x.r.staked > 0))
    .sort((a, b) => b.r.net / b.r.staked - a.r.net / a.r.staked).slice(0, 5);
}

/** The live portfolio: the best tracker by FOLLOWABLE ROI among those with 30+ settled, and only if that return is
 *  positive (never the traders' own); none, no section. Its largest open positions and its latest settled results. */
async function portfolioData(c: Ctx, board: Board[], stats: Map<TrackerSlug, TrackerStats>): Promise<PortfolioData | null> {
  const top = board[0];
  if (!top || top.r.net <= 0) return null;
  const until = c.now - movePlan(c.plan).delayMs;
  const [holdings, open, settled] = await Promise.all([
    trackerHoldings(c.db, until, c.now).catch(() => new Map()),
    trackerMoves(c.db, top.t, { until, since: c.now - 60 * 86_400_000, byAmount: true, limit: 12 }).then(l => l.filter(m => !m.result).slice(0, 4)).catch(() => []),
    trackerMoves(c.db, top.t, { settled: true, limit: 20 }).then(l => l.filter(m => countsToRecord(m)).slice(0, 4)).catch(() => []),
  ]);
  const [o, r] = await Promise.all([feedItems(c.db, open, c.plan, c.region, c.now).catch(() => []), feedItems(c.db, settled, c.plan, c.region, c.now, c.now).catch(() => [])]);
  const h = holdings.get(top.t.slug), s = stats.get(top.t.slug);
  return { t: top.t, record: s?.records.all ?? null, cover: coverStats(s), open: o, results: r, openCount: h?.open ?? o.length, openAmount: h?.amount ?? o.reduce((a, m) => a + m.amount, 0) };
}

const STEPS = [
  ["We read every public trade and filing.", "Large positions on Polymarket and Kalshi as they're placed, and SEC Form 4 and 13F filings as they're published.", "/methodology#sources"],
  ["We verify each one against its source.", "Every row links its source, and every hour we re-read random positions from it. Anything that doesn't match is hidden until it does.", "/data#checks"],
  ["You follow the trackers with real records.", "Each tracker is a live portfolio with a public record: what $100 on every position would have made, losses included.", "/methodology#followable"],
] as const;

/* ---------- sections ---------- */
const Sec = ({ id, title, sub, children, className = "" }: { id: string; title: string; sub?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`sec3 ${className}`.trim()} aria-labelledby={id}>
    <div className="wrap">
      <h2 id={id} className="sec3__h">{title}</h2>
      {sub ? <p className="tcol__note">{sub}</p> : null}
      {children}
    </div>
  </section>
);
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

function Analyzed({ m, open }: { m: FeedItem; open: boolean }) {
  return (
    <article className="anlz__card" data-testid="analyzed">
      <div className="anlz__top"><MoveArt art={m.art} className="art40" /><span className="anlz__kind">{m.tab === "sports" ? `Sports${m.leagueLabel ? ` · ${m.leagueLabel}` : ""}` : m.tab === "stocks" ? "Stocks · SEC Form 4" : "Prediction markets"}</span></div>
      <h3 className="anlz__h"><Link href={`/position/${encodeURIComponent(m.id)}`}>{m.headline}</Link></h3>
      <p className="anlz__meta"><span className="num">{dollars(m.amount)}</span> · {m.who.name} · {m.ago}</p>
      <p className="anlz__sub">{m.subline}</p>
      {m.analyst ? <AnalystNote text={m.analyst.text} facts={m.analyst.facts} at={m.analyst.at} open={open} /> : null}
    </article>
  );
}

async function AnalyzedSection({ c }: { c: Ctx }) {
  const items = await memo(key(c, "analyzed"), TTL, () => analyzedPositions(c.db, c.plan, c.region, c.now)).catch(e => { console.error("home: analyzed failed", e instanceof Error ? e.message : e); return []; });
  // Hidden only when there's nothing to show: no position in the viewer's window has a note yet.
  if (!items.length) { console.log(`home: "Every position, analyzed." hidden: 0 noted positions for ${c.plan} (the worker's analyst:notes job writes them; see /admin/ai)`); return null; }
  return (
    <Sec id="anlz-h" title="Every position, analyzed." sub="Each large position gets a short note from its facts: who placed it, their verified record, and what moved since. Every fact links its source.">
      <div className="anlz__grid">{items.map((m, i) => <Analyzed key={m.id} m={m} open={i === 0} />)}</div>
      <AsOf at={c.now - movePlan(c.plan).delayMs} live={c.live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.sec, { label: "How notes are written", href: "/methodology#analyst-notes" }]} />
    </Sec>
  );
}

async function BoardAndPortfolio({ c }: { c: Ctx }) {
  const stats = await memo("home:stats", TTL, () => trackerStats(c.db, c.now)).catch(() => new Map<TrackerSlug, TrackerStats>());
  const board = topFive(stats);
  const portfolio = await memo(key(c, "portfolio"), TTL, () => portfolioData(c, board, stats)).catch(() => null);
  return (
    <>
      {portfolio ? <LivePortfolio d={portfolio} /> : null}
      <Sec id="board-h" title="Leaderboard" sub={<>The top trackers by followable ROI: $100 on every position at the price Insidir showed it, plus a point of slippage. 30 or more settled. {PAST}</>}>
        {board.length ? (
          <ol className="board__list" data-testid="home-board">
            {board.map(({ t, s, r }, i) => (
              <li key={t.slug} className="board__row">
                <span className="board__rank">{i + 1}</span>
                <Link href={`/trackers/${t.slug}`} className="board__art"><TrackerCover t={t} s={coverStats(s)} small /></Link>
                <span className="board__who"><Link href={`/trackers/${t.slug}`} className="board__name">{t.name}</Link><span className="board__line">{hundredLine(r)}</span></span>
                <span className="board__fig"><b className={tone(r.net)}>{roiText(r.net, r.staked)}</b><span>{r.won.toLocaleString("en-US")}–{r.lost.toLocaleString("en-US")} · {r.n.toLocaleString("en-US")} settled</span></span>
              </li>
            ))}
          </ol>
        ) : <p className="tlist__empty">No tracker has 30 settled positions yet. Each tracker&apos;s page shows its record so far.</p>}
        <AsOf at={c.now} live={c.live} sources={[SOURCES.methodology]} />
        <div className="sec3__foot"><Link className="tlink tlink--go" href="/top">The full leaderboard <span className="arrow" aria-hidden="true">→</span></Link><Link className="tlink tlink--go" href="/trackers">Every tracker <span className="arrow" aria-hidden="true">→</span></Link></div>
      </Sec>
    </>
  );
}

function ProofStrip({ p, live }: { p: Proof; live: boolean }) {
  const a = p.accuracy;
  const ago = a ? Math.max(1, Math.round((p.at - a.runAt) / 60_000)) : null;
  const items = [
    { label: "Volume tracked, last 30 days", value: money(p.volume30d), testid: "proof-volume" },
    { label: "Large positions this week", value: p.positionsWeek.toLocaleString("en-US"), testid: "proof-week" },
    { label: "Accounts with a verified record", value: p.verifiedAccounts.toLocaleString("en-US"), testid: "proof-accounts" },
    { label: "Last accuracy check", value: a ? `${a.ok} of ${a.checked}` : "—", note: a ? `matched the source · ${ago! < 60 ? `${ago} min` : `${Math.round(ago! / 60)} h`} ago` : "Runs every hour", testid: "proof-check" },
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

async function ProofSection({ c }: { c: Ctx }) {
  const p = await memo("home:proof", TTL, () => proofStrip(c.db, c.now)).catch(() => null);
  return p ? <ProofStrip p={p} live={c.live} /> : null;
}

async function RecordSection({ c }: { c: Ctx }) {
  const [rows, trust] = await Promise.all([
    memo(key(c, "settled"), TTL, () => latestSettled(c.db, c.plan, c.region, c.now)).catch(() => []),
    memo("home:trust", TTL, () => trustFacts(c.db)).catch(() => null),
  ]);
  return (
    <>
      <Sec id="record-h" title="Track record" sub={<>The latest settled large positions, wins and losses. {PAST}</>}>
        {rows.length ? (
          <ul className="rec__list" data-testid="home-record">
            {rows.map(m => (
              <li key={m.id} className="rec__row">
                <MoveArt art={m.art} className="art40" />
                <span className="rec__main"><Link href={`/position/${encodeURIComponent(m.id)}`} className="rec__h">{m.headline}</Link><span className="rec__sub">{m.subline}</span></span>
                <span className="rec__fig"><b className="num">{dollars(m.amount)}</b><span className={m.result === "won" ? "money" : "loss"}>{m.result === "won" ? "Won" : "Lost"}{m.pnl !== null ? ` · ${signedShort(m.pnl)}` : ""}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="tlist__empty">Positions appear here, won or lost, as their markets settle.</p>}
        <AsOf at={c.now} live={c.live} sources={[SOURCES.polymarket, SOURCES.kalshi]} />
        <div className="sec3__foot"><Link className="tlink tlink--go" href="/results">The whole track record <span className="arrow" aria-hidden="true">→</span></Link></div>
      </Sec>
      <TrustBlock facts={trust} now={c.now} />
    </>
  );
}

/** Visitor vs. member, in one table; the action is a text link (the page's one black button is the hero's). */
function PricingTable({ trial }: { trial: string }) {
  const rows: Array<[string, string, string]> = [
    ["Every tracker and its record", "Yes", "Yes"],
    ["Large positions", "30 minutes late", "Live"],
    ["Open now from winning trackers", "3 newest", "Every one"],
    ["Analyst notes", "On delayed positions", "On every position, live"],
    ["Research", "3 questions a day", "As many as you like, Export CSV"],
    ["Account records and follows", "—", "Yes"],
  ];
  return (
    <Sec id="price-h" title="Pricing" className="ptable">
      <p className="ptable__price"><b className="num">${PLANS.insidir.price}/month</b> · every tracker</p>
      <p className="ptable__fine">${TRIAL.fee} for the first week. Cancel anytime. Secure sign-in and payments by Whop.</p>
      <div className="rans__scroll">
        <table className="rtable ptable__t">
          <thead><tr><th scope="col">What you get</th><th scope="col">Visitor</th><th scope="col">Member</th></tr></thead>
          <tbody>{rows.map(([w, v, m]) => <tr key={w}><th scope="row">{w}</th><td>{v}</td><td>{m}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="sec3__foot"><Link className="tlink tlink--go" href={trial}>Start your 7-day trial <span className="arrow" aria-hidden="true">→</span></Link><Link className="tlink tlink--go" href="/pricing">Pricing details <span className="arrow" aria-hidden="true">→</span></Link></div>
    </Sec>
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
  const trial = unlockHref();
  const c: Ctx | null = hasDatabase() ? { db: getDb(), plan: viewer.plan, region: viewer.region, now, live, trial } : null;
  // The laptops sit in the first screen: read before the page is sent, so nothing shifts.
  const markets = c ? await memo(key(c, "markets"), TTL, () => marketPreviews(c.db, c.plan, c.region, now)).catch(() => null) : null;
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h">
          <div className="wrap hero3__in">
            <span className="hero3__mark rise" style={{ ["--i" as string]: 0 }} aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h rise" style={{ ["--i" as string]: 1 }}>Follow the big money.</h1>
            <p className="hero3__sub rise" style={{ ["--i" as string]: 2 }}>Insidir analyzes every large position on Polymarket, Kalshi and SEC filings: who placed it, their verified record, and what it means. Within minutes.</p>
            <div className="hero3__acts rise" style={{ ["--i" as string]: 3 }}><HeroCta trialHref={trial} /></div>
            <ResearchBar suggestions={suggestionsFor("/")} />
          </div>
          <Laptops data={markets ?? { sports: NO_MARKET("sports", now), markets: NO_MARKET("markets", now), stocks: NO_MARKET("stocks", now), crypto: NO_MARKET("crypto", now) }} trialHref={trial} signedIn={Boolean(viewer.user)} />
        </section>

        {c ? <>
          <Suspense fallback={<Wait id="open-h" title="Open now from winning trackers" h={420} />}><OpenSection c={c} /></Suspense>
          <Suspense fallback={<Wait id="anlz-h" title="Every position, analyzed." h={520} />}><AnalyzedSection c={c} /></Suspense>
          <Suspense fallback={<Wait id="board-h" title="Leaderboard" h={520} />}><BoardAndPortfolio c={c} /></Suspense>
        </> : null}

        <Sec id="steps-h" title="How Insidir works" className="steps">
          <ol className="steps__list">
            {STEPS.map(([h, p, href], i) => <li key={h} className="steps__item"><span className="steps__n num">{i + 1}</span><h3 className="steps__h"><Link href={href}>{h}</Link></h3><p className="steps__p">{p}</p></li>)}
          </ol>
          <div className="sec3__foot"><Link className="tlink tlink--go" href="/methodology">Read the methodology <span className="arrow" aria-hidden="true">→</span></Link></div>
        </Sec>

        {c ? <>
          <Suspense fallback={<Wait id="proof-h" title="Insidir, live" h={160} />}><ProofSection c={c} /></Suspense>
          <Suspense fallback={<Wait id="record-h" title="Track record" h={520} />}><RecordSection c={c} /></Suspense>
        </> : null}

        <PricingTable trial={trial} />
        <FaqV2 />
      </main>
    </>
  );
}

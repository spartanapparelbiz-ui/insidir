/* A tracker (lib/trackers.ts). One headline and one action (Follow: its moves in Following and an alert when it
 * moves), then the data:
 *   Performance  the P&L of its settled moves (1W 1M 3M 1Y All), record, win rate against the average price paid
 *                (edge), net, ROI, and "$100 on every move" (hypothetical, past results)
 *   Stats        money tracked, moves, average and biggest bet, biggest win and loss, current streak, best day, how
 *                the price moved after the bet (open bets), share from top traders
 *   Breakdowns   by league or topic, bet size, favorite vs underdog, day of the week
 *   Open now     unsettled moves, price paid against the price now
 *   Top traders  in this tracker; then its moves (filter: all, open, won, lost) and similar trackers.
 * Following it (lib/follow): what $100 on every position would have made at the price Insidir showed it, the headline
 * figure ("Building record · N of 30" under 30 settled); the traders' own return from their entries is secondary.
 * Every number comes from terminal.moves (lib/trackers-store.ts → lib/stats.ts); anything built on under 20
 * settled moves says "Not enough data yet". Public: visitors see moves 30 minutes late (lib/moves/feed.ts). */
import type { Metadata } from "next";
import { EntityLd } from "@/lib/seo/jsonld";
import { trackerTitle } from "@/lib/seo/titles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/charts/LineChart";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { BreakdownTable, cents, gatedTile, Leaderboard, pct, perfTiles, Section, signed, Table, Tiles, tone } from "@/components/stats/Stats";
import { BY, TrackerRow } from "@/components/trackers/Tracker";
import { hundredLine, roiText } from "@/lib/follow/math";
import { PAST } from "@/lib/copy";
import { MoveArt } from "@/components/MoveArt";
import { Photo } from "@/components/Photo";
import { artOfMove } from "@/lib/logos";
import { coverFigure, coverStats } from "@/components/trackers/TrackerCover";
import { trackerPhoto } from "@/lib/photos";
import { trackerLogo } from "@/lib/tracker-logos";
import { FollowButton, type FollowState } from "@/components/v2/FollowButton";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars, who } from "@/lib/moves/copy";
import { headlineOf } from "@/lib/moves/headline";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { leagueLabel } from "@/lib/moves/leagues";
import { followList } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";
import {
  activity, bestDay, biggestLoss, biggestWin, breakdown, CHART_WINDOWS, dayOf, leaders, NOT_ENOUGH, perf, pnlSeries, priceMove, sideOf, SIDES, sizeOf, SIZES,
  streak, topShare, WEEKDAYS,
} from "@/lib/stats";
import { buildingLine, hasTrackerRecord, OBSERVED_TRACKERS, trackerBySlug, trackerHref, TRACKER_MIN_SETTLED, TRACKERS } from "@/lib/trackers";
import { trackerMoves, trackerPage, trackerStats, type TrackerPageData, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = trackerBySlug((await params).slug);
  if (!t) return { title: "Tracker" };
  const r = hasDatabase() ? (await trackerStats(getDb(), Date.now()).catch(() => null))?.get(t.slug)?.records.all ?? null : null;
  const m = trackerTitle(t.name, t.line, r, TRACKER_MIN_SETTLED);
  return { title: { absolute: `${m.title} · Insidir` }, description: m.description, alternates: { canonical: trackerHref(t.slug) }, openGraph: { title: m.title, description: m.description, url: trackerHref(t.slug) } };
}

const SHOW = ["all", "open", "won", "lost"] as const;
type Show = (typeof SHOW)[number];
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Sports: the league as cards show it; markets: the topic. */
const groupOf = (m: Move): string | null =>
  m.tab === "sports" ? leagueLabel(m) ?? "Other sports" : m.category ? m.category[0]!.toUpperCase() + m.category.slice(1) : null;

export default async function TrackerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ show?: string }> }) {
  const t = trackerBySlug((await params).slug);
  if (!t || (t.needs && !isReady(t.needs))) notFound();
  const sp = await searchParams;
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? "") ? (sp.show as Show) : "all";
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const until = now - movePlan(viewer.plan).delayMs;
  const trial = unlockHref();
  let all: Map<string, TrackerStats> | null = null, d: TrackerPageData | null = null, list: FeedItem[] = [], following = false;
  if (hasDatabase()) {
    const db = getDb();
    const [stats, page, mine] = await Promise.all([
      trackerStats(db, now).catch(() => null),
      trackerPage(db, t, until, now).catch(() => null),
      viewer.user ? followList(db, viewer.user.id).catch(() => []) : Promise.resolve([]),
    ]);
    all = stats; d = page;
    following = mine.some(f => f.kind === "tracker" && f.target === t.slug);
    const src: Move[] = show === "all" ? await trackerMoves(db, t, { until, limit: 8 }).catch(() => [])
      : show === "open" ? (d?.open ?? []).map(o => o.m).sort((a, b) => b.at - a.at).slice(0, 8)
      : (d?.settled ?? []).filter(m => m.result === show).slice(0, 8);
    list = await feedItems(db, src, viewer.plan, viewer.region, now, show === "won" || show === "lost" ? now : undefined).catch(() => []);
  }
  const stats = all?.get(t.slug) ?? null;
  const follow: FollowState = !isReady("follows") ? "soon" : !paid ? "locked" : following ? "on" : "off";
  const cardFollow: FollowState = !isReady("follows") ? "soon" : paid ? "off" : "locked";
  const settled = d?.settled ?? [];
  const p = perf(settled);
  const act = activity(d?.year ?? []);
  const series = pnlSeries(settled);
  const windows = CHART_WINDOWS.map(w => ({ key: w.key, label: w.label, since: w.days === null ? null : now - w.days * 86_400_000 }));
  const st = streak(settled), bd = bestDay(settled), bw = biggestWin(settled), bl = biggestLoss(settled);
  const ok = p.winRate !== null;
  const move = priceMove((d?.open ?? []).map(o => ({ avgPrice: o.m.avgPrice, now: o.now })));
  const share = topShare(d?.year ?? [], w => d?.top.has(w) ?? false);
  const similar = TRACKERS.filter(o => o.group === t.group && o.slug !== t.slug && (!o.needs || isReady(o.needs))).slice(0, 4);
  const streakText = st ? `${st.n} ${st.kind === "won" ? (st.n === 1 ? "win" : "wins") : (st.n === 1 ? "loss" : "losses")}` : "—";

  // The league's own mark, small in white beside the name (league trackers only).
  const leagueMark = t.group === "Leagues" ? trackerLogo(t.slug) : null;
  const fig = coverFigure(t, coverStats(stats));
  const fr = stats?.records.all ?? null;
  // A boolean, not a type guard: the "building" branch still reads the tally so far.
  const frOk: boolean = hasTrackerRecord(fr);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/trackers" trialHref={trial} />
      <main className="wrap app2 tracker">
        <header className="thead">
          <div className="thead__art">
            <Photo name={trackerPhoto(t.slug)} ratio="21:9" priority sizes="(min-width: 1200px) 1168px, 100vw" className="thead__photo" />
            <div className="thead__on">
              <p className="thead__by">{BY} · {t.group}</p>
              <div className="thead__name">
                <h1 className="thead__h">{t.name}</h1>
                {leagueMark ? <img className="thead__logo" src={leagueMark} alt="" width={128} height={128} /> : null}
              </div>
              <p className="thead__line">{t.line}</p>
            </div>
          </div>
          <div className="thead__act">
            <FollowButton kind="tracker" target={t.slug} state={follow} trialHref={trial} />
            <span className="thead__roi"><b data-count="">{fig.figure}</b>{fig.label ?? (t.kind === "filings" ? "30-day volume" : null)}{t.kind === "bets" ? <span className="past">{PAST}</span> : null}</span>
          </div>
        </header>

        {t.kind === "bets" ? (
          <Section id="open-h" title="Holding now" note={d?.open.length ? `${d.open.length.toLocaleString("en-US")} open ${d.open.length === 1 ? "position" : "positions"}, ${dollars(d.open.reduce((a, o) => a + o.m.amount, 0))} in total. Entry is the price when the position was opened; Now is the price on their side, where the venue reports it. Largest first.` : undefined}>
            {d?.open.length ? (
              <Table label="Holding now" head={["Position", "Size", "Holder", "Entry", "Now", "Change"]} numeric={[1, 3, 4, 5]}
                rows={d.open.map(({ m, now: px }) => [
                  <Link key="m" className="dtable__link dtable__link--art" href={`/market/${encodeURIComponent(m.marketId)}`}><MoveArt art={artOfMove(m)} /><span>{headlineOf(m)}<span className="dtable__sub">{m.marketTitle}</span></span></Link>,
                  dollars(m.amount), who(m, null), cents(m.avgPrice), cents(px),
                  px === null ? "—" : <span className={tone(px - m.avgPrice)}>{`${px - m.avgPrice >= 0 ? "+" : "−"}${Math.abs(Math.round((px - m.avgPrice) * 100))} pts`}</span>,
                ])} />
            ) : <p className="dnote">No open positions right now. New positions that fit this tracker are listed here as they are opened.</p>}
          </Section>
        ) : null}

        {t.kind === "bets" ? (
          <Section id="follow-h" title="Following it" note={`What $100 on every position would have made, bought at the price Insidir showed it${OBSERVED_TRACKERS.has(t.slug) ? " in this tracker (the moment it was added here, not the trader's entry)" : ""}, plus one point of slippage, held until it settled. ${PAST}`}>
            {fr && frOk ? (
              <div className="follow" data-testid="followable">
                <p className="follow__roi"><b className={tone(fr.net)} data-count="">{roiText(fr.net, fr.staked ?? 0)}</b> <span>Followable ROI</span></p>
                <p className="follow__line"><span data-count="">{hundredLine({ staked: fr.staked ?? 0, net: fr.net })}</span></p>
                <p className="follow__tally" data-count="">{fr.won.toLocaleString("en-US")} won · {fr.lost.toLocaleString("en-US")} lost · {(fr.won + fr.lost).toLocaleString("en-US")} settled</p>
              </div>
            ) : (
              <div className="follow follow--building" data-testid="followable">
                <p className="follow__roi"><b>{buildingLine(fr)}</b></p>
                <p className="follow__tally">So far: {(fr?.won ?? 0).toLocaleString("en-US")} won · {(fr?.lost ?? 0).toLocaleString("en-US")} lost{fr && fr.staked ? ` · $100 on each: ${fr.net >= 0 ? "+" : "−"}$${Math.round(Math.abs(fr.net)).toLocaleString("en-US")}` : ""}. The return shows at {TRACKER_MIN_SETTLED} settled.</p>
              </div>
            )}
          </Section>
        ) : null}

        {t.kind === "bets" ? (
          <Section id="perf-h" title="The traders' own return" note={`From ${p.settled.toLocaleString("en-US")} settled Polymarket positions at the traders' own entry prices, each checked against the wallet's own trades: what they made, not what following them would have. ${PAST}`}>
            {ok ? <LineChart points={series} windows={windows} format="money" label="Net P&L on settled positions" empty="No settled positions in this window." />
              : <div className="lchart__empty">{NOT_ENOUGH}: the chart starts at 20 settled positions ({p.settled} so far).</div>}
            <div className="dsub"><Tiles tiles={perfTiles(p)} cols={3} label="Record" /></div>
            <p className="hypo">{p.hundred !== null
              ? <><b>$100 at each trader&apos;s entry: <span className={tone(p.hundred)}>{signed(p.hundred)}</span></b> <span>On all {p.settled.toLocaleString("en-US")} settled positions, at the price they paid (not one you could get by following). {PAST}</span></>
              : <><b>$100 at each trader&apos;s entry:</b> <span>{NOT_ENOUGH}.</span></>}</p>
          </Section>
        ) : null}

        <Section id="stats-h" title="Stats" note="Activity over the last 12 months; results from every settled position.">
          <Tiles cols={5} label="Stats" tiles={[
            { label: "Tracked, 12 months", value: dollars(act.tracked) },
            { label: "Positions, 12 months", value: act.moves.toLocaleString("en-US") },
            { label: "Average position size", value: act.avgBet === null ? "—" : dollars(act.avgBet) },
            { label: "Largest position", value: act.biggestBet === null ? "—" : dollars(act.biggestBet) },
            ...(t.kind === "bets" ? [
              { label: "Largest gain", ...gatedTile(bw ? signed(bw.pnl ?? 0) : "—", ok), tone: ok && bw ? "money" as const : undefined },
              { label: "Largest loss", ...gatedTile(bl ? signed(bl.pnl ?? 0) : "—", ok), tone: ok && bl ? "loss" as const : undefined },
              { label: "Current streak", ...gatedTile(streakText, ok), tone: ok && st ? (st.kind === "won" ? "money" as const : "loss" as const) : undefined },
              { label: bd && ok ? `Best day, ${DAY_FMT.format(new Date(`${bd.day}T12:00:00Z`))}` : "Best day", ...gatedTile(bd ? signed(bd.net) : "—", ok), tone: ok && bd ? tone(bd.net) : undefined },
              { label: "Price change, open positions", value: move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move).toFixed(1)} pts`, tone: tone(move) },
              { label: "From top-ranked traders", value: share === null ? "—" : pct(share) },
            ] : []),
          ]} />
        </Section>

        {t.kind === "bets" ? (
          <Section id="bd-h" title="Breakdowns" note="Settled positions only. Each row needs 20 settled positions for its rates.">
            <div className="dsub"><h3 className="dsub__h">By league or topic</h3><BreakdownTable label="By league or topic" first="League or topic" rows={breakdown(settled, groupOf)} /></div>
            <div className="dsub"><h3 className="dsub__h">By position size</h3><BreakdownTable label="By position size" first="Position size" rows={breakdown(settled, m => sizeOf(m.amount), SIZES)} /></div>
            <div className="dsub"><h3 className="dsub__h">Favorite vs underdog</h3><BreakdownTable label="Favorite vs underdog" first="Entry" rows={breakdown(settled, m => sideOf(m.avgPrice), SIDES)} /></div>
            <div className="dsub"><h3 className="dsub__h">By day of the week</h3><BreakdownTable label="By day of the week" first="Placed on (ET)" rows={breakdown(settled, dayOf, WEEKDAYS)} /></div>
          </Section>
        ) : null}

        {t.kind === "bets" ? (
          <Section id="lead-h" title="Top traders in this tracker" note="By net P&L on their settled positions here.">
            {paid ? <Leaderboard label="Top traders in this tracker" leaders={leaders(settled, 10)} />
              : <div className="dnote">Trader records are for members. <a href={trial} data-unlock="tracker-leaders">Try 7 days for $1</a>.</div>}
          </Section>
        ) : null}

        <Section id="moves-h" title={t.kind === "filings" ? "Latest filings" : "Latest positions"} note={!paid ? <>You&apos;re seeing positions 30 minutes late. <a href={trial} data-unlock="tracker">Members see them live.</a></> : undefined}>
          {t.kind === "bets" ? (
            <nav className="dfilters" aria-label="Show">
              {/* Plain links: a query-only change on the same page through the client router sometimes never lands (Next 15.5). */}
              {SHOW.map(s => <a key={s} className="tlink" aria-current={show === s ? "true" : undefined} href={s === "all" ? `/trackers/${t.slug}#moves-h` : `/trackers/${t.slug}?show=${s}#moves-h`}>{s[0]!.toUpperCase() + s.slice(1)}</a>)}
            </nav>
          ) : null}
          {list.length ? (
            <ol className="feed2__list tmoves">{list.map(m => <li key={m.id}><MoveCard m={m} follow={cardFollow} trialHref={trial} /></li>)}</ol>
          ) : <div className="tempty"><p className="tempty__h">Nothing here yet</p><p>The next position that fits shows up here.</p></div>}
        </Section>

        {similar.length ? (
          <Section id="more-h" title="Similar trackers">
            <ol className="tlist tlist--grid">{similar.map(o => <TrackerRow key={o.slug} t={o} r={all?.get(o.slug)?.records.all ?? null} s={coverStats(all?.get(o.slug))} />)}</ol>
            <p className="tsec__foot"><Link className="btn btn--secondary" href="/trackers">All trackers <span className="arrow" aria-hidden="true">→</span></Link></p>
          </Section>
        ) : null}
        <EntityLd trail={[["Trackers", "/trackers"], [t.name, trackerHref(t.slug)]]} name={`${t.name} tracker`} path={trackerHref(t.slug)} description={`${t.name}: ${t.line}`}
          updated={stats?.lastAt ?? null} sources={t.kind === "filings" ? ["https://www.sec.gov/edgar/search/"] : ["https://polygonscan.com", "https://kalshi.com"]} keywords={[t.name, t.group, "large positions"]} />
      </main>
    </>
  );
}

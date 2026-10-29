/* A tracker (lib/trackers.ts). One headline and one action (Follow: its moves in Following and an alert when it
 * moves), then the data:
 *   Performance  the P&L of its settled moves (1W 1M 3M 1Y All), record, win rate against the average price paid
 *                (edge), net, ROI, and "$100 on every move" (hypothetical, past results)
 *   Stats        money tracked, moves, average and biggest bet, biggest win and loss, current streak, best day, how
 *                the price moved after the bet (open bets), share from top traders
 *   Breakdowns   by league or topic, bet size, favorite vs underdog, day of the week
 *   Open now     unsettled moves, price paid against the price now
 *   Top traders  in this tracker; then its moves (filter: all, open, won, lost) and similar trackers.
 * Every number comes from terminal.moves (lib/trackers-store.ts → lib/stats.ts); anything built on under 20
 * settled moves says "Not enough data yet". Public: visitors see moves 30 minutes late (lib/moves/feed.ts). */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/charts/LineChart";
import { Cover } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { BreakdownTable, cents, Leaderboard, pct, perfTiles, Section, signed, Table, Tiles, tone } from "@/components/stats/Stats";
import { BY, TrackerRow } from "@/components/trackers/Tracker";
import { FollowButton, type FollowState } from "@/components/v2/FollowButton";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars } from "@/lib/moves/copy";
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
import { coverVariant, trackerBySlug, TRACKERS } from "@/lib/trackers";
import { trackerMoves, trackerPage, trackerStats, type TrackerPageData, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = trackerBySlug((await params).slug);
  return t ? { title: t.name, description: `${t.name}, by Insidir: ${t.line}` } : { title: "Tracker" };
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
  const gate = (v: string) => (ok ? v : NOT_ENOUGH);
  const move = priceMove((d?.open ?? []).map(o => ({ avgPrice: o.m.avgPrice, now: o.now })));
  const share = topShare(d?.year ?? [], w => d?.top.has(w) ?? false);
  const similar = TRACKERS.filter(o => o.group === t.group && o.slug !== t.slug && (!o.needs || isReady(o.needs))).slice(0, 4);
  const streakText = st ? `${st.n} ${st.kind === "won" ? (st.n === 1 ? "win" : "wins") : (st.n === 1 ? "loss" : "losses")}` : "—";

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/trackers" trialHref={trial} />
      <main className="wrap app2 tracker">
        <header className="thead">
          <div className="thead__cover"><Cover n={t.photo} className={coverVariant(t.slug)} eager sizes="(min-width: 900px) 520px, 100vw" /></div>
          <div className="thead__copy">
            <p className="thead__by">{BY} · {t.group}</p>
            <h1 className="thead__h">{t.name}</h1>
            <p className="thead__line">{t.line}</p>
            <div className="thead__act">
              <FollowButton kind="tracker" target={t.slug} state={follow} trialHref={trial} />
              {stats ? <span className="thead__meta">{stats.followers.toLocaleString("en-US")} {stats.followers === 1 ? "follower" : "followers"}</span> : null}
            </div>
          </div>
        </header>

        {t.kind === "bets" ? (
          <Section id="perf-h" title="Performance" note={`From ${p.settled.toLocaleString("en-US")} settled Polymarket bets, each checked against the wallet's own trades. Past results, not a promise.`}>
            {ok ? <LineChart points={series} windows={windows} format="money" label="Net on settled moves" empty="No settled moves in this window." />
              : <div className="lchart__empty">{NOT_ENOUGH}: the chart starts at 20 settled moves ({p.settled} so far).</div>}
            <div className="dsub"><Tiles tiles={perfTiles(p)} cols={3} label="Record" /></div>
            <p className="hypo">{p.hundred !== null
              ? <><b>$100 on every move: <span className={tone(p.hundred)}>{signed(p.hundred)}</span></b> <span>Hypothetical: $100 at the price each was bought, on all {p.settled.toLocaleString("en-US")} settled moves. Past results.</span></>
              : <><b>$100 on every move:</b> <span>{NOT_ENOUGH}.</span></>}</p>
          </Section>
        ) : null}

        <Section id="stats-h" title="Stats" note="Activity over the last 12 months; results from every settled move.">
          <Tiles cols={5} label="Stats" tiles={[
            { label: "Tracked, 12 months", value: dollars(act.tracked) },
            { label: "Moves, 12 months", value: act.moves.toLocaleString("en-US") },
            { label: "Average bet", value: act.avgBet === null ? "—" : dollars(act.avgBet) },
            { label: "Biggest bet", value: act.biggestBet === null ? "—" : dollars(act.biggestBet) },
            ...(t.kind === "bets" ? [
              { label: "Biggest win", value: gate(bw ? signed(bw.pnl ?? 0) : "—"), tone: ok && bw ? "money" as const : undefined },
              { label: "Biggest loss", value: gate(bl ? signed(bl.pnl ?? 0) : "—"), tone: ok && bl ? "loss" as const : undefined },
              { label: "Current streak", value: gate(streakText), tone: ok && st ? (st.kind === "won" ? "money" as const : "loss" as const) : undefined },
              { label: bd && ok ? `Best day, ${DAY_FMT.format(new Date(`${bd.day}T12:00:00Z`))}` : "Best day", value: gate(bd ? signed(bd.net) : "—"), tone: ok && bd ? tone(bd.net) : undefined },
              { label: "Price since the bet, open bets", value: move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move).toFixed(1)}¢`, tone: tone(move) },
              { label: "From top traders", value: share === null ? "—" : pct(share) },
            ] : []),
          ]} />
        </Section>

        {t.kind === "bets" ? (
          <Section id="bd-h" title="Breakdowns" note="Settled moves only. Each row needs 20 settled moves for its rates.">
            <div className="dsub"><h3 className="dsub__h">By league or topic</h3><BreakdownTable label="By league or topic" first="League or topic" rows={breakdown(settled, groupOf)} /></div>
            <div className="dsub"><h3 className="dsub__h">By bet size</h3><BreakdownTable label="By bet size" first="Bet size" rows={breakdown(settled, m => sizeOf(m.amount), SIZES)} /></div>
            <div className="dsub"><h3 className="dsub__h">Favorite vs underdog</h3><BreakdownTable label="Favorite vs underdog" first="Price paid" rows={breakdown(settled, m => sideOf(m.avgPrice), SIDES)} /></div>
            <div className="dsub"><h3 className="dsub__h">By day of the week</h3><BreakdownTable label="By day of the week" first="Placed on (ET)" rows={breakdown(settled, dayOf, WEEKDAYS)} /></div>
          </Section>
        ) : null}

        {t.kind === "bets" && d?.open.length ? (
          <Section id="open-h" title="Open now" note="Not settled yet: the price paid against the price now, on their side. Biggest first.">
            <Table label="Open bets" head={["Market", "Bet", "Paid", "Now", "Change"]} numeric={[1, 2, 3, 4]}
              rows={d.open.slice(0, 12).map(({ m, now: px }) => [
                <Link key="m" className="dtable__link" href={`/market/${encodeURIComponent(m.marketId)}`}>{m.marketTitle}<span className="dtable__sub">{m.outcome}</span></Link>,
                dollars(m.amount), cents(m.avgPrice), cents(px),
                px === null ? "—" : <span className={tone(px - m.avgPrice)}>{`${px - m.avgPrice >= 0 ? "+" : "−"}${Math.abs(Math.round((px - m.avgPrice) * 100))}¢`}</span>,
              ])} />
          </Section>
        ) : null}

        {t.kind === "bets" ? (
          <Section id="lead-h" title="Top traders in this tracker" note="By net on their settled moves here.">
            {paid ? <Leaderboard label="Top traders in this tracker" leaders={leaders(settled, 10)} />
              : <div className="dnote">Trader records are for members. <a href={trial} data-unlock="tracker-leaders">Try 7 days for $1</a>.</div>}
          </Section>
        ) : null}

        <Section id="moves-h" title={t.kind === "filings" ? "Latest filings" : "Moves"} note={!paid ? <>You&apos;re seeing moves 30 minutes late. <a href={trial} data-unlock="tracker">Members see them live.</a></> : undefined}>
          {t.kind === "bets" ? (
            <nav className="dfilters" aria-label="Show">
              {SHOW.map(s => <Link key={s} className="chip2" aria-current={show === s ? "true" : undefined} href={s === "all" ? `/trackers/${t.slug}#moves-h` : `/trackers/${t.slug}?show=${s}#moves-h`}>{s[0]!.toUpperCase() + s.slice(1)}</Link>)}
            </nav>
          ) : null}
          {list.length ? (
            <ol className="feed2__list tmoves">{list.map(m => <li key={m.id}><MoveCard m={m} follow={cardFollow} trialHref={trial} /></li>)}</ol>
          ) : <div className="tempty"><p className="tempty__h">Nothing here yet</p><p>The next move that fits shows up here.</p></div>}
        </Section>

        {similar.length ? (
          <Section id="more-h" title="Similar trackers">
            <ol className="tlist tlist--grid">{similar.map(o => <TrackerRow key={o.slug} t={o} r={all?.get(o.slug)?.records.all ?? null} />)}</ol>
            <p className="tsec__foot"><Link className="btn btn--secondary" href="/trackers">All trackers <span className="arrow" aria-hidden="true">→</span></Link></p>
          </Section>
        ) : null}
      </main>
    </>
  );
}

/* A Polymarket trader's profile (/p/0x…). One headline (the name) and one action (Follow), then the data:
 *   Performance   profit over time (1W 1M 3M 1Y All, by the day each market resolved), the record, win rate, ROI,
 *                 rank among every trader with a record, edge (win rate − price paid, on their settled big moves)
 *   Stats         first seen, markets traded, average bet, biggest win, current streak, last 30 days
 *   Biggest wins and losses, by category, favorite vs underdog, when they trade (day × hour, New York)
 *   Open positions with the price since they bought, and every big move we have, a page at a time.
 * Stats come from the wallet's resolved positions (lib/profiles/trader.ts, 20+ resolved markets) and its big moves
 * (lib/stats.ts, 20+ settled). The numbers are for members and never reach a free viewer's browser. The public
 * Polymarket profile is linked for viewers outside the US only. */
import Link from "next/link";
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { LineChart } from "@/components/charts/LineChart";
import { BreakdownTable, cents, Heatmap, pct, pts, Section, signed, Table, Tiles, tone } from "@/components/stats/Stats";
import { polymarketProfileUrl } from "@/lib/exchanges/polymarket";
import { SourceA } from "../MoveCard";
import { profileSource } from "@/lib/moves/source";
import { isPaid } from "@/lib/plans";
import { dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { openPositions } from "@/lib/moves/pages";
import { walletLabel } from "@/lib/moves/records";
import { walletFace } from "@/lib/moves/avatar";
import { avatarsOrNone } from "@/lib/moves/avatar-store";
import { Avatar } from "../Avatar";
import { followList } from "@/lib/moves/store";
import { marketsFor, profitRank, recordOf, walletMoves, walletSettled, walletYear } from "@/lib/profiles/store";
import { showStats, traderStats } from "@/lib/profiles/trader";
import { CHART_WINDOWS, breakdown, heatmap, NOT_ENOUGH, perf, sideOf, SIDES } from "@/lib/stats";
import { countsToRecord } from "@/lib/trust";
import { FollowButton } from "../FollowButton";
import { MoveCard } from "../MoveCard";
import { calDate, followState, Locked } from "./shared";

export const PAGE_SIZE = 20;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const EMPTY_HIST = { moves: [], total: 0, firstAt: null };

export async function TraderProfile({ db, wallet, viewer, trial, now, page = 1 }: { db: Db | null; wallet: string; viewer: Viewer; trial: string; now: number; page?: number }) {
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const until = now - plan.delayMs;
  const [hist, rec, follows, positions, markets, avatars, settledAll, year] = await Promise.all([
    db ? walletMoves(db, wallet, until, PAGE_SIZE, (page - 1) * PAGE_SIZE).catch(() => EMPTY_HIST) : Promise.resolve(EMPTY_HIST),
    db ? recordOf(db, wallet).catch(() => null) : Promise.resolve(null),
    db && viewer.user ? followList(db, viewer.user.id) : Promise.resolve([]),
    paid ? openPositions(wallet, 12) : Promise.resolve(null),
    // Members only: a free viewer's page never holds the numbers.
    db && paid ? marketsFor(db, wallet).catch(() => []) : Promise.resolve([]),
    avatarsOrNone(db, [wallet]),
    db && paid ? walletSettled(db, wallet).catch(() => []) : Promise.resolve([]),
    db && paid ? walletYear(db, wallet, now).catch(() => []) : Promise.resolve([]),
  ]);
  const rawName = rec?.name ?? hist.moves.find(m => m.walletName)?.walletName ?? null;
  const name = walletLabel(wallet, rawName);
  const items = db ? await feedItems(db, hist.moves, viewer.plan, viewer.region, now) : [];
  const following = follows.some(f => f.kind === "trader" && f.target === wallet);
  const s = paid ? traderStats(markets, now) : null;
  const rank = db && s && showStats(s) ? await profitRank(db, s.profit).catch(() => null) : null;
  const settled = settledAll.filter(m => countsToRecord(m));
  const bp = perf(settled);
  const source = viewer.region === "non_us" ? polymarketProfileUrl(wallet) : null;
  const pages = Math.max(1, Math.ceil(hist.total / PAGE_SIZE));
  const windows = CHART_WINDOWS.map(w => ({ key: w.key, label: w.label, since: w.days === null ? null : now - w.days * 86_400_000 }));
  const sorted = [...markets].sort((a, b) => b.pnl - a.pnl);
  const wins = sorted.filter(m => m.pnl > 0).slice(0, 5), losses = sorted.filter(m => m.pnl < 0).reverse().slice(0, 5);
  const firstSeen = hist.firstAt ?? (markets.some(m => m.resolvedAt) ? Math.min(...markets.filter(m => m.resolvedAt).map(m => m.resolvedAt!)) : null);
  const streakText = s?.streak ? `${s.streak.n} ${s.streak.kind === "won" ? (s.streak.n === 1 ? "win" : "wins") : (s.streak.n === 1 ? "loss" : "losses")}` : "—";

  return (
    <>
      <header className="phead2">
        <Avatar face={walletFace(wallet, rawName, avatars)} size="profile" eager />
        <div className="phead2__copy">
          <p className="phead2__kicker">Polymarket trader</p>
          <h1 className="phead2__h">{name}</h1>
          <SourceA link={profileSource({ kind: "trader", wallet })} />
        </div>
        <div className="phead2__act"><FollowButton kind="trader" target={wallet} state={followState(viewer, following)} trialHref={trial} /></div>
      </header>
      <p className="dsec__note">One trader can use several wallets; these numbers cover this wallet only. <Link href="/data">About our data</Link></p>

      {!paid ? <Locked trial={trial} what="Their record is for members: net P&L over time, win rate, ROI, rank, edge, categories, open positions and every position." />
        : s && showStats(s) ? (
          <>
            <Section id="perf-h" title="Performance" note={`From ${s.resolved.toLocaleString("en-US")} resolved markets in Polymarket's public data${rec ? `, updated ${calDate(new Date(rec.updatedAt).toISOString().slice(0, 10))}` : ""}. Past results.`}>
              <LineChart points={s.series.map(p => ({ t: p.at, v: p.profit }))} windows={windows} format="money" label="Net P&L, every resolved market" empty="No resolved markets in this window." />
              <div className="dsub"><Tiles cols={3} label="Record" tiles={[
                { label: "Record", value: `${s.won.toLocaleString("en-US")}–${s.lost.toLocaleString("en-US")}` },
                { label: "Win rate", value: pct(s.won / s.resolved), tone: s.won / s.resolved >= 0.5 ? "money" : "loss" },
                { label: "All-time net P&L", value: signed(s.profit), tone: tone(s.profit) },
                { label: "ROI", value: s.roi === null ? "—" : pct(s.roi, 1), tone: tone(s.roi) },
                { label: "Rank by net P&L", value: rank ? `#${rank.rank.toLocaleString("en-US")}` : "—" },
                { label: "Edge vs. entry", value: bp.edge === null ? NOT_ENOUGH : pts(bp.edge), tone: tone(bp.edge) },
              ]} /></div>
              {rank ? <p className="dsec__note dsub">Rank among {rank.of.toLocaleString("en-US")} traders with 20+ resolved markets. Edge from {bp.settled} settled large positions.</p> : null}
            </Section>

            <Section id="stats-h" title="Stats">
              <Tiles cols={4} label="Stats" tiles={[
                { label: "First seen", value: firstSeen ? DATE.format(new Date(firstSeen)) : "—" },
                { label: "Markets traded", value: (s.resolved + (positions?.length ?? 0)).toLocaleString("en-US") },
                { label: "Average position size", value: dollars(s.avgBet) },
                { label: "Largest gain", value: signed(s.biggestWin), tone: "money" },
                { label: "Current streak", value: streakText, tone: s.streak ? (s.streak.kind === "won" ? "money" : "loss") : undefined },
                { label: "Last 30 days", value: s.last30.resolved ? `${s.last30.won}–${s.last30.resolved - s.last30.won}` : "—" },
                { label: "Last 30 days, net P&L", value: s.last30.resolved ? signed(s.last30.profit) : "—", tone: tone(s.last30.profit) },
                { label: "Large positions we hold", value: hist.total.toLocaleString("en-US") },
              ]} />
            </Section>

            <Section id="wl-h" title="Largest gains and losses">
              <div className="dgrid2">
                <Table label="Largest gains" head={["Market", "Net P&L"]} numeric={[1]} rows={wins.length ? wins.map(m => [m.title, <span key="p" className="money">{signed(m.pnl)}</span>]) : [["No winning markets", "—"]]} />
                <Table label="Largest losses" head={["Market", "Loss"]} numeric={[1]} rows={losses.length ? losses.map(m => [m.title, <span key="p" className="loss">{signed(m.pnl)}</span>]) : [["No losing markets", "—"]]} />
              </div>
            </Section>

            <Section id="cat-h" title="By category">
              <Table label="By category" head={["Category", "Markets", "W–L", "Win rate", "Net P&L"]} numeric={[1, 2, 3, 4]}
                rows={s.categories.map(c => [c.category, (c.won + c.lost).toLocaleString("en-US"), `${c.won}–${c.lost}`,
                  c.won + c.lost >= 20 ? pct(c.won / (c.won + c.lost)) : "—", <span key="p" className={tone(c.profit)}>{signed(c.profit)}</span>])} />
            </Section>

            <Section id="side-h" title="Favorite vs underdog" note="Their settled large positions, by their entry.">
              <BreakdownTable label="Favorite vs underdog" first="Entry" rows={breakdown(settled, m => sideOf(m.avgPrice), SIDES)} />
            </Section>

            <Section id="heat-h" title="When they trade" note={`Large positions over the last 12 months by day and hour, New York time (${year.length.toLocaleString("en-US")} positions).`}>
              {year.length ? <Heatmap grid={heatmap(year.map(at => ({ at })))} label="Large positions by weekday and hour" /> : <p className="dnote">No large positions in the last 12 months.</p>}
            </Section>
            {source ? <p className="dsec__note dsub"><a href={source} target="_blank" rel="noopener noreferrer">See their Polymarket profile</a></p> : null}
          </>
        ) : <p className="dnote">{NOT_ENOUGH}: we show stats once a wallet has 20 resolved markets{s && s.resolved ? ` (this one has ${s.resolved})` : ""}.</p>}

      {positions && positions.length ? (
        <Section id="pos-h" title="Open positions" note="From Polymarket's public data: what they hold now, their entry and the price since.">
          <Table label="Open positions" head={["Market", "Value", "Paid", "Now", "Since"]} numeric={[1, 2, 3, 4]}
            rows={positions.map(p => [
              <span key="t">{p.title}<span className="dtable__sub">{p.outcome}</span></span>, dollars(p.value), cents(p.avgPrice), cents(p.curPrice),
              p.avgPrice !== null && p.curPrice !== null ? <span key="c" className={tone(p.curPrice - p.avgPrice)}>{`${p.curPrice - p.avgPrice >= 0 ? "+" : "−"}${Math.abs(Math.round((p.curPrice - p.avgPrice) * 100))} pts`}</span> : "—",
            ])} />
        </Section>
      ) : null}

      <Section id="moves-h" title="Every large position" note={hist.total ? `${hist.total.toLocaleString("en-US")} large positions we've seen from this wallet${paid ? "" : " (30 minutes late)"}, newest first.` : undefined}>
        {items.length ? <ol className="feed2__list tmoves">{items.map(m => <li key={m.id}><MoveCard m={m} follow={followState(viewer, following)} trialHref={trial} /></li>)}</ol>
          : <p className="dnote">No large positions from this wallet{paid ? "" : " more than 30 minutes ago"} yet.</p>}
        {pages > 1 ? (
          <nav className="pager" aria-label="Pages">
            {page > 1 ? <a className="btn btn--secondary" href={`/p/${wallet}?page=${page - 1}#moves-h`}>Newer</a> : <span />}
            <span className="pager__n">Page {page} of {pages}</span>
            {page < pages ? <a className="btn btn--secondary" href={`/p/${wallet}?page=${page + 1}#moves-h`}>Older</a> : <span />}
          </nav>
        ) : null}
      </Section>
    </>
  );
}

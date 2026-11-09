/* A wallet's page (/wallet/0x…), in the terminal: a page head with the computed lead ("0xe2…aa made money on 41 of 63
 * resolved markets."), then numbered panels:
 *   KPIs       all-time P&L, largest gain, positions value now, markets traded (members)
 *   P&L        the line of net profit over every resolved market, and the record figures (members)
 *   Lately     the last 10 and the last 30 closed markets: won, lost (losses included) and the net (members)
 *   Today      the wallet's bets since midnight ET (visitors: 60 minutes late, without the side)
 *   Where      by category as bars, the largest gains and losses (members)
 *   Holding    open positions, entry → now (members)
 *   History    every large position we've seen, newest first, a page at a time (members)
 * Only ever the short address: never a name, a username, a face or who is behind it. The numbers are for members
 * and never reach a visitor's browser. The Polymarket profile is linked outside the US only. */
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { FollowLink } from "@/components/desk/Act";
import { pct, pts } from "@/components/stats/Stats";
import { polymarketProfileUrl } from "@/lib/exchanges/polymarket";
import { openPositions } from "@/lib/moves/pages";
import { walletLabel } from "@/lib/moves/records";
import { followList } from "@/lib/moves/store";
import { dollars } from "@/lib/money";
import { isPaid, TRIAL } from "@/lib/plans";
import { BetRow } from "@/components/brand/BetRow";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
import { Crumbs, TermHead } from "./Entity";
import { betPath } from "@/lib/entities/slug";
import { midnightET, recentBets, VISITOR_DELAY_MS, type BoardBet } from "@/lib/millionaires/queries";
import { marketsFor, profitRank, recordOf, walletMoves, walletSettled } from "@/lib/profiles/store";
import { showStats, traderStats } from "@/lib/profiles/trader";
import { NOT_ENOUGH, perf } from "@/lib/stats";
import { countsToRecord } from "@/lib/trust";
import { Bars, Rows, SeriesChart, StatTiles } from "./Figures";
import { Insight, Pill } from "./index";

export const PAGE_SIZE = 20;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
const EMPTY_HIST = { moves: [], total: 0, firstAt: null };
const SOURCE = "Polymarket public data (positions, trades and resolved markets)";

export async function WalletProfile({ db, wallet, viewer, now, page = 1 }: { db: Db | null; wallet: string; viewer: Viewer; now: number; page?: number }) {
  const paid = isPaid(viewer.plan);
  const [hist, rec, follows, positions, markets, settledAll] = await Promise.all([
    db && paid ? walletMoves(db, wallet, now, PAGE_SIZE, (page - 1) * PAGE_SIZE).catch(() => EMPTY_HIST) : Promise.resolve(EMPTY_HIST),
    db ? recordOf(db, wallet).catch(() => null) : Promise.resolve(null),
    db && viewer.user ? followList(db, viewer.user.id).catch(() => []) : Promise.resolve([]),
    paid ? openPositions(wallet, 12).catch(() => null) : Promise.resolve(null),
    db && paid ? marketsFor(db, wallet).catch(() => []) : Promise.resolve([]),
    db && paid ? walletSettled(db, wallet).catch(() => []) : Promise.resolve([]),
  ]);
  const today: BoardBet[] = db ? await recentBets(db, { now, wallets: [wallet], since: midnightET(now), all: true, limit: 50, member: paid, delayMs: paid ? 0 : VISITOR_DELAY_MS }).catch(() => []) : [];
  // The last 10 and 30 closed markets, newest first, losses included.
  const closed = [...markets].filter(m => m.resolvedAt).sort((a, b) => b.resolvedAt! - a.resolvedAt!);
  const lastN = (n: number) => { const l = closed.slice(0, n); return { n: l.length, won: l.filter(m => m.pnl > 0).length, lost: l.filter(m => m.pnl < 0).length, net: l.reduce((a, m) => a + m.pnl, 0) }; };
  const last10 = lastN(10), last30 = lastN(30);
  const name = walletLabel(wallet, rec?.name ?? hist.moves.find(m => m.walletName)?.walletName ?? null);
  const following = follows.some(f => f.kind === "trader" && f.target === wallet);
  const s = paid ? traderStats(markets, now) : null;
  const stats = s && showStats(s) ? s : null;
  const rank = db && stats ? await profitRank(db, stats.profit).catch(() => null) : null;
  const bp = perf(settledAll.filter(m => countsToRecord(m)));
  const source = viewer.region === "non_us" ? polymarketProfileUrl(wallet) : null;
  const pages = Math.max(1, Math.ceil(hist.total / PAGE_SIZE));
  const sorted = [...markets].sort((a, b) => b.pnl - a.pnl);
  const wins = sorted.filter(m => m.pnl > 0).slice(0, 5), losses = sorted.filter(m => m.pnl < 0).reverse().slice(0, 5);
  const firstSeen = hist.firstAt ?? (markets.some(m => m.resolvedAt) ? Math.min(...markets.filter(m => m.resolvedAt).map(m => m.resolvedAt!)) : null);
  const cats = stats ? stats.categories.slice(0, 8) : [];
  const best = stats?.best ?? null;
  const held = positions?.length ? positions.reduce((t, p) => t + p.value, 0) : 0;
  let n = 0;
  const next = () => ++n;

  const lead = stats ? `${name} made money on ${stats.won.toLocaleString("en-US")} of ${stats.resolved.toLocaleString("en-US")} resolved markets.` : null;
  return (
    <div className="t-wrap t-page">
      <TermHead testid="wallet-hero"
        crumbs={<Crumbs trail={[["Wallets", "/wallets"], [name, `/wallet/${wallet}`]]} />}
        label={<>Polymarket wallet{rec?.name ? ` · ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : ""}</>}
        title={lead ? <Insight id="w-h" text={lead} fallback={[name]} size={56} /> : <h1 id="w-h" className="t-pagehead__h">{name}</h1>}
        sub="One person can use several wallets; these numbers cover this wallet only. Insidir never says who is behind a wallet."
        right={<div className="b-ctas">
          {paid ? <FollowLink wallet={wallet} initial={following} /> : <Pill href="/go" data-checkout="profile">Start for ${TRIAL.fee} to follow</Pill>}
          {source ? <a className="b-btn t-btn2" href={source} target="_blank" rel="noopener noreferrer">See their Polymarket profile</a> : null}
        </div>} />
      <PanelGrid>
        {!paid ? (
          <TPanel n={next()} title="Record" meta="MEMBERS" span={3} testid="profile-locked">
            <p className="t-strongline">Their record is for members: net profit over time, how often they make money, return, rank, categories, open positions and every large position.</p>
            <div className="b-ctas"><Pill href="/go" data-checkout="profile-locked">Start for ${TRIAL.fee}</Pill></div>
          </TPanel>
        ) : stats ? (
          <TPanel n={next()} title="Wallet monitor" meta={rec ? `UPDATED ${DATE.format(new Date(rec.updatedAt)).toUpperCase()}` : undefined} span={3} compact source={SOURCE} testid="wallet-kpis">
            <dl className="t-kpis">
              <div><dt className="t-label">All-time P&amp;L</dt><dd className={`t-kpi b-num ${stats.profit >= 0 ? "t-up" : "t-down"}`}>{signed(stats.profit)}</dd></div>
              <div><dt className="t-label">Largest gain</dt><dd className="t-kpi b-num">{signed(stats.biggestWin)}</dd></div>
              <div><dt className="t-label">Positions value now</dt><dd className="t-kpi b-num">{positions?.length ? dollars(held) : "—"}</dd></div>
              <div><dt className="t-label">Markets traded</dt><dd className="t-kpi b-num">{markets.length.toLocaleString("en-US")}</dd></div>
            </dl>
          </TPanel>
        ) : (
          <TPanel n={next()} title="Record" span={3} empty={`${NOT_ENOUGH}: we show a record once a wallet has 20 resolved markets${s && s.resolved ? ` (this one has ${s.resolved})` : ""}.`} />
        )}

        {stats ? (
          <TPanel n={next()} title="Net P&L, every resolved market" meta={`${stats.resolved.toLocaleString("en-US")} RESOLVED`} span={2} source={SOURCE} testid="wallet-profit">
            <Insight id="w-p" as="h2" text={`${signed(stats.profit)} all-time${stats.roi !== null ? `, a ${pct(stats.roi)} return on ${dollars(stats.moneyIn)} put in` : ""}.`} fallback={["Profit."]} size={52} />
            <SeriesChart points={stats.series.map(p => ({ t: p.at, v: p.profit }))} label="Net P&L, every resolved market" testid="profit-chart" />
            <p className="t-note">From {stats.resolved.toLocaleString("en-US")} resolved markets in Polymarket&apos;s public data{rec ? `, updated ${DATE.format(new Date(rec.updatedAt))}` : ""}. Past results.</p>
          </TPanel>
        ) : null}
        {stats ? (
          <TPanel n={next()} title="Record" meta="LOSSES INCLUDED" source={SOURCE}>
            <StatTiles label="Record" tiles={[
              { label: "Record", value: `${stats.won.toLocaleString("en-US")}–${stats.lost.toLocaleString("en-US")}` },
              { label: "Share won", value: pct(stats.won / stats.resolved) },
              { label: "All-time net P&L", value: signed(stats.profit) },
              { label: "ROI", value: stats.roi === null ? "Not enough data" : pct(stats.roi, 1) },
              ...(rank ? [{ label: "Rank by net P&L", value: `#${rank.rank.toLocaleString("en-US")} of ${rank.of.toLocaleString("en-US")}` }] : []),
              ...(bp.edge !== null ? [{ label: "Edge vs. entry", value: pts(bp.edge) }] : []),
              { label: "Largest gain", value: signed(stats.biggestWin) },
              { label: "Average position size", value: dollars(stats.avgBet) },
              ...(stats.last30.resolved ? [{ label: "Last 30 days", value: `${stats.last30.won}–${stats.last30.resolved - stats.last30.won}, ${signed(stats.last30.profit)}` }] : []),
              ...(firstSeen ? [{ label: "First seen", value: DATE.format(new Date(firstSeen)) }] : []),
            ]} />
          </TPanel>
        ) : null}

        {paid && last10.n ? (
          <TPanel n={next()} title="Lately, losses included" meta={`LAST ${last10.n}: ${last10.won}–${last10.lost}, ${signed(last10.net)}${last30.n > last10.n ? ` · LAST ${last30.n}: ${last30.won}–${last30.lost}, ${signed(last30.net)}` : ""}`} span={3} source={SOURCE} testid="wallet-lately">
            <Rows label="The last 10 closed" testid="wallet-last10" rows={closed.slice(0, 10).map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: <span className={m.pnl >= 0 ? "t-up" : "t-down"}>{signed(m.pnl)}</span> }))} />
            <p className="t-note" data-testid="wallet-record-link">Every position we&apos;ve flagged from this wallet, losses included: <a className="s-link" href={`/record?wallet=${wallet}`}>its record</a>{paid ? <> · Verify <a className="s-link" href={`https://polygonscan.com/address/${wallet}`} target="_blank" rel="noopener noreferrer" data-testid="wallet-verify">the wallet on Polygonscan</a></> : null}.</p>
          </TPanel>
        ) : null}

        <TPanel n={next()} title="Today's bets" meta={paid ? "SINCE MIDNIGHT ET · LIVE" : "60 MIN LATE · SIDE FOR MEMBERS"} span={3} source={SOURCE} fetchedAt={now} testid="wallet-today">
          {today.length ? <ul className="b-rows s-board" data-testid="wallet-today-rows">{today.map(b => <li key={b.id} data-entity="bet"><BetRow polymarket={viewer.region === "non_us"} bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
            : <p className="t-empty">No bets from this wallet since midnight ET{paid ? "" : " (an hour late)"}.</p>}
        </TPanel>

        {stats && (cats.length || wins.length || losses.length) ? (
          <TPanel n={next()} title="Where they make money" meta={best ? `BEST: ${best.category.toUpperCase()}` : undefined} span={3} source={SOURCE} testid="wallet-where">
            <Insight id="w-c" as="h2" text={best ? `Best in ${best.category}: ${best.won}–${best.lost}, ${signed(best.profit)}.` : null} fallback={["Where they make money."]} size={52} />
            <div className="t-cols3">
              {cats.length ? <div><p className="t-label">By category</p><Bars label="By category" rows={cats.map(c => ({ key: c.category, name: c.category, share: c.won / (c.won + c.lost), text: <>{c.won}–{c.lost} · <span className={c.profit >= 0 ? "t-up" : "t-down"}>{signed(c.profit)}</span></> }))} /></div> : null}
              {wins.length ? <div><p className="t-label">Largest gains</p><Rows label="Largest gains" rows={wins.map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: <span className="t-up">{signed(m.pnl)}</span> }))} /></div> : null}
              {losses.length ? <div><p className="t-label">Largest losses</p><Rows label="Largest losses" rows={losses.map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: <span className="t-down">{signed(m.pnl)}</span> }))} /></div> : null}
            </div>
          </TPanel>
        ) : null}

        {positions && positions.length ? (
          <TPanel n={next()} title="Open positions" meta={`${positions.length} · ${dollars(held)} NOW`} span={3} source="Polymarket public data (positions)" fetchedAt={now} testid="wallet-open">
            <Insight id="w-o" as="h2" text={`Holding ${positions.length} ${positions.length === 1 ? "position" : "positions"} worth ${dollars(held)} now.`} fallback={["Open now."]} size={52} />
            <Rows label="Open positions" rows={positions.map(p => ({ key: `${p.marketId}:${p.outcome}`, title: p.title, sub: <>{p.outcome} · in at {cents(p.avgPrice)} · now {cents(p.curPrice)}{p.avgPrice !== null && p.curPrice !== null && Math.round((p.curPrice - p.avgPrice) * 100) ? <span className={p.curPrice > p.avgPrice ? "t-up" : "t-down"}> {p.curPrice > p.avgPrice ? "up" : "down"} {Math.abs(Math.round((p.curPrice - p.avgPrice) * 100))}¢</span> : null}</>, right: dollars(p.value) }))} />
          </TPanel>
        ) : null}

        {paid && hist.total ? (
          <TPanel n={next()} id="moves-h" title="Every large position" meta={`${hist.total.toLocaleString("en-US")} SEEN · NEWEST FIRST`} span={3} source={SOURCE} testid="wallet-history">
            <Insight id="w-m" as="h2" text={`${hist.total.toLocaleString("en-US")} large ${hist.total === 1 ? "position" : "positions"} seen from this wallet.`} fallback={["Every large position."]} size={52} />
            <Rows label="Every large position" testid="wallet-moves" rows={hist.moves.map(m => ({
              key: m.id, attrs: { "data-move": m.id }, title: m.marketTitle || m.eventTitle,
              sub: <>{dollars(m.amount)} on <b>{m.outcome}</b> at {cents(m.avgPrice)} · {DATE.format(new Date(m.at))}</>,
              right: m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : m.result === "void" ? "Void" : "Open",
            }))} />
            {pages > 1 ? (
              <nav className="t-pager" aria-label="Pages">
                {page > 1 ? <a className="t-btn2" href={`/wallet/${wallet}?page=${page - 1}#moves-h`}>Newer</a> : null}
                <span className="t-label">Page {page} of {pages}</span>
                {page < pages ? <a className="t-btn2" href={`/wallet/${wallet}?page=${page + 1}#moves-h`}>Older</a> : null}
              </nav>
            ) : null}
          </TPanel>
        ) : null}
      </PanelGrid>
      <p className="t-disclaim">Information, not advice.</p>
    </div>
  );
}

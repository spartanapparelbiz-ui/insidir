/* A wallet's page (/wallet/0x…), in the homepage's stages. Each stage opens with a sentence computed from its record:
 *   1 Who        "0xe2…aa made money on 41 of 63 resolved markets." (members) / the short address and Follow (visitors)
 *   1b Lately    the last 10 and the last 30 closed markets: won, lost (losses included) and the net (members)
 *   1c Today     the wallet's bets since midnight ET (visitors: 60 minutes late, without the side)
 *   2 Profit     "+$1.2M all-time, a 95% return on $1.3M put in.": the line of net profit, then the figures
 *   3 Where      "Best in NFL: 20–8, +$410K.": by category as bars, the biggest gains and losses
 *   4 Holding    "Holding 6 positions worth $340K now.": open positions, entry → now
 *   5 History    every large position we've seen, newest first, a page at a time
 * Only ever the short address: never a name, a username, a face or who is behind it. The numbers are for members
 * and never reach a visitor's browser. The Polymarket profile is linked outside the US only. */
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { FollowLink } from "@/components/desk/Act";
import { pct, pts } from "@/components/stats/Stats";
import { PHOTOS } from "@/lib/brand/images";
import { polymarketProfileUrl } from "@/lib/exchanges/polymarket";
import { openPositions } from "@/lib/moves/pages";
import { walletLabel } from "@/lib/moves/records";
import { followList } from "@/lib/moves/store";
import { dollars } from "@/lib/money";
import { isPaid, TRIAL } from "@/lib/plans";
import { BetRow } from "@/components/brand/BetRow";
import { Crumbs } from "./Entity";
import { betPath } from "@/lib/entities/slug";
import { midnightET, recentBets, VISITOR_DELAY_MS, type BoardBet } from "@/lib/millionaires/queries";
import { marketsFor, profitRank, recordOf, walletMoves, walletSettled } from "@/lib/profiles/store";
import { showStats, traderStats } from "@/lib/profiles/trader";
import { NOT_ENOUGH, perf } from "@/lib/stats";
import { countsToRecord } from "@/lib/trust";
import { Bars, Rows, SeriesChart, StatTiles } from "./Figures";
import { Insight, Lines, Panel, Pill, Stage } from "./index";
import { walletVerdict } from "@/lib/verified/board";
import { Last10, VerifiedChecks } from "./VerifiedBoard";

export const PAGE_SIZE = 20;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
const EMPTY_HIST = { moves: [], total: 0, firstAt: null };

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

  const lead = stats ? `${name} made money on ${stats.won.toLocaleString("en-US")} of ${stats.resolved.toLocaleString("en-US")} resolved markets.` : null;
  // Who to copy: the Verified checks and why, the last 10 settled trades (lib/verified), for members.
  const verdict = db && paid ? await walletVerdict(db, wallet, viewer.user?.id).catch(() => null) : null;
  return (
    <>
      <Stage bg={{ kind: "photo", photo: PHOTOS.cta, dark: 0.55, priority: true }} first testid="wallet-hero" labelledBy="w-h">
        <div className="b-head">
          <Crumbs trail={[["Wallets", "/wallets"], [name, `/wallet/${wallet}`]]} />
          <p className="b-label" data-m="lift">Polymarket wallet{rec?.name ? ` · ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : ""}</p>
          {lead ? <Insight id="w-h" text={lead} fallback={[name]} size={56} /> : <Lines as="h1" id="w-h" lines={[name]} size={64} />}
          <p className="b-sub" data-m="lift">One person can use several wallets; these numbers cover this wallet only. Insidir never says who is behind a wallet.</p>
        </div>
        <div className="b-center"><div className="b-ctas">
          {paid ? <FollowLink wallet={wallet} initial={following} /> : <Pill href="/go" data-checkout="profile">Start for ${TRIAL.fee} to follow</Pill>}
          {source ? <a className="b-btn b-btn-lg b-ghost" href={source} target="_blank" rel="noopener noreferrer">See their Polymarket profile</a> : null}
        </div></div>
        {!paid ? (
          <Panel className="s-col" testid="profile-locked">
            <p className="s-strong">Their record is for members: net profit over time, how often they make money, return, rank, categories, open positions and every large position.</p>
            <div className="b-ctas"><Pill href="/go" data-checkout="profile-locked">Start for ${TRIAL.fee}</Pill></div>
          </Panel>
        ) : stats ? null : <p className="b-empty">{NOT_ENOUGH}: we show a record once a wallet has 20 resolved markets{s && s.resolved ? ` (this one has ${s.resolved})` : ""}.</p>}
      </Stage>

      {verdict ? (
          <Stage bg={{ kind: "globe", dark: 0.7 }} testid="wallet-verified" labelledBy="w-v">
            <div className="b-head"><Lines as="h2" id="w-v" lines={[verdict.verified ? "Verified." : "Not verified."]} size={48} /><p className="b-sub">The four tests behind the badge, with the numbers.</p></div>
            <Panel className="s-col s-col--wide"><VerifiedChecks w={verdict} /></Panel>
            <Panel className="s-col s-col--wide"><p className="b-label">Last 10 settled trades</p><Last10 rows={verdict.last10} /></Panel>
          </Stage>
        ) : null}

      {paid && last10.n ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.65 }} testid="wallet-lately" labelledBy="w-l">
          <div className="b-head"><Lines as="h2" id="w-l" lines={["Lately, losses included."]} size={48} /></div>
          <StatTiles label="Lately" tiles={[
            { label: `Last ${last10.n} closed`, value: `${last10.won}–${last10.lost}, ${signed(last10.net)}` },
            ...(last30.n > last10.n ? [{ label: `Last ${last30.n} closed`, value: `${last30.won}–${last30.lost}, ${signed(last30.net)}` }] : []),
          ]} />
          <Panel className="s-col s-col--wide"><Rows label="The last 10 closed" testid="wallet-last10" rows={closed.slice(0, 10).map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: signed(m.pnl) }))} /></Panel>
          <p className="b-small b-center" data-testid="wallet-record-link">Every position we&apos;ve flagged from this wallet, losses included: <a className="s-link" href={`/record?wallet=${wallet}`}>its record</a>{paid ? <> · Verify <a className="s-link" href={`https://polygonscan.com/address/${wallet}`} target="_blank" rel="noopener noreferrer" data-testid="wallet-verify">the wallet on Polygonscan</a></> : null}.</p>
        </Stage>
      ) : null}

      <Stage bg={{ kind: "globe", dark: 0.65 }} testid="wallet-today" labelledBy="w-t">
        <div className="b-head"><Lines as="h2" id="w-t" lines={["Today's trades."]} size={48} />{paid ? null : <p className="b-sub">60 minutes late, without the side. Members see each one live.</p>}</div>
        {today.length ? <ul className="b-rows s-board" data-testid="wallet-today-rows">{today.map(b => <li key={b.id} data-entity="bet"><BetRow polymarket={viewer.region === "non_us"} bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
          : <p className="b-empty b-center">No trades from this wallet since midnight ET{paid ? "" : " (an hour late)"}.</p>}
      </Stage>

      {stats ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.6 }} testid="wallet-profit" labelledBy="w-p">
          <div className="b-head">
            <Insight id="w-p" as="h2" text={`${signed(stats.profit)} all-time${stats.roi !== null ? `, a ${pct(stats.roi)} return on ${dollars(stats.moneyIn)} put in` : ""}.`} fallback={["Profit."]} size={52} />
            <p className="b-sub">From {stats.resolved.toLocaleString("en-US")} resolved markets in Polymarket&apos;s public data{rec ? `, updated ${DATE.format(new Date(rec.updatedAt))}` : ""}. Past results.</p>
          </div>
          <Panel className="s-col s-col--wide"><SeriesChart points={stats.series.map(p => ({ t: p.at, v: p.profit }))} label="Net P&L, every resolved market" testid="profit-chart" /></Panel>
          <StatTiles label="Record" tiles={[
            { label: "Record", value: `${stats.won.toLocaleString("en-US")}–${stats.lost.toLocaleString("en-US")}` },
            { label: "Win rate", value: pct(stats.won / stats.resolved) },
            { label: "All-time net P&L", value: signed(stats.profit) },
            { label: "ROI", value: stats.roi === null ? "Not enough data" : pct(stats.roi, 1) },
            ...(rank ? [{ label: "Rank by net P&L", value: `#${rank.rank.toLocaleString("en-US")} of ${rank.of.toLocaleString("en-US")}` }] : []),
            ...(bp.edge !== null ? [{ label: "Edge vs. entry", value: pts(bp.edge) }] : []),
            { label: "Largest gain", value: signed(stats.biggestWin) },
            { label: "Average position size", value: dollars(stats.avgBet) },
            ...(stats.last30.resolved ? [{ label: "Last 30 days", value: `${stats.last30.won}–${stats.last30.resolved - stats.last30.won}, ${signed(stats.last30.profit)}` }] : []),
            ...(firstSeen ? [{ label: "First seen", value: DATE.format(new Date(firstSeen)) }] : []),
          ]} />
        </Stage>
      ) : null}

      {stats && (cats.length || wins.length || losses.length) ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.golf, dark: 0.6 }} testid="wallet-where" labelledBy="w-c">
          <div className="b-head"><Insight id="w-c" as="h2" text={best ? `Best in ${best.category}: ${best.won}–${best.lost}, ${signed(best.profit)}.` : null} fallback={["Where they make money."]} size={52} /></div>
          {cats.length ? <Panel className="s-col s-col--wide"><Bars label="By category" rows={cats.map(c => ({ key: c.category, name: c.category, share: c.won / (c.won + c.lost), text: <>{c.won}–{c.lost} · {signed(c.profit)}</> }))} /></Panel> : null}
          <div className="s-split">
            {wins.length ? <Panel><p className="b-label">Largest gains</p><Rows label="Largest gains" rows={wins.map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: signed(m.pnl) }))} /></Panel> : null}
            {losses.length ? <Panel><p className="b-label">Largest losses</p><Rows label="Largest losses" rows={losses.map(m => ({ key: m.marketId, title: m.title, sub: `${dollars(m.moneyIn)} in`, right: signed(m.pnl) }))} /></Panel> : null}
          </div>
        </Stage>
      ) : null}

      {positions && positions.length ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.tech, dark: 0.6 }} testid="wallet-open" labelledBy="w-o">
          <div className="b-head"><Insight id="w-o" as="h2" text={`Holding ${positions.length} ${positions.length === 1 ? "position" : "positions"} worth ${dollars(held)} now.`} fallback={["Open now."]} size={52} /><p className="b-sub">From Polymarket&apos;s public data: what they hold, their entry and the price now.</p></div>
          <Panel className="s-col s-col--wide"><Rows label="Open positions" rows={positions.map(p => ({ key: `${p.marketId}:${p.outcome}`, title: p.title, sub: <>{p.outcome} · in at {cents(p.avgPrice)} · now {cents(p.curPrice)}{p.avgPrice !== null && p.curPrice !== null && Math.round((p.curPrice - p.avgPrice) * 100) ? <span className={p.curPrice > p.avgPrice ? "s-up" : "s-down"}> {p.curPrice > p.avgPrice ? "up" : "down"} {Math.abs(Math.round((p.curPrice - p.avgPrice) * 100))}¢</span> : null}</>, right: dollars(p.value) }))} /></Panel>
        </Stage>
      ) : null}

      {paid && hist.total ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.oil, dark: 0.65 }} testid="wallet-history" labelledBy="w-m">
          <div className="b-head" id="moves-h"><Insight id="w-m" as="h2" text={`${hist.total.toLocaleString("en-US")} large ${hist.total === 1 ? "position" : "positions"} seen from this wallet.`} fallback={["Every large position."]} size={52} /><p className="b-sub">Newest first.</p></div>
          <Panel className="s-col s-col--wide">
            <Rows label="Every large position" testid="wallet-moves" rows={hist.moves.map(m => ({
              key: m.id, attrs: { "data-move": m.id }, title: m.marketTitle || m.eventTitle,
              sub: <>{dollars(m.amount)} on <b>{m.outcome}</b> at {cents(m.avgPrice)} · {DATE.format(new Date(m.at))}</>,
              right: m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : m.result === "void" ? "Void" : "Open",
            }))} />
            {pages > 1 ? (
              <nav className="b-ctas" aria-label="Pages">
                {page > 1 ? <Pill href={`/wallet/${wallet}?page=${page - 1}#moves-h`} kind="ghost">Newer</Pill> : null}
                <span className="b-small">Page {page} of {pages}</span>
                {page < pages ? <Pill href={`/wallet/${wallet}?page=${page + 1}#moves-h`} kind="ghost">Older</Pill> : null}
              </nav>
            ) : null}
          </Panel>
          <p className="b-small b-center">Information, not advice.</p>
        </Stage>
      ) : null}
    </>
  );
}

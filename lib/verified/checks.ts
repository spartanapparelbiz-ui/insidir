/* Verified wallets: who to copy. A wallet up $1M+ all time earns "Verified" only if it passes all four checks, each
 * from its public Polymarket record (lib/verified/read.ts), re-run daily (worker verified:check):
 *   settled        MIN_SETTLED or more settled (closed) positions
 *   months         profitable in at least 2 of the last 3 months (30-day blocks ending today, realized profit by the
 *                  day each position closed)
 *   concentration  its single most profitable position is at most MAX_ONE_SHARE of its all-time profit
 *   hedging        it holds both sides of the same market in under HEDGE_SHARE of the markets it traded in 90 days
 * Each check keeps its numbers, so a wallet's page shows why it passed or failed. Pure; no I/O. */

export const MIN_PNL = 1_000_000;
export const MIN_SETTLED = 50;
export const MONTH_MS = 30 * 86_400_000;
export const MONTHS = 3;
export const MIN_GOOD_MONTHS = 2;
export const MAX_ONE_SHARE = 0.4;
/** "Regularly holds both sides": in 1 of every 5 markets it traded or more. */
export const HEDGE_SHARE = 0.2;

export interface ClosedPos { marketId: string; outcomeIndex: number; pnl: number; moneyIn: number; at: number; title: string; category: string; outcome: string | null;
  /** When it first bought in (ms). */
  start: number }
export interface OpenPos { marketId: string; outcomeIndex: number; value: number; moneyIn: number; start: number }
export interface WalletRead {
  wallet: string; name: string | null; pnl: number;
  /** Settled positions counted (at least this many); `complete` when every one was read. */
  settled: number;
  /** Closed positions in the last MONTHS months, newest first; `windowComplete` false when paging stopped before 90 days. */
  recent: ClosedPos[]; windowComplete: boolean;
  open: OpenPos[];
  /** The single most profitable closed position (realized), all time. */
  biggestWin: number;
  /** Open positions' value now and its cash on Polygon (USDC), for the bankroll estimate; null when unread. */
  openValue: number | null; cash: number | null;
}

export type CheckKey = "settled" | "months" | "concentration" | "hedging";
export interface Check { key: CheckKey; pass: boolean; label: string; detail: string }
export interface Verdict {
  wallet: string; verified: boolean; checks: Check[];
  months: number[];
  pnl30: number; pnl90: number; won: number; lost: number;
  byCategory: Array<{ category: string; won: number; lost: number; pnl: number }>;
  /** Bankroll estimate: the most it has had in open positions at once in 90 days (money in), or its open value and
   *  cash now when that's more; the average position as a share of it. Null when there's nothing to go on. */
  bankroll: number | null; avgSize: number | null; avgSizePct: number | null;
  /** Share of 90-day markets held on both sides. */
  hedgeShare: number;
}

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function verdict(r: WalletRead, now: number): Verdict {
  // Months: three 30-day blocks ending now, newest first.
  const months = Array.from({ length: MONTHS }, (_, i) => r.recent.filter(p => p.at <= now - i * MONTH_MS && p.at > now - (i + 1) * MONTH_MS).reduce((s, p) => s + p.pnl, 0));
  const good = months.filter(m => m > 0).length;
  // Hedging: markets with both outcomes held, over the 90 days' closed and the open positions.
  const sides = new Map<string, Set<number>>();
  for (const p of [...r.recent, ...r.open]) { const s = sides.get(p.marketId) ?? new Set<number>(); s.add(p.outcomeIndex); sides.set(p.marketId, s); }
  const both = [...sides.values()].filter(s => s.size > 1).length, hedgeShare = sides.size ? both / sides.size : 0;
  const oneShare = r.pnl > 0 ? r.biggestWin / r.pnl : 1;

  const checks: Check[] = [
    { key: "settled", pass: r.settled >= MIN_SETTLED, label: `${MIN_SETTLED}+ settled trades`,
      detail: `${r.settled >= MIN_SETTLED ? `${MIN_SETTLED}+` : r.settled} settled.` },
    { key: "months", pass: r.windowComplete && good >= MIN_GOOD_MONTHS, label: `Profitable in ${MIN_GOOD_MONTHS} of the last ${MONTHS} months`,
      detail: r.windowComplete ? `Last 30 days ${money(months[0]!)}, 30–60 days ${money(months[1]!)}, 60–90 days ${money(months[2]!)}: ${good} of ${MONTHS} profitable.`
        : "Too many trades to read 90 days of history." },
    { key: "concentration", pass: oneShare <= MAX_ONE_SHARE, label: `No single trade over ${pct(MAX_ONE_SHARE)} of its profit`,
      detail: `Its biggest win, ${money(r.biggestWin)}, is ${pct(Math.max(0, oneShare))} of its ${money(r.pnl)} all-time profit.` },
    { key: "hedging", pass: hedgeShare < HEDGE_SHARE, label: "Not hedging (both sides of a market)",
      detail: `Held both sides in ${both} of ${sides.size} markets in 90 days (${pct(hedgeShare)}; under ${pct(HEDGE_SHARE)} passes).` },
  ];

  const in30 = r.recent.filter(p => p.at > now - MONTH_MS);
  const won = r.recent.filter(p => p.pnl > 0).length, lost = r.recent.filter(p => p.pnl < 0).length;
  const cats = new Map<string, { won: number; lost: number; pnl: number }>();
  for (const p of r.recent) { const c = cats.get(p.category) ?? { won: 0, lost: 0, pnl: 0 }; if (p.pnl > 0) c.won++; else if (p.pnl < 0) c.lost++; c.pnl += p.pnl; cats.set(p.category, c); }
  const sized = r.recent.filter(p => p.moneyIn > 0);
  const avgSize = sized.length ? sized.reduce((s, p) => s + p.moneyIn, 0) / sized.length : null;
  const bankroll = Math.max(peakExposure([...r.recent.map(p => ({ start: p.start, end: p.at, money: p.moneyIn })), ...r.open.map(p => ({ start: p.start, end: now, money: p.moneyIn }))]), (r.openValue ?? 0) + (r.cash ?? 0));
  return {
    wallet: r.wallet, verified: checks.every(c => c.pass), checks, months,
    pnl30: in30.reduce((s, p) => s + p.pnl, 0), pnl90: r.recent.reduce((s, p) => s + p.pnl, 0), won, lost,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.won + b.lost - (a.won + a.lost)),
    bankroll: bankroll && bankroll > 0 ? bankroll : null, avgSize, avgSizePct: bankroll && bankroll > 0 && avgSize !== null ? avgSize / bankroll : null,
    hedgeShare,
  };
}

/** The most money held in open positions at the same moment: a sweep over each position's [start, end]. */
export function peakExposure(ps: ReadonlyArray<{ start: number; end: number; money: number }>): number {
  const ev: Array<[number, number]> = [];
  for (const p of ps) if (p.money > 0 && p.start > 0) { ev.push([p.start, p.money]); ev.push([Math.max(p.end, p.start), -p.money]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
  return peak;
}

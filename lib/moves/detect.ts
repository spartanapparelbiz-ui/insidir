/* Move detection (docs/INSIDIR-V2.md §3), pure.
 *   Polymarket: a wallet's BUY fills in one market and outcome, each within MERGE_WINDOW_MS of the previous one,
 *   merge into one move; it counts when the total reaches WHALE_MIN_POLY.
 *   Kalshi: one trade of at least WHALE_MIN_KALSHI.
 *   Noise, skipped: average prices above 97¢ or below 3¢; wallets that bought both sides of the same market within
 *   an hour (market makers); wallets with more than 300 trades a day. Sells are not moves: they take money out. */
import type { Fill, Move, Tab } from "./types";
import { classify } from "./classify";

export const WHALE_MIN_POLY = Number(process.env.WHALE_MIN_POLY ?? 10_000);
export const WHALE_MIN_KALSHI = Number(process.env.WHALE_MIN_KALSHI ?? 5_000);
export const MERGE_WINDOW_MS = 10 * 60_000;
export const PRICE_MAX = 0.97;
export const PRICE_MIN = 0.03;
export const BOTH_SIDES_WINDOW_MS = 60 * 60_000;
export const MAX_TRADES_PER_DAY = 300;

export const priceOk = (p: number): boolean => p >= PRICE_MIN && p <= PRICE_MAX;

/** A wallet's recent trades, for the market-maker and trades-per-day checks. */
export interface WalletTrade { marketId: string; outcomeSide: "yes" | "no"; side: "BUY" | "SELL"; at: number }

/** True when the wallet looks like a market maker or a bot: more than 300 trades in the last day, or BUYs on both
 *  sides of `marketId` within an hour of each other. */
export function noisyWallet(trades: readonly WalletTrade[], marketId: string, now: number): boolean {
  if (trades.filter(t => t.at >= now - 86_400_000).length > MAX_TRADES_PER_DAY) return true;
  const buys = trades.filter(t => t.marketId === marketId && t.side === "BUY").sort((a, b) => a.at - b.at);
  for (let i = 0; i < buys.length; i++) {
    for (let j = i + 1; j < buys.length && buys[j]!.at - buys[i]!.at <= BOTH_SIDES_WINDOW_MS; j++) {
      if (buys[j]!.outcomeSide !== buys[i]!.outcomeSide) return true;
    }
  }
  return false;
}

/** Classification and link for a market, from the stored market (or the fill alone). */
export interface MarketInfo { category: string; labels: string[]; url: string | null }

function toMove(id: string, fills: readonly Fill[], info: MarketInfo | undefined): Move {
  const f0 = fills[0]!;
  const amount = fills.reduce((s, f) => s + f.contracts * f.price, 0);
  const contracts = fills.reduce((s, f) => s + f.contracts, 0);
  const { tab, league } = classify(info?.category ?? "other", [f0.eventTitle, f0.marketTitle, ...(info?.labels ?? [])]);
  return {
    id, source: f0.source, marketId: f0.marketId, eventTitle: f0.eventTitle, marketTitle: f0.marketTitle,
    outcome: f0.outcome, outcomeSide: f0.outcomeSide,
    amount: Math.round(amount * 100) / 100, avgPrice: contracts > 0 ? amount / contracts : f0.price,
    wallet: f0.wallet, walletName: f0.walletName, at: f0.at, lastAt: fills[fills.length - 1]!.at, fills: fills.length,
    tab: tab as Tab, league, category: info?.category ?? "other", url: info?.url ?? f0.url, result: null, settledAt: null,
  };
}

/** Polymarket fills → moves. Groups each wallet's BUY fills per market and outcome into runs (a gap over 10 minutes
 *  starts a new run); a run is a move when it adds up to `min` and its average price is between 3¢ and 97¢. */
export function polymarketMoves(fills: readonly Fill[], info: ReadonlyMap<string, MarketInfo>, min = WHALE_MIN_POLY): Move[] {
  const groups = new Map<string, Fill[]>();
  for (const f of fills) {
    if (f.source !== "polymarket" || f.side !== "BUY" || !f.wallet) continue;
    const k = `${f.wallet}|${f.marketId}|${f.outcomeSide}`;
    const g = groups.get(k);
    if (g) g.push(f); else groups.set(k, [f]);
  }
  const out: Move[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.at - b.at);
    let run: Fill[] = [];
    const flush = () => {
      if (!run.length) return;
      const m = toMove(`pm:${run[0]!.wallet}:${run[0]!.marketId}:${run[0]!.outcomeSide}:${run[0]!.at}`, run, info.get(run[0]!.marketId));
      if (m.amount >= min && priceOk(m.avgPrice)) out.push(m);
      run = [];
    };
    for (const f of g) {
      if (run.length && f.at - run[run.length - 1]!.at > MERGE_WINDOW_MS) flush();
      run.push(f);
    }
    flush();
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Kalshi trades → moves: one trade of at least `min` dollars at a price between 3¢ and 97¢. */
export function kalshiMoves(fills: readonly Fill[], info: ReadonlyMap<string, MarketInfo>, min = WHALE_MIN_KALSHI): Move[] {
  return fills
    .filter(f => f.source === "kalshi" && f.contracts * f.price >= min && priceOk(f.price))
    .map(f => toMove(`ks:${f.id}`, [f], info.get(f.marketId)))
    .sort((a, b) => b.at - a.at);
}

/** Folds newly seen fills into an existing move (same wallet, market and outcome, within the merge window). */
export function extendMove(m: Move, fills: readonly Fill[]): Move {
  const mine = fills.filter(f => f.wallet === m.wallet && f.marketId === m.marketId && f.outcomeSide === m.outcomeSide && f.side === "BUY" && f.at > m.lastAt
    && f.at - m.lastAt <= MERGE_WINDOW_MS).sort((a, b) => a.at - b.at);
  if (!mine.length) return m;
  let last = m.lastAt, amount = m.amount, contracts = m.amount / m.avgPrice, n = m.fills;
  for (const f of mine) {
    if (f.at - last > MERGE_WINDOW_MS) break;
    amount += f.contracts * f.price; contracts += f.contracts; last = f.at; n++;
  }
  return { ...m, amount: Math.round(amount * 100) / 100, avgPrice: amount / contracts, lastAt: last, fills: n };
}

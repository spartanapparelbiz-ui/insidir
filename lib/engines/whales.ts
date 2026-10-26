/* Pure helpers for the whale tracker. */

import type { WhaleTrade } from "../types";

/** Smallest trade, in dollars, that counts as a whale trade. */
export const WHALE_MIN_CASH = 10_000;

function tradeKey(t: WhaleTrade): string {
  if (t.txHash) return `${t.txHash.toLowerCase()}|${t.wallet.toLowerCase()}`;
  return `${t.wallet.toLowerCase()}|${t.marketId}|${t.outcome}|${t.side}|${t.timestamp}|${t.contracts}`;
}

/** Trades of at least `minCash`, deduplicated by txHash + wallet (first seen wins), newest first. */
export function bigTrades(trades: readonly WhaleTrade[], minCash: number = WHALE_MIN_CASH): WhaleTrade[] {
  const seen = new Set<string>();
  const out: WhaleTrade[] = [];
  for (const t of trades) {
    if (!Number.isFinite(t.cash) || t.cash < minCash) continue;
    const k = tradeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.sort((x, y) => y.timestamp - x.timestamp);
}

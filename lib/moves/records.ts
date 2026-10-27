/* Trader records (docs/INSIDIR-V2.md §3), pure. From a Polymarket wallet's real resolved positions: markets won and lost,
 * win rate, all-time profit and biggest win. A record is shown only with RECORD_MIN_RESOLVED resolved markets; a wallet
 * is a "top trader" only with that many and positive all-time profit. Never anything about who is behind a wallet. */
import type { TraderRecord } from "./types";

export const RECORD_MIN_RESOLVED = 20;

/** A resolved position: the market and what it made or lost, dollars. */
export interface ResolvedPosition { marketId: string; realizedPnl: number }

export function recordFrom(wallet: string, name: string | null, positions: readonly ResolvedPosition[], now: number): TraderRecord {
  // One result per market (a wallet can hold both outcomes of a market; the market's net is what it made there).
  const byMarket = new Map<string, number>();
  for (const p of positions) byMarket.set(p.marketId, (byMarket.get(p.marketId) ?? 0) + p.realizedPnl);
  let won = 0, lost = 0, profit = 0, biggestWin = 0;
  for (const pnl of byMarket.values()) {
    if (pnl > 0) won++; else lost++;
    profit += pnl;
    biggestWin = Math.max(biggestWin, pnl);
  }
  return { wallet, name, resolved: byMarket.size, won, lost, profit: Math.round(profit * 100) / 100, biggestWin: Math.round(biggestWin * 100) / 100, updatedAt: now };
}

export const hasRecord = (r: TraderRecord | null | undefined): r is TraderRecord => Boolean(r && r.resolved >= RECORD_MIN_RESOLVED);
export const isTopTrader = (r: TraderRecord | null | undefined): boolean => hasRecord(r) && r.profit > 0;

/** "0x12…ab" */
export const shortWallet = (w: string): string => (w.length > 8 ? `${w.slice(0, 4)}…${w.slice(-2)}` : w);

/** The public Polymarket name or pseudonym when it has one, else the short address. */
export const walletLabel = (wallet: string, name: string | null): string => (name && name.trim() && !/^0x[0-9a-f]{6,}/i.test(name) ? name.trim() : shortWallet(wallet));

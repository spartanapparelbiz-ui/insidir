/* Proven traders, pure. A Polymarket wallet is proven when, over its real resolved markets (Data API
 * /closed-positions), it has RECORD_MIN_RESOLVED+ markets and wins more often than the prices it paid said it would:
 * win rate > average price paid (weighted by money in). Paying 60¢ on average is a 60% bet; winning 70% of the time
 * beats it. A market counts once (a wallet can hold both outcomes): won when its net is above zero. */
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";

export interface PricedPosition { marketId: string; moneyIn: number; pnl: number; avgPrice: number | null }

export interface Proven { markets: number; won: number; winRate: number | null; avgPrice: number | null; proven: boolean }

export function provenFrom(positions: readonly PricedPosition[]): Proven {
  const net = new Map<string, number>();
  let paid = 0, money = 0;
  for (const p of positions) {
    net.set(p.marketId, (net.get(p.marketId) ?? 0) + p.pnl);
    if (p.avgPrice !== null && p.avgPrice > 0 && p.avgPrice < 1 && p.moneyIn > 0) { paid += p.avgPrice * p.moneyIn; money += p.moneyIn; }
  }
  const markets = net.size, won = [...net.values()].filter(v => v > 0).length;
  const winRate = markets ? won / markets : null, avgPrice = money > 0 ? paid / money : null;
  return { markets, won, winRate, avgPrice, proven: markets >= RECORD_MIN_RESOLVED && winRate !== null && avgPrice !== null && winRate > avgPrice };
}

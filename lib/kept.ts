/* "What you could have kept" (docs/BRIEF.md §4.9): for each stake on the slider, the same backtest the Receipts
 * page uses (lib/engines/receipts followGreen): every settled green deal of the period, each counted at the stake or
 * at what its books could actually fill when we found it, whichever is less, after fees, at its real settlement
 * (misses included). So the slider at $500 equals Receipts' "$500 per green deal" for the same rows. Computed on the
 * server for a fixed set of stakes, so no deal's size reaches the browser. */
import { followGreen, type Receipt } from "./engines/receipts";

export const SLIDER_STAKES = [100, 250, 500, 1000, 2500, 5000] as const;
/** Below this many settled green deals, the slider is hidden (one lucky deal isn't a week). */
export const SLIDER_MIN_DEALS = 3;

export interface KeptPoint { stake: number; kept: number; count: number; staked: number }

export function keptCurve(receipts: readonly Receipt[], stakes: readonly number[] = SLIDER_STAKES): KeptPoint[] | null {
  const pts = stakes.map(stake => {
    const r = followGreen(receipts, stake);
    return { stake, kept: r.realizedProfit, count: r.count, staked: r.staked };
  });
  return pts[0] && pts[0].count >= SLIDER_MIN_DEALS ? pts : null;
}

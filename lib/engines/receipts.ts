/* Settlement and an honest backtest of past opportunities. Pure.
 *
 * settle: each leg pays $1 per contract if its market settled on the leg's side, $0 if the other side, and the
 * leg's cost back if the market was voided (fees are assumed NOT refunded: conservative, unverified per venue).
 * realizedProfit = what the legs actually paid − cost − fees, so a void or an inconsistent settlement shows the real
 * result rather than the locked-in one. sameWay is true when no leg voided and the payout reached the locked
 * minimum.
 *
 * followGreen: "if you had followed every green alert with `stake` dollars": each settled green lock is scaled to
 * min(stake, its fillable outlay at alert time) — never more than was fillable — and realized profit is summed with
 * fees. Scaling is linear, which is conservative: a smaller order fills the cheapest levels first. */

import type { Opportunity, Side } from "../types";
import { money } from "./book";
import { marketKey } from "./common";

export { marketKey };

/** Money tolerance when comparing payouts. */
export const SETTLE_EPSILON = 1e-6;
/** Default stake per alert in the backtest, dollars. */
export const DEFAULT_STAKE = 500;

export interface Settlement {
  settled: boolean;
  sameWay: boolean;
  /** Payout received across legs, dollars (0 when not settled). */
  realizedPayout: number;
  realizedProfit: number;
}

/** `results` is keyed by marketKey(venue, id). */
export function settle(opp: Opportunity, results: ReadonlyMap<string, Side | "void">): Settlement {
  let payout = 0;
  let voided = false;
  for (const leg of opp.legs) {
    const r = results.get(marketKey(leg.venue, leg.marketId));
    if (r == null) return { settled: false, sameWay: false, realizedPayout: 0, realizedProfit: 0 };
    if (r === "void") { voided = true; payout += leg.cost; }
    else if (r === leg.side) payout += leg.contracts;
  }
  const realizedPayout = money(payout);
  const realizedProfit = money(payout - opp.cost - opp.fees);
  const sameWay = !voided && realizedPayout + SETTLE_EPSILON >= opp.payout;
  return { settled: true, sameWay, realizedPayout, realizedProfit };
}

export interface Receipt {
  opp: Opportunity;
  settlement: Settlement;
}

export interface BacktestResult {
  /** Green, settled locks counted. */
  count: number;
  /** Green locks not yet settled (left out). */
  pending: number;
  /** Counted locks that did not settle the same way. */
  broken: number;
  staked: number;
  realizedProfit: number;
  /** realizedProfit / staked, 0 when nothing staked. */
  roi: number;
}

export function followGreen(receipts: readonly Receipt[], stake: number = DEFAULT_STAKE): BacktestResult {
  let count = 0;
  let pending = 0;
  let broken = 0;
  let staked = 0;
  let profit = 0;
  for (const { opp, settlement } of receipts) {
    if (opp.safety !== "green" || opp.kind === "second_opinion") continue;
    if (!settlement.settled) { pending++; continue; }
    const outlay = opp.cost + opp.fees;
    if (!(outlay > 0) || !(stake > 0)) continue;
    const used = Math.min(stake, outlay);
    const scale = used / outlay;
    count++;
    if (!settlement.sameWay) broken++;
    staked += used;
    profit += settlement.realizedProfit * scale;
  }
  staked = money(staked);
  profit = money(profit);
  return { count, pending, broken, staked, realizedProfit: profit, roi: staked > 0 ? profit / staked : 0 };
}

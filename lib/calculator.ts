/* The deal calculator: plain math on an amount the user types. Pure: no I/O, no clock.
 *
 * Given the deal's legs (average price per contract and fee model) and how many complete sets the books can fill,
 * it finds the largest whole number of sets whose total cost (contracts × price on every leg) plus taker fees fits
 * inside the amount, and never more than the fillable sets. Fees are computed with lib/fees.ts takerFee as one fill
 * per leg at the leg's average price (Kalshi rounds that fee up to the next cent).
 *
 * It never returns negative numbers: an amount that buys nothing, or a size where fees eat the whole gap (Kalshi's
 * per-fill rounding can do that on very small sizes), returns zero sets with a reason. */
import { takerFee } from "./fees";
import type { FeeModel, Side, Venue } from "./types";

/** Float tolerance, in dollars, when checking that a total fits inside the typed amount. */
export const AMOUNT_EPSILON = 1e-9;
/** The largest amount the calculator accepts, in dollars (anything above is treated as this). */
export const MAX_AMOUNT = 10_000_000;

export interface CalcLeg {
  label: string;
  venue: Venue;
  side: Side;
  /** Average price per contract, 0..1, from the opportunity. */
  avgPrice: number;
  fee: FeeModel;
}

export interface CalcInput {
  legs: readonly CalcLeg[];
  /** What one complete set pays out (opportunity.payout / opportunity.sets), dollars. */
  payoutPerSet: number;
  /** Complete sets the books can fill (opportunity.sets). Fractions are floored. */
  maxSets: number;
}

export interface CalcLegResult {
  label: string;
  venue: Venue;
  side: Side;
  contracts: number;
  /** contracts × average price, dollars. */
  cost: number;
  /** Taker fee for this leg, dollars. */
  fee: number;
}

export type CalcReason =
  /** Sets were found. */
  | "ok"
  /** The amount doesn't cover one set with fees. */
  | "too_small"
  /** At the size that fits, fees take the whole gap. */
  | "no_profit"
  /** The amount or the deal's numbers aren't usable. */
  | "invalid";

export interface CalcResult {
  sets: number;
  legs: CalcLegResult[];
  /** Sum of leg costs before fees. */
  cost: number;
  fees: number;
  /** cost + fees. */
  total: number;
  payout: number;
  /** payout − total. */
  profit: number;
  /** profit / total, 0 when total is 0. */
  roi: number;
  /** True when the fillable size, not the amount, set the number of sets. */
  capped: boolean;
  reason: CalcReason;
}

const finite = (v: number): boolean => typeof v === "number" && Number.isFinite(v);

/** The numbers for exactly `sets` complete sets. */
export function priceSets(input: CalcInput, sets: number): Omit<CalcResult, "capped" | "reason"> {
  const n = Math.max(0, Math.floor(sets));
  const legs = input.legs.map(l => ({
    label: l.label, venue: l.venue, side: l.side, contracts: n,
    cost: n * l.avgPrice,
    fee: n > 0 ? takerFee(l.fee, n, l.avgPrice) : 0,
  }));
  const cost = legs.reduce((a, l) => a + l.cost, 0);
  const fees = legs.reduce((a, l) => a + l.fee, 0);
  const total = cost + fees;
  const payout = n * input.payoutPerSet;
  const profit = payout - total;
  return { sets: n, legs, cost, fees, total, payout, profit, roi: total > 0 ? profit / total : 0 };
}

function zero(input: CalcInput, reason: CalcReason): CalcResult {
  return { ...priceSets(input, 0), capped: false, reason };
}

/** The largest whole number of sets that fits inside `amount` dollars, capped at the fillable sets. */
export function calculate(input: CalcInput, amount: number): CalcResult {
  const valid = input.legs.length > 0 && finite(input.payoutPerSet) && input.payoutPerSet > 0 && finite(input.maxSets)
    && input.legs.every(l => finite(l.avgPrice) && l.avgPrice >= 0 && l.avgPrice <= 1);
  if (!valid || !finite(amount) || amount <= 0) return zero(input, "invalid");
  const budget = Math.min(amount, MAX_AMOUNT);
  const fillable = Math.max(0, Math.floor(input.maxSets));
  const perSet = input.legs.reduce((a, l) => a + l.avgPrice, 0);
  // Fees only add to the cost, so the amount over the fee-free price per set is an upper bound.
  const byAmount = perSet > 0 ? Math.floor(budget / perSet + AMOUNT_EPSILON) : fillable;
  let lo = 0;
  let hi = Math.min(fillable, byAmount);
  // Total cost is non-decreasing in sets, so binary search for the largest size that fits.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (priceSets(input, mid).total <= budget + AMOUNT_EPSILON) lo = mid;
    else hi = mid - 1;
  }
  if (lo === 0) return zero(input, fillable === 0 ? "invalid" : "too_small");
  const r = priceSets(input, lo);
  if (r.profit <= 0) return zero(input, "no_profit");
  const capped = lo === fillable && priceSets(input, fillable + 1).total <= budget + AMOUNT_EPSILON;
  return { ...r, capped, reason: "ok" };
}

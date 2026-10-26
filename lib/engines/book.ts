/* The core book walker. Pure.
 *
 * fillSets buys one contract of every leg per "set" and walks all the legs' ask books together, level by level,
 * adding sets while the marginal cost of one more set (sum over legs of ask + unrounded fee per contract) is below
 * the payout per set. Sets are whole contracts (floor), because Kalshi trades whole contracts and a set must be
 * complete on every leg. Exact totals are then computed with fees per price level (each level is a separate fill,
 * so Kalshi's round-up applies per level: conservative), and the size is trimmed back if rounding makes the
 * profit ≤ 0 or makes the last levels lose money: among the walked size, a few sizes below it, and every level
 * boundary below it, the most profitable size wins (ties: the larger). Asks at prices ≤ 0 or ≥ 1, non-finite, or with no size are ignored. */

import type { FeeModel, Level } from "../types";
import { marginalTakerFee, takerFee } from "../fees";

/** Size below this counts as an exhausted level (Polymarket sizes are decimals). */
export const SIZE_EPSILON = 1e-9;
/** Profit at or below this (dollars) counts as no profit. */
export const PROFIT_EPSILON = 1e-9;
/** How many single-set decrements to try, besides level boundaries, when trimming for rounding. */
export const TRIM_STEPS = 5;

export interface BookLeg {
  /** Asks for the side being bought. Any order; invalid levels are ignored. */
  asks: Level[];
  fee: FeeModel;
}

export interface LegFill {
  contracts: number;
  /** Volume-weighted average price. */
  avgPrice: number;
  /** Highest price level reached. */
  worstPrice: number;
  /** Cost before fees. */
  cost: number;
  /** Fees, summed per level. */
  fee: number;
  /** The per-level fills: price and contracts taken there. */
  fills: Level[];
}

export interface Fill {
  legs: LegFill[];
  sets: number;
  cost: number;
  fees: number;
  payout: number;
  profit: number;
  /** profit / (cost + fees) */
  roi: number;
}

export interface FillOptions {
  /** Cap on complete sets. */
  maxSets?: number;
  /** Require at least this profit per set (dollars), at the margin and on average. Default 0. */
  minProfitPerSet?: number;
}

/** Valid asks, cheapest first. */
export function cleanAsks(asks: readonly Level[]): Level[] {
  return asks
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.price > 0 && l.price < 1 && l.size > SIZE_EPSILON)
    .map((l) => ({ price: l.price, size: l.size }))
    .sort((x, y) => x.price - y.price);
}

/** Round money to a micro-dollar, removing float noise from sums. */
export function money(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Take exactly `contracts` from a clean ask book, with fees per level. Null if the book is too thin. */
export function takeContracts(asks: readonly Level[], contracts: number, fee: FeeModel): LegFill | null {
  if (!(contracts > 0)) return null;
  let left = contracts;
  let cost = 0;
  let fees = 0;
  let worst = 0;
  const fills: Level[] = [];
  for (const level of asks) {
    if (left <= SIZE_EPSILON) break;
    const take = Math.min(level.size, left);
    cost += take * level.price;
    fees += takerFee(fee, take, level.price);
    worst = level.price;
    fills.push({ price: level.price, size: take });
    left -= take;
  }
  if (left > SIZE_EPSILON) return null;
  return { contracts, avgPrice: cost / contracts, worstPrice: worst, cost: money(cost), fee: money(fees), fills };
}

function evaluate(books: Level[][], legs: readonly BookLeg[], sets: number, payoutPerSet: number): Fill | null {
  const out: LegFill[] = [];
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const leg = legs[i];
    if (!book || !leg) return null;
    const lf = takeContracts(book, sets, leg.fee);
    if (!lf) return null;
    out.push(lf);
  }
  const cost = money(out.reduce((s, l) => s + l.cost, 0));
  const fees = money(out.reduce((s, l) => s + l.fee, 0));
  const payout = money(sets * payoutPerSet);
  const profit = money(payout - cost - fees);
  const outlay = cost + fees;
  return { legs: out, sets, cost, fees, payout, profit, roi: outlay > 0 ? profit / outlay : 0 };
}

/** Walk every leg's asks together, buying complete sets while they pay. Null when nothing profitable fills. */
export function fillSets(legs: ReadonlyArray<BookLeg>, payoutPerSet: number, opts: FillOptions = {}): Fill | null {
  if (legs.length === 0 || !(payoutPerSet > 0)) return null;
  const books = legs.map((l) => cleanAsks(l.asks));
  if (books.some((b) => b.length === 0)) return null;
  const minProfit = opts.minProfitPerSet ?? 0;
  const cap = opts.maxSets != null && opts.maxSets >= 0 ? Math.floor(opts.maxSets) : Number.POSITIVE_INFINITY;
  if (cap < 1) return null;

  // Continuous walk with unrounded marginal fees.
  const idx = books.map(() => 0);
  const rem = books.map((b) => (b[0] as Level).size);
  let walked = 0;
  for (;;) {
    if (walked >= cap - SIZE_EPSILON) break;
    let marginal = 0;
    let step = cap - walked;
    let exhausted = false;
    for (let i = 0; i < books.length; i++) {
      const level = books[i]?.[idx[i] as number];
      if (!level) { exhausted = true; break; }
      marginal += level.price + marginalTakerFee((legs[i] as BookLeg).fee, level.price);
      step = Math.min(step, rem[i] as number);
    }
    if (exhausted || !(marginal < payoutPerSet - minProfit)) break;
    walked += step;
    for (let i = 0; i < books.length; i++) {
      const r = (rem[i] as number) - step;
      if (r <= SIZE_EPSILON) {
        const next = (idx[i] as number) + 1;
        idx[i] = next;
        rem[i] = books[i]?.[next]?.size ?? 0;
      } else rem[i] = r;
    }
  }
  const n = Math.min(Math.floor(walked + SIZE_EPSILON), cap);
  if (n < 1) return null;

  // Exact totals; trim back to the largest size that still clears after per-level rounding.
  const candidates = new Set<number>([n]);
  for (let k = 1; k <= TRIM_STEPS; k++) if (n - k >= 1) candidates.add(n - k);
  for (const book of books) {
    let cum = 0;
    for (const level of book) {
      cum += level.size;
      if (cum >= n) break;
      const c = Math.floor(cum + SIZE_EPSILON);
      if (c >= 1) candidates.add(c);
    }
  }
  // Pick the most profitable candidate (ties: the larger size). Rounding can make a thin last level lose money.
  let best: Fill | null = null;
  for (const sets of [...candidates].sort((x, y) => y - x)) {
    const fill = evaluate(books, legs, sets, payoutPerSet);
    if (!fill || !(fill.profit > PROFIT_EPSILON) || fill.profit / sets < minProfit) continue;
    if (!best || fill.profit > best.profit + PROFIT_EPSILON) best = fill;
  }
  return best;
}

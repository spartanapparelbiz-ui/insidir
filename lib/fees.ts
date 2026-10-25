/* Taker and maker fees for Kalshi and Polymarket. Pure: no I/O, no clock.
 *
 * Re-check against the venue docs before changing; last checked from the spec (not live: the sandbox cannot
 * reach the venues).
 *
 * Kalshi:     fee = ceil_to_cent(M × rate × C × P × (1 − P)), rate 0.07 taker / 0.0175 maker, M = the series'
 *             fee_multiplier (default 1). Rounded UP to the next cent per fill.
 * Polymarket: fee = C × rate × p × (1 − p), rate by category (POLYMARKET_RATES), makers pay 0. Not rounded here.
 *             "polymarket_us" uses the same schedule: we do not know of a different US schedule (unverified).
 *
 * Multi-level fills: when an order sweeps several price levels, each level is a separate fill, so fees are
 * computed per level and summed (lib/engines/book.ts). For Kalshi that is conservative: per-fill rounding up
 * can only cost more than one rounded total. Everything in the engines assumes we are the taker. */

import type { FeeModel, Venue } from "./types";

/** Kalshi taker fee rate (fraction of C × P × (1 − P)). */
export const KALSHI_TAKER_RATE = 0.07;
/** Kalshi maker fee rate. */
export const KALSHI_MAKER_RATE = 0.0175;
/** Kalshi series fee_multiplier when the series does not state one. */
export const KALSHI_DEFAULT_MULTIPLIER = 1;
/** Tolerance, in cents, when rounding up: 7.0000000001 cents is 7 cents (float noise), not 8. */
export const CENT_EPSILON = 1e-6;

/** Polymarket taker fee rates by normalised category. Makers pay 0. */
export const POLYMARKET_RATES: Readonly<Record<string, number>> = {
  crypto: 0.07,
  sports: 0.05,
  economics: 0.05,
  culture: 0.05,
  weather: 0.05,
  other: 0.05,
  combos: 0.05,
  finance: 0.04,
  politics: 0.04,
  mentions: 0.04,
  tech: 0.04,
  geopolitics: 0,
};
/** Category used when a Polymarket category is unknown. */
export const POLYMARKET_DEFAULT_CATEGORY = "other";

/** Round a dollar amount up to the next cent, ignoring float noise below CENT_EPSILON cents. */
export function ceilToCent(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.ceil(dollars * 100 - CENT_EPSILON) / 100;
}

/** P × (1 − P), 0 outside the open interval (0, 1). */
function variance(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return 0;
  return price * (1 - price);
}

/** Kalshi fee for one fill of `contracts` at `price`. */
export function kalshiFee(
  contracts: number,
  price: number,
  multiplier: number = KALSHI_DEFAULT_MULTIPLIER,
  role: "taker" | "maker" = "taker",
): number {
  if (!(contracts > 0)) return 0;
  const rate = role === "taker" ? KALSHI_TAKER_RATE : KALSHI_MAKER_RATE;
  const m = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : KALSHI_DEFAULT_MULTIPLIER;
  return ceilToCent(m * rate * contracts * variance(price));
}

/** Polymarket taker fee rate for a category; unknown categories use "other". */
export function polymarketRate(category: string): number {
  const key = category.trim().toLowerCase();
  return POLYMARKET_RATES[key] ?? (POLYMARKET_RATES[POLYMARKET_DEFAULT_CATEGORY] as number);
}

/** Polymarket fee for one fill. Makers pay 0. */
export function polymarketFee(contracts: number, price: number, rate: number, role: "taker" | "maker" = "taker"): number {
  if (role === "maker" || !(contracts > 0) || !(rate > 0)) return 0;
  return contracts * rate * variance(price);
}

/** The fee model for a market, for the exchange clients. */
export function feeModelFor(venue: Venue, category: string, kalshiMultiplier?: number | null): FeeModel {
  if (venue === "kalshi") {
    const m = kalshiMultiplier != null && Number.isFinite(kalshiMultiplier) && kalshiMultiplier >= 0 ? kalshiMultiplier : KALSHI_DEFAULT_MULTIPLIER;
    return { venue, multiplier: m };
  }
  return { venue, rate: polymarketRate(category) };
}

/** Taker fee, in dollars, for ONE fill of `contracts` at `price` under `model`. */
export function takerFee(model: FeeModel, contracts: number, price: number): number {
  if (model.venue === "kalshi") return kalshiFee(contracts, price, model.multiplier, "taker");
  return polymarketFee(contracts, price, model.rate, "taker");
}

/** Unrounded taker fee per contract at `price`: the marginal fee the book walker uses to decide whether one more
 *  set pays. Exact totals (with Kalshi's rounding) come from takerFee per level. */
export function marginalTakerFee(model: FeeModel, price: number): number {
  if (model.venue === "kalshi") {
    const m = Number.isFinite(model.multiplier) && model.multiplier >= 0 ? model.multiplier : KALSHI_DEFAULT_MULTIPLIER;
    return m * KALSHI_TAKER_RATE * variance(price);
  }
  return model.rate > 0 ? model.rate * variance(price) : 0;
}

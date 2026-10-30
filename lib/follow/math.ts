/* What following Insidir would have made: $100 on every position at the price Insidir showed it (seen price, or for
 * trackers tagged after the fact the price when the tag was added), plus one point of slippage, held to settlement.
 * Pure. */

/** One cent on a 0..1 price: what a follower pays above the price Insidir showed. */
export const SLIPPAGE = 0.01;
export const STAKE = 100;
/** A record needs this many settled positions before its return is shown; until then, "Building record · N of 30". */
export const MIN_SETTLED = 30;

/** The price a follower gets: shown price + slippage. Null when there's nothing left to win (1 or more). */
export function followPrice(seen: number | null | undefined): number | null {
  if (seen === null || seen === undefined || !Number.isFinite(seen) || seen <= 0) return null;
  const p = seen + SLIPPAGE;
  return p >= 1 ? null : p;
}

/** What $100 at that price came back as: $100 / price when it won, nothing when it lost. */
export const payout = (price: number, won: boolean): number => (won ? STAKE / price : 0);

export interface FollowRecord {
  /** Settled, followable positions. */
  n: number;
  won: number;
  lost: number;
  /** $100 on each. */
  staked: number;
  /** Net of the stakes: payouts minus staked. */
  net: number;
}
export const EMPTY: FollowRecord = { n: 0, won: 0, lost: 0, staked: 0, net: 0 };

/** Adds up settled positions (each with the price it could be followed at). */
export function followRecord(rows: ReadonlyArray<{ price: number | null; result: "won" | "lost" | "void" | null }>): FollowRecord {
  const r = { ...EMPTY };
  for (const x of rows) {
    const p = followPrice(x.price);
    if (p === null || (x.result !== "won" && x.result !== "lost")) continue;
    r.n++; r.staked += STAKE;
    if (x.result === "won") r.won++; else r.lost++;
    r.net += payout(p, x.result === "won") - STAKE;
  }
  return r;
}

/** Followable ROI: net over staked; null before MIN_SETTLED. */
export const followRoi = (r: FollowRecord | null | undefined): number | null => (r && r.n >= MIN_SETTLED && r.staked > 0 ? r.net / r.staked : null);
export const hasRecord = (r: FollowRecord | null | undefined): r is FollowRecord => Boolean(r && r.n >= MIN_SETTLED);

export interface PricePoint { t: number; p: number }

/** A side's price at a moment from a YES price history: the last point at or before it (within maxBeforeMs), else
 *  the first after it (within maxAfterMs). Null when the history has nothing near. */
export function priceAt(history: readonly PricePoint[], t: number, side: "yes" | "no", maxBeforeMs = 6 * 3_600_000, maxAfterMs = 30 * 60_000): number | null {
  let before: PricePoint | null = null, after: PricePoint | null = null;
  for (const x of history) {
    if (x.t <= t) before = x;
    else { after = x; break; }
  }
  const pick = before && t - before.t <= maxBeforeMs ? before : after && after.t - t <= maxAfterMs ? after : null;
  if (!pick) return null;
  return side === "no" ? 1 - pick.p : pick.p;
}

/** When the market first moved `points` toward a side after a move's entry (Momentum), and the side's price then. */
export function crossedAt(history: readonly PricePoint[], from: number, side: "yes" | "no", entry: number, points: number): { t: number; p: number } | null {
  for (const x of history) {
    if (x.t < from) continue;
    const p = side === "no" ? 1 - x.p : x.p;
    if (p - entry >= points - 1e-9) return { t: x.t, p };
  }
  return null;
}

const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
/** "$100 on every position since we started tracking: $3,000 in, +$420 back." (− when it lost money.) */
export function hundredLine(r: Pick<FollowRecord, "staked" | "net">): string {
  return `$100 on every position since we started tracking: ${usd(r.staked)} in, ${r.net >= 0 ? "+" : "−"}${usd(r.net)} back.`;
}
/** "+12.4%" (one decimal under 100%). */
export function roiText(net: number, staked: number): string {
  const p = staked > 0 ? (net / staked) * 100 : 0;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
}

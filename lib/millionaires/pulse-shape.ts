/* The live numbers' shape and the hero's line: client safe (no database, no registry). */
export interface Pulse {
  /** Millionaire-tier bets in the window, and which window it is (the last hour, or today when the hour had none). */
  count: number;
  window: "hour" | "day";
  wallets: number;
  millionaires: number;
  /** Dollars millionaire-tier wallets bet in the last 24 hours. */
  today: number;
  /** Dollars millionaire-tier wallets bet since midnight US Eastern (the hero's "today"). */
  sinceMidnight: number;
  /** How many millionaire-tier bets since midnight US Eastern. */
  countToday: number;
  /** How many millionaire-tier bets in the last 24 hours (what the pages count: never "0 today" at 8am). */
  count24h: number;
}

/** The hero's live line: today's total (since midnight ET), or the last 24 hours when today is under HERO_MIN. */
export const HERO_MIN = 100_000;
export function heroTotal(p: Pulse): { amount: number; window: "today" | "24h" } {
  return p.sinceMidnight >= HERO_MIN ? { amount: p.sinceMidnight, window: "today" } : { amount: p.today, window: "24h" };
}

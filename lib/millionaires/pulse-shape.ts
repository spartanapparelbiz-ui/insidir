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
  /** The same, for every watched wallet up $100K+ (the $1M+ ones included): the board's and the dashboard's default. */
  all: { count: number; window: "hour" | "day"; today: number; sinceMidnight: number; countToday: number };
}

export const EMPTY_ALL: Pulse["all"] = { count: 0, window: "hour", today: 0, sinceMidnight: 0, countToday: 0 };

/** The hero's live line: today's total (since midnight ET), or the last 24 hours when today is under HERO_MIN. */
export const HERO_MIN = 100_000;

/** How late visitors see a bet (and never its side before then), in ms and in minutes. */
export const BOARD_DELAY_MS = 60 * 60_000;
export const BOARD_DELAY_MIN = BOARD_DELAY_MS / 60_000;
/** The same, over every watched wallet (up $100K+): the landing's headline number. */
export function heroTotalAll(p: Pulse): { amount: number; window: "today" | "24h" } {
  const a = p.all ?? { sinceMidnight: 0, today: 0 };
  return a.sinceMidnight >= HERO_MIN ? { amount: a.sinceMidnight, window: "today" } : { amount: a.today, window: "24h" };
}

export function heroTotal(p: Pulse): { amount: number; window: "today" | "24h" } {
  return p.sinceMidnight >= HERO_MIN ? { amount: p.sinceMidnight, window: "today" } : { amount: p.today, window: "24h" };
}

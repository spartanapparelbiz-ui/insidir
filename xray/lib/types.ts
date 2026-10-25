/* Normalised shapes used across the app. Raw API responses are read in lib/polymarket.ts and never leave it. */

export interface Market {
  slug: string;
  question: string;
  groupItemTitle: string | null;
  conditionId: string;
  outcomes: string[];
  /** Current price per outcome, 0..1, same order as outcomes. */
  prices: number[];
  tokenIds: string[];
  closed: boolean;
  volume: number;
  endDate: string | null;
  image: string | null;
  /** The winning outcome once resolved (a final price of 1), else null. */
  resolvedOutcome: string | null;
  eventSlug: string | null;
  eventTitle: string | null;
}

export interface EventInfo {
  id: string;
  slug: string;
  title: string;
  markets: Market[];
}

export interface Holder {
  wallet: string;
  name: string | null;
  shares: number;
  outcomeIndex: number;
}

export type Side = "BUY" | "SELL";

export interface Trade {
  wallet: string;
  name: string | null;
  side: Side;
  /** Shares. */
  size: number;
  /** 0..1 */
  price: number;
  /** Epoch seconds. */
  timestamp: number;
  outcomeIndex: number;
  outcome: string | null;
  txHash: string | null;
}

export interface ClosedPosition {
  conditionId: string | null;
  realizedPnl: number;
}

export interface WalletAge {
  /** Epoch seconds of the wallet's first-ever trade, or null when unknown. */
  firstTradeAt: number | null;
  /** Distinct markets traded, or null when unknown. */
  marketsTraded: number | null;
}

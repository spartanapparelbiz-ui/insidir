/* Big money moves (docs/V2.md §3). A move is one wallet putting a lot of money into one outcome (Polymarket, fills
 * within MERGE_WINDOW_MS merged) or one big anonymous trade (Kalshi). Every field comes from the source API. */

export type MoveSource = "polymarket" | "kalshi";
/** The feed's tabs. Crypto and Stocks are "Coming soon" at launch (docs/V2.md §2). */
export type Tab = "sports" | "markets" | "crypto" | "stocks";
export type League = "NFL" | "NBA" | "MLB" | "NHL" | "college" | "soccer" | "UFC" | "tennis" | "golf" | "other";
export const LEAGUES: readonly League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "UFC", "tennis", "golf", "other"];

export interface Move {
  /** Stable id: Polymarket `pm:<wallet>:<market>:<outcomeIndex>:<first fill ms>`, Kalshi `ks:<trade id>`. */
  id: string;
  source: MoveSource;
  /** Polymarket conditionId; Kalshi market ticker. */
  marketId: string;
  eventTitle: string;
  marketTitle: string;
  /** What was bought, as the venue names it ("Yes", "No", "Chiefs"). */
  outcome: string;
  /** Which side of the market the outcome is: Polymarket outcomeIndex 0 / Kalshi yes = "yes". */
  outcomeSide: "yes" | "no";
  /** Dollars put in (contracts × price, summed over merged fills). */
  amount: number;
  /** Average price paid per $1 payout, 0..1. */
  avgPrice: number;
  /** Polymarket only; Kalshi trades are anonymous. */
  wallet: string | null;
  walletName: string | null;
  /** First and last fill times, ms. */
  at: number;
  lastAt: number;
  fills: number;
  tab: Tab;
  league: League | null;
  /** Venue category (lib/exchanges/categories). */
  category: string;
  /** Link to the source market (international Polymarket links are never sent to US viewers). */
  url: string | null;
  /** Set when the market settles: did this outcome pay? "void" when refunded. */
  result: "won" | "lost" | "void" | null;
  settledAt: number | null;
}

/** One fill as the detector sees it (normalised from either venue). */
export interface Fill {
  source: MoveSource;
  /** Kalshi trade id / Polymarket transaction hash + log position when known. */
  id: string;
  marketId: string;
  eventTitle: string;
  marketTitle: string;
  outcome: string;
  outcomeSide: "yes" | "no";
  side: "BUY" | "SELL";
  contracts: number;
  price: number;
  wallet: string | null;
  walletName: string | null;
  at: number;
  url: string | null;
}

/** A Polymarket wallet's record from its real resolved positions. */
export interface TraderRecord {
  wallet: string;
  name: string | null;
  resolved: number;
  won: number;
  lost: number;
  /** Sum of realized profit over resolved markets, dollars. */
  profit: number;
  biggestWin: number;
  updatedAt: number;
}

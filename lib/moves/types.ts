/* Big money moves (docs/INSIDIR-V2.md §3). A move is one wallet putting a lot of money into one outcome (Polymarket, fills
 * within MERGE_WINDOW_MS merged) or one big anonymous trade (Kalshi). Every field comes from the source API. */

export type MoveSource = "polymarket" | "kalshi" | "sec";
/** The feed's tabs. Crypto is "Coming soon"; Stocks (SEC filings) shows once it is in FEATURES_READY (docs/INSIDIR-V2.md). */
export type Tab = "sports" | "markets" | "crypto" | "stocks";
export type League = "NFL" | "NBA" | "MLB" | "NHL" | "college" | "soccer" | "UFC" | "tennis" | "golf" | "other";
export const LEAGUES: readonly League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "UFC", "tennis", "golf", "other"];

/** One fill inside a Polymarket move: fill id, contracts, price, time (ms). */
export interface FillPart { id: string; c: number; p: number; at: number }

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
  /** SEC moves: the filing facts behind the card. */
  detail?: StockDetail | null;
  /** Polymarket: true when the wallet had no activity at all before this move ("A brand-new wallet"); null unknown. */
  newWallet?: boolean | null;
  /** Polymarket: the transaction hashes of the fills behind the move (each one a public Polygon record). */
  sourceRefs?: string[] | null;
  /** Polymarket, once settled and checked against the wallet's own trades (lib/moves/realize.ts): what the bet made,
   *  and the share of it sold before the result. */
  pnl?: number | null;
  /** Polymarket: the fills behind it (lib/moves/detect.ts FillPart). */
  parts?: FillPart[] | null;
  soldShare?: number | null;
}

/** An SEC Form 4 insider buy, or a fund's 13F add versus its previous 13F (lib/stocks). */
export type StockDetail =
  | { kind: "insider"; company: string; ticker: string | null; issuerCik: string; role: string; ownerName: string; ownerCik: string | null;
      shares: number; pricePerShare: number; tradeDate: string | null; filedAt: number; accession: string }
  | { kind: "fund"; company: string; cusip: string; fund: string; fundCik: string; period: string | null; filedOn: string;
      addedShares: number; prevShares: number; curShares: number; curValue: number; newPosition: boolean; accession: string; prevAccession: string;
      /** "A" / "B" / "C" when the company lists more than one class (lib/stocks/names.ts). */
      shareClass?: string | null };

/** One fill as the detector sees it (normalised from either venue). */
export interface Fill {
  source: "polymarket" | "kalshi";
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
  /** The most money put into one market (closed and open positions), dollars; null when not read. */
  biggestBet?: number | null;
  updatedAt: number;
}

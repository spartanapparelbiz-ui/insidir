/* The Read's shapes (lib/read). One Read is one market (its Polymarket and Kalshi listings when both exist), read at one
 * moment. Sides are always the main listing's YES and NO (Polymarket's when there is one, else Kalshi's); a Kalshi
 * listing that pays the other way round (an inverted pair) is turned around before it lands here. */

export type Venue = "polymarket" | "kalshi";

export interface Listing { venue: Venue; id: string; title: string; url: string | null; yesPrice: number | null; volume24h: number | null }

export interface ProvenSide { dollars: number; wallets: number; /** Positions counted (a wallet's side, or one Kalshi trade). */ positions?: number }

/** A winning tracker (lib/trackers): 30+ settled positions and a positive all-time followable return (lib/follow). */
export interface ProvenTracker {
  slug: string;
  name: string;
  /** All-time followable return: net ÷ staked. */
  returnPct: number;
  settled: number;
  /** Its open positions in this market, by side (main listing's sides). */
  sides: Array<{ side: "yes" | "no"; dollars: number; positions: number }>;
}

/** A proven Polymarket wallet with an open position here. Proven: its public Polymarket record shows 30+ closed markets
 *  and positive all-time profit (terminal.wallet_pnl: /closed-positions and /v1/leaderboard), or a winning followable
 *  record. */
export interface ProvenWallet {
  /** Short address only ("0x4f…c2"). Never who is behind it. */
  wallet: string;
  side: "yes" | "no";
  dollars: number;
  /** All-time realized profit on Polymarket and closed markets; null when the record doesn't qualify. */
  profit: number | null;
  closed: number | null;
  /** The wallet has more closed markets than we page through: `closed` is a floor ("5,000+"). */
  closedAtLeast?: boolean;
  /** Insidir's followable record for the wallet, when it has 30+ settled. */
  follow: { returnPct: number; settled: number } | null;
}

/** Proven money: winning trackers' and proven wallets' open dollars on each side. */
export interface ProvenMoney {
  yes: ProvenSide; no: ProvenSide;
  /** Proven wallets holding a position. */
  wallets: number;
  /** Share of proven dollars on YES, 0..1; null with none. */
  yesShare: number | null;
  trackers?: ProvenTracker[];
  walletRows?: ProvenWallet[];
}

/** Every tracked large position still open here, by side: shown, labelled as such, when there is no proven money. */
export interface BigSplit { yes: { dollars: number; positions: number }; no: { dollars: number; positions: number }; yesShare: number | null }

export type Unusual = "fresh_wallet" | "big_for_market" | "long_shot";
export interface BigBet {
  venue: Venue;
  side: "yes" | "no";
  amount: number;
  /** What they paid for their side, 0..1. */
  price: number;
  at: number;
  /** Polymarket only: the short address ("0x4f…c2"); Kalshi trades are anonymous. Never who is behind it. */
  wallet: string | null;
  unusual: Unusual[];
  /** For big_for_market: its share of the market's last-24h volume, 0..1. */
  ofVolume: number | null;
}

export interface SidePrices { polymarket: number | null; kalshi: number | null; best: Venue | null }

export interface ReadData {
  key: string;
  question: string;
  event: string | null;
  yesLabel: string;
  noLabel: string;
  closeTime: number | null;
  polymarket: Listing | null;
  kalshi: (Listing & { inverted: boolean }) | null;
  proven: ProvenMoney;
  /** All open tracked large positions by side (older Reads don't have it). */
  big?: BigSplit;
  bets: BigBet[];
  /** Prices for YES and NO on each venue; Polymarket's left out for the US (region rule applied at render). */
  prices: { yes: SidePrices; no: SidePrices };
  line: { text: string; origin: "model" | "template"; model: string } | null;
  at: number;
}

export interface Choice { key: string; venue: Venue; id: string; title: string; event: string | null; yesPrice: number | null }

export type Resolved =
  | { kind: "market"; venue: Venue; id: string }
  | { kind: "choices"; list: Choice[] }
  | { kind: "none"; why: string };

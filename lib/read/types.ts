/* The Read's shapes (lib/read). One Read is one market (its Polymarket and Kalshi listings when both exist), read at one
 * moment. Sides are always the main listing's YES and NO (Polymarket's when there is one, else Kalshi's); a Kalshi
 * listing that pays the other way round (an inverted pair) is turned around before it lands here. */

export type Venue = "polymarket" | "kalshi";

export interface Listing { venue: Venue; id: string; title: string; url: string | null; yesPrice: number | null; volume24h: number | null }

export interface ProvenSide { dollars: number; wallets: number }
/** Proven wallets: 30+ settled positions and a positive followable return (lib/follow). Their open dollars on each side. */
export interface ProvenMoney { yes: ProvenSide; no: ProvenSide; wallets: number; /** Share of proven dollars on YES, 0..1; null with none. */ yesShare: number | null }

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

/* Insidir Terminal: the shared domain types. Exchange clients (lib/exchanges) produce these, the engines
 * (lib/engines) and matching (lib/matching) consume them, and the app and worker store and render them.
 * Prices are dollars per contract (0..1). Sizes are contracts. Times are epoch milliseconds. */

/** Three venues. "polymarket" is the international site (Gamma/CLOB); "polymarket_us" is Polymarket's separate
 *  US exchange with its own API and market list. US users never see "polymarket". */
export type Venue = "kalshi" | "polymarket" | "polymarket_us";
export const VENUES: readonly Venue[] = ["kalshi", "polymarket", "polymarket_us"];
export const VENUE_NAME: Record<Venue, string> = { kalshi: "Kalshi", polymarket: "Polymarket", polymarket_us: "Polymarket US" };

/** Where the user is, set at signup. It decides which venues they can see (lib/region.ts). */
export type Region = "us" | "non_us";

export type Side = "yes" | "no";

/** One price level. */
export interface Level {
  /** Dollars per contract, 0..1. */
  price: number;
  /** Contracts available at this price. */
  size: number;
}

/** A market's order book, both sides. Asks are what it costs to BUY that side, cheapest first; bids are what a
 *  holder could SELL that side for, highest first. Kalshi publishes bids only: its YES asks are 1 − NO bids and its
 *  NO asks are 1 − YES bids (derived in lib/exchanges/kalshi.ts). */
export interface Book {
  yesAsks: Level[];
  noAsks: Level[];
  yesBids: Level[];
  noBids: Level[];
  fetchedAt: number;
  /** A hash of the book as the venue sent it, when the venue provides one, for change detection. */
  hash: string | null;
}

/** How a venue charges a taker for this market (lib/fees.ts). */
export type FeeModel =
  | { venue: "kalshi"; multiplier: number }
  | { venue: "polymarket" | "polymarket_us"; rate: number };

/** A strike on a threshold market ("above $100,000"), for ladders. */
export interface Strike {
  kind: "above" | "below" | "between";
  value: number;
  /** Upper bound for "between". */
  upper: number | null;
  /** The asset or quantity the strike is on, normalised (e.g. "btc", "fed-funds-rate", "nyc-high-temp"). */
  subject: string;
}

/** One binary market on one venue, normalised. */
export interface VMarket {
  venue: Venue;
  /** Kalshi market ticker; Polymarket conditionId; Polymarket US market id. */
  id: string;
  /** Kalshi event_ticker; Polymarket event id. */
  eventId: string;
  /** Kalshi series_ticker, else null. */
  seriesId: string | null;
  /** The question as the venue writes it. */
  title: string;
  /** The event's title, when it differs from the market's. */
  eventTitle: string | null;
  /** What a YES contract pays on ("Yes", a team name, "Above $100,000"). */
  yesLabel: string;
  noLabel: string;
  /** The full resolution rules text as published (Kalshi rules_primary + rules_secondary; Polymarket description). */
  rules: string;
  /** Resolution source when the venue states one separately, else null. */
  resolutionSource: string | null;
  /** When trading closes / the market is expected to resolve. */
  closeTime: number | null;
  /** Normalised category (see lib/fees.ts POLYMARKET_RATES keys and Kalshi categories, lower case). */
  category: string;
  fee: FeeModel;
  /** Deep link that opens this market on the venue. */
  url: string;
  /** Polymarket CLOB token ids for the YES and NO outcomes. */
  yesTokenId: string | null;
  noTokenId: string | null;
  strike: Strike | null;
  active: boolean;
  /** Settled result once resolved: which side paid out, or "void" (refunded / annulled). */
  result: Side | "void" | null;
  volume24h: number | null;
  /** The YES side's last price, 0..1, when the venue sends it (market pages, Steam). */
  yesPrice?: number | null;
  /** When the game starts (sports: Polymarket gameStartTime), ms; null when the venue doesn't say. */
  startTime?: number | null;
  /** Contracts held open (Kalshi), when the venue reports it. */
  openInterest?: number | null;
}

/** A group of markets on one venue that resolve together (Polymarket event, Kalshi event). */
export interface VEvent {
  venue: Venue;
  id: string;
  title: string;
  category: string;
  marketIds: string[];
  /** At most one market in the event resolves YES (Polymarket negRisk, Kalshi mutually_exclusive). */
  mutuallyExclusive: boolean;
  /** Exactly one market resolves YES: mutually exclusive AND every possible outcome is listed. Only then does
   *  buying every YES lock in $1. Unknown means false. */
  exhaustive: boolean;
  closeTime: number | null;
}

/** One leg of a play: buy `contracts` of `side` on a market. */
export interface Leg {
  venue: Venue;
  marketId: string;
  side: Side;
  /** Plain-English label for the leg ("YES on Kalshi", "NO: Above $100,000"). */
  label: string;
  url: string;
  contracts: number;
  /** Volume-weighted average price paid, 0..1. */
  avgPrice: number;
  /** The worst (highest) price level the fill reaches. */
  worstPrice: number;
  /** Cost before fees, dollars. */
  cost: number;
  /** Taker fees for this leg, dollars. */
  fee: number;
}

export type OppKind = "cross_arb" | "multi_yes" | "multi_no" | "ladder" | "implication" | "second_opinion";

export type Safety = "green" | "yellow" | "red";

/** Something the engines found. For every kind except "second_opinion", buying all legs at the stated size
 *  locks in `profit` IF every leg fills at those prices AND the markets settle the same way. It is never
 *  described as guaranteed or risk-free. */
export interface Opportunity {
  /** Stable across scans: a hash of the kind and the legs' venue, market and side. */
  id: string;
  kind: OppKind;
  /** Short event title for the feed. */
  title: string;
  legs: Leg[];
  /** Fillable size: complete sets (one contract of every leg per set). */
  sets: number;
  /** Total cost before fees, dollars. */
  cost: number;
  fees: number;
  /** Minimum payout across every way the markets can settle (the same way), dollars. */
  payout: number;
  /** payout − cost − fees, dollars. */
  profit: number;
  /** profit / (cost + fees). */
  roi: number;
  /** Days until the last leg's market resolves (at least 1/24). */
  days: number;
  profitPerDay: number;
  safety: Safety;
  /** Plain-English differences or caveats behind a yellow or red light. */
  safetyNotes: string[];
  categories: string[];
  closeTime: number | null;
  /** For cross-venue kinds: the matched pair's id (lib/matching). */
  pairId: string | null;
  /** For "second_opinion": the gap between the two venues' mid prices, in cents. */
  gapCents: number | null;
}

/** What two matched markets' rules texts disagree on. A pair with any of these is quarantined (lib/quarantine.ts). */
export type RuleMismatch = "date" | "threshold" | "source" | "tie";

/** A Kalshi ↔ Polymarket match. */
export interface MarketPair {
  /** `${a.venue}:${a.id}|${b.venue}:${b.id}` */
  id: string;
  a: { venue: Venue; id: string };
  b: { venue: Venue; id: string };
  /** True when YES on `a` corresponds to NO on `b` (e.g. "Team A wins" vs "Team B wins"). */
  inverted: boolean;
  method: "deterministic" | "llm" | "admin";
  /** 0..1 */
  confidence: number;
  safety: Safety;
  safetyNotes: string[];
  /** Rules-text differences (lib/matching/safety.ts). Absent on pairs stored before it existed and on admin-forced
   *  pairs (an admin read both rules). */
  ruleMismatch?: RuleMismatch[];
  blocked: boolean;
}

/** A large Polymarket trade, as it happens. */
export interface WhaleTrade {
  venue: Venue;
  wallet: string;
  name: string | null;
  marketId: string;
  marketTitle: string;
  outcome: string;
  side: "BUY" | "SELL";
  contracts: number;
  price: number;
  /** contracts × price, dollars. */
  cash: number;
  timestamp: number;
  txHash: string | null;
  url: string;
}

/** Plans. Entitlements per plan are in lib/plans.ts. */
/** "insidir" is the one paid plan; "free" means no active plan (a visitor, or a member whose plan has ended). */
export type Plan = "free" | "insidir";

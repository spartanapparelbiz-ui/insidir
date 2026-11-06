/* Filings (docs/RESEARCH-DESK.md): the shapes shared by the poller, the API and the browser. Everything here is either
 * a public record as filed or something the member typed. No field holds a prediction, a score or a suggestion. */

export type FormType = "4" | "4/A" | "8-K" | "8-K/A";

/** One reporting owner on a Form 4: name, CIK and the relationship as filed. */
export interface FiledOwner { cik: string | null; name: string; role: string }

/** One non-derivative Form 4 line, as filed. `v` is shares × price exact to the cent (lib/stocks/form4.ts filedValue). */
export interface FiledLine {
  /** Transaction code letter (P, S, A, M, F, G…). */
  code: string;
  /** "A" acquired / "D" disposed. */
  ad: "A" | "D" | null;
  /** Transaction date "YYYY-MM-DD". */
  date: string | null;
  shares: number | null;
  price: number | null;
  value: number | null;
}

export interface Form4Payload {
  kind: "4";
  owners: FiledOwner[];
  lines: FiledLine[];
  /** Distinct codes on the filing, derivative lines included, for filters. */
  codes: string[];
  /** Derivative lines are counted, not listed. */
  derivativeLines: number;
  /** True when the filing had no readable ownership XML; kept so it is never fetched again, never shown. */
  unparsed?: boolean;
}
export interface EightKPayload {
  kind: "8-K";
  /** Item numbers as listed in the EDGAR feed ("2.02", "9.01"); empty when the feed listed none. */
  items: string[];
}
export type FilingPayload = Form4Payload | EightKPayload;

/** A filing as the API sends it to the browser. Dates are epoch ms. */
export interface FilingRow {
  id: number; accession: string; form: FormType; cik: string; ticker: string | null; company: string;
  acceptedAt: number; detectedAt: number; filedOn: string; url: string; payload: FilingPayload;
}

export type AnomalyKind = "cluster" | "whale" | "velocity";
/** What a Stream card prints. */
export interface AnomalyFacts {
  /** Cluster / whale: the code-P lines behind the match. */
  buys?: Array<{ accession: string; owners: string[]; role: string; date: string | null; shares: number; price: number; value: number; url: string }>;
  /** Cluster: distinct owner groups (joint filers on one accession count once). */
  groups?: number;
  /** Velocity: Form 4 count in the window, the prior weekly mean, the weeks it covers and the codes breakdown. */
  count?: number;
  weeklyMean?: number;
  baselineWeeks?: number;
  codes?: Record<string, number>;
}
export interface AnomalyRow {
  id: number; key: string; kind: AnomalyKind; cik: string; ticker: string | null; company: string;
  windowStart: string; windowEnd: string; total: number | null; facts: AnomalyFacts; ruleVersion: number; detectedAt: number;
}

export type ThesisStatus = "researching" | "watching" | "passed";
export interface StatusEvent { from: ThesisStatus | null; to: ThesisStatus | null; reason: string | null; at: number }
export type AnchorKind = "filing" | "anomaly";
export interface JournalNote {
  id: string;
  body: string;
  /** The record the note sits beside, and what it showed when the note was written. */
  anchor: { kind: AnchorKind; ref: string; label: string; url: string } | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface Journal { cik: string; ticker: string; status: ThesisStatus | null; history: StatusEvent[]; notes: JournalNote[]; version: number; updatedAt: number }

/** A position the member logs by hand. Prices: $ per share (equity) or $0.01–$0.99 per contract (event). */
export interface Position {
  id: string;
  kind: "equity" | "event";
  /** Equity: the ticker. Event: tickers whose filings the member linked to the contract. */
  tickers: string[];
  /** Event contract: venue and the contract as the member names it. */
  venue: "kalshi" | "polymarket" | "other" | null;
  label: string | null;
  side: "long" | "short" | "yes" | "no";
  quantity: number;
  entryPrice: number;
  entryDate: string;
  fees: number;
  /** Closed: exit price (equity) or how it resolved (event). */
  exitPrice: number | null;
  resolution: "yes" | "no" | "void" | null;
  closedOn: string | null;
  note: string;
}

export interface WatchItem { cik: string; ticker: string }
export interface Watchlist { id: number; name: string; items: WatchItem[] }

/** Everything the browser needs for a member, in one read. */
export interface MemberState {
  watchlists: Watchlist[];
  seenId: number;
  ackVersion: number | null;
  positions: Position[];
  positionsVersion: number;
  journals: Array<{ cik: string; ticker: string; status: ThesisStatus | null; notes: number; updatedAt: number }>;
}

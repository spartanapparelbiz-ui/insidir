/* Trackers: followable packages of big moves, generated from our own data (like a portfolio someone curates, except
 * the curator is a rule). Each tracker is a filter over terminal.moves: the same rule twice, once pure (alerts, tests)
 * and once in SQL (the lists and the record), and tests check the two agree. Nothing here is typed in by hand: a
 * tracker's record is its settled moves (the same "counts toward the record" rule as /results, lib/trust.ts), and
 * under TRACKER_MIN_SETTLED settled moves it shows "New" instead of a record. Pure, plus SQL fragments. */
import { sql, type SQL } from "drizzle-orm";
import type { PhotoN } from "@/components/Photo";
import type { Move } from "@/lib/moves/types";

/** Below this many settled (won + lost) moves a tracker shows "New", not a record. */
export const TRACKER_MIN_SETTLED = 20;

export type TrackerSlug =
  | "biggest-bets" | "top-traders" | "nba-big-money" | "nfl-big-money" | "soccer-big-money"
  | "fed-and-rates" | "elections-2026" | "ceo-buys" | "big-funds" | "new-wallets";

/** What the pure rule needs besides the move: is this wallet a top trader (lib/moves/records.ts isTopTrader). */
export interface TrackerCtx { topTrader: (wallet: string) => boolean }

export interface Tracker {
  slug: TrackerSlug;
  name: string;
  /** One line under the name. */
  line: string;
  /** The cover (public/hero). */
  photo: PhotoN;
  /** Prediction-market bets settle and get a record; SEC filings never settle. */
  kind: "bets" | "filings";
  match: (m: TrackerMove, ctx: TrackerCtx) => boolean;
  /** The same rule over terminal.moves. */
  where: () => SQL;
}

export type TrackerMove = Pick<Move, "source" | "amount" | "wallet" | "tab" | "league" | "category" | "eventTitle" | "marketTitle" | "newWallet"> & { detail?: Move["detail"] };

/** Text rules, one pattern for JS and Postgres (both read it case-insensitively). */
export const FED_RE = "(^|[^a-z])(fed|fomc|powell)([^a-z]|$)|interest rate|rate cut|rate hike|basis points|federal reserve|fed funds";
export const ELECTION_RE = "elect|midterm|senate|house race|governor|primary|mayor|nominee|congress";
export const CEO_RE = "(^|[^a-z])ceo([^a-z]|$)|chief executive";

const re = (p: string) => new RegExp(p, "i");
const text = (m: TrackerMove) => `${m.eventTitle} ${m.marketTitle}`;
const BETS = sql`terminal.moves.source in ('polymarket', 'kalshi')`;
const TEXT = sql`(terminal.moves.event_title || ' ' || terminal.moves.market_title)`;
const isBet = (m: TrackerMove) => m.source === "polymarket" || m.source === "kalshi";

export const BIG_BET = 100_000;

export const TRACKERS: readonly Tracker[] = [
  {
    slug: "biggest-bets", name: "Biggest Bets", line: "Every single bet of $100K or more, on any market.", photo: 7, kind: "bets",
    match: m => isBet(m) && m.amount >= BIG_BET,
    where: () => sql`(${BETS} and terminal.moves.amount >= ${BIG_BET})`,
  },
  {
    slug: "top-traders", name: "Top Traders", line: "Big moves by wallets with 20+ settled markets and a profit.", photo: 10, kind: "bets",
    match: (m, c) => m.source === "polymarket" && Boolean(m.wallet) && c.topTrader(m.wallet!),
    where: () => sql`(terminal.moves.source = 'polymarket' and exists (select 1 from terminal.trader_records t
      where t.wallet = terminal.moves.wallet and t.resolved >= 20 and t.profit > 0))`,
  },
  {
    slug: "nba-big-money", name: "NBA Big Money", line: "The biggest bets on NBA games and futures.", photo: 5, kind: "bets",
    match: m => isBet(m) && m.tab === "sports" && m.league === "NBA",
    where: () => sql`(${BETS} and terminal.moves.tab = 'sports' and terminal.moves.league = 'NBA')`,
  },
  {
    slug: "nfl-big-money", name: "NFL Big Money", line: "The biggest bets on NFL games and futures.", photo: 12, kind: "bets",
    match: m => isBet(m) && m.tab === "sports" && m.league === "NFL",
    where: () => sql`(${BETS} and terminal.moves.tab = 'sports' and terminal.moves.league = 'NFL')`,
  },
  {
    slug: "soccer-big-money", name: "Soccer Big Money", line: "The biggest bets on soccer, every league.", photo: 2, kind: "bets",
    match: m => isBet(m) && m.tab === "sports" && m.league === "soccer",
    where: () => sql`(${BETS} and terminal.moves.tab = 'sports' and terminal.moves.league = 'soccer')`,
  },
  {
    slug: "fed-and-rates", name: "Fed & Rates", line: "Big money on Fed decisions and interest rates.", photo: 13, kind: "bets",
    match: m => isBet(m) && m.tab === "markets" && re(FED_RE).test(text(m)),
    where: () => sql`(${BETS} and terminal.moves.tab = 'markets' and ${TEXT} ~* ${FED_RE})`,
  },
  {
    slug: "elections-2026", name: "Elections 2026", line: "Big money on the 2026 races.", photo: 16, kind: "bets",
    match: m => isBet(m) && m.tab === "markets" && m.category === "politics" && re(ELECTION_RE).test(text(m)) && /2026|midterm/i.test(text(m)),
    where: () => sql`(${BETS} and terminal.moves.tab = 'markets' and terminal.moves.category = 'politics'
      and ${TEXT} ~* ${ELECTION_RE} and ${TEXT} ~* '2026|midterm')`,
  },
  {
    slug: "ceo-buys", name: "CEO Buys", line: "CEOs buying their own company's stock (SEC Form 4).", photo: 6, kind: "filings",
    match: m => m.source === "sec" && m.detail?.kind === "insider" && re(CEO_RE).test(m.detail.role),
    where: () => sql`(terminal.moves.source = 'sec' and terminal.moves.detail->>'kind' = 'insider' and terminal.moves.detail->>'role' ~* ${CEO_RE})`,
  },
  {
    slug: "big-funds", name: "Big Funds (13F)", line: "What the largest funds added last quarter (SEC 13F).", photo: 4, kind: "filings",
    match: m => m.source === "sec" && m.detail?.kind === "fund",
    where: () => sql`(terminal.moves.source = 'sec' and terminal.moves.detail->>'kind' = 'fund')`,
  },
  {
    slug: "new-wallets", name: "Brand-New Wallets", line: "Big first bets from wallets with no history at all.", photo: 8, kind: "bets",
    match: m => m.source === "polymarket" && m.newWallet === true,
    where: () => sql`(terminal.moves.source = 'polymarket' and terminal.moves.new_wallet = true)`,
  },
];

/** The four on the home page's "Featured" row, in order. */
export const FEATURED: readonly TrackerSlug[] = ["biggest-bets", "top-traders", "nba-big-money", "new-wallets"];

export const trackerBySlug = (slug: string): Tracker | null => TRACKERS.find(t => t.slug === slug) ?? null;
export const isTrackerSlug = (s: string): s is TrackerSlug => TRACKERS.some(t => t.slug === s);
export const trackerHref = (slug: string) => `/trackers/${slug}`;

/** The trackers a move belongs to. */
export const trackersOf = (m: TrackerMove, ctx: TrackerCtx): TrackerSlug[] => TRACKERS.filter(t => t.match(m, ctx)).map(t => t.slug);

/* ---------- the record ---------- */

/** Top performers' windows. */
export const PERIODS = [
  { key: "1w", label: "1W", days: 7 }, { key: "1m", label: "1M", days: 30 }, { key: "3m", label: "3M", days: 91 },
  { key: "6m", label: "6M", days: 182 }, { key: "1y", label: "1Y", days: 365 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"] | "all";

/** A tracker's record over settled moves: won and lost, the average price paid (weighted by amount, in %), and what
 *  those bets really made (net, from the wallets' own trades). */
export interface TrackerRecord { won: number; lost: number; oddsPct: number | null; net: number }

export const settledOf = (r: TrackerRecord | null | undefined) => (r ? r.won + r.lost : 0);
export const hasTrackerRecord = (r: TrackerRecord | null | undefined): r is TrackerRecord => settledOf(r) >= TRACKER_MIN_SETTLED;
export const winPct = (r: TrackerRecord) => Math.round((r.won / Math.max(1, r.won + r.lost)) * 100);

/** "Won 63%", or "New" under 20 settled moves. */
export const recordPill = (r: TrackerRecord | null | undefined): { text: string; tone: "won" | "lost" | "new" } =>
  hasTrackerRecord(r) ? { text: `Won ${winPct(r)}%`, tone: winPct(r) >= 50 ? "won" : "lost" } : { text: "New", tone: "new" };

/** Ranks trackers for one window: only those with a record there, best win rate first, then most settled. */
export function topPerformers<T extends { slug: string; record: TrackerRecord | null }>(rows: readonly T[]): T[] {
  return rows.filter(r => hasTrackerRecord(r.record)).sort((a, b) => winPct(b.record!) - winPct(a.record!) || settledOf(b.record) - settledOf(a.record));
}

/** Popular: most followers first, then most money tracked in the last 30 days. */
export function popular<T extends { followers: number; tracked30d: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.followers - a.followers || b.tracked30d - a.tracked30d);
}

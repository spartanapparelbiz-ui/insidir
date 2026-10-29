/* Trackers: followable packages of big moves, generated from our own data (like a portfolio someone curates, except
 * the curator is a rule). Nothing here is typed in by hand: a tracker's record is its settled moves (the same "counts
 * toward the record" rule as /results, lib/trust.ts), and under TRACKER_MIN_SETTLED settled moves it shows "New".
 *
 * Three kinds of rule:
 *   fixed     decided by the move alone (league, topic, price, size). The worker stores them on the move
 *             (terminal.moves.trackers, lib/trackers-tag.ts), so lists and records are an indexed lookup.
 *   observed  decided by what the venue says later (the price moved their way, when the game started): added to the
 *             move by the market-info job when it sees it (lib/markets/info.ts), and kept after the market settles.
 *   live      decided by data that keeps changing (a wallet's record, other insiders' filings): SQL at read time,
 *             with the same rule pure for alerts and tests (test/trackers.test.ts checks the two agree).
 * Pure, plus SQL fragments. */
import { sql, type SQL } from "drizzle-orm";
import type { PhotoN } from "@/components/Photo";
import type { Feature } from "@/lib/features";
import { signedShort } from "@/lib/moves/copy";
import { leagueLabel } from "@/lib/moves/leagues";
import type { Move } from "@/lib/moves/types";

/** Below this many settled (won + lost) moves a tracker shows "New", not a record. */
export const TRACKER_MIN_SETTLED = 20;
/** Bump when a fixed rule changes: the worker re-tags every move (lib/trackers-tag.ts). */
export const TRACKER_RULES_V = 2;

export type TrackerSlug = string;
export type TrackerGroup = "Leagues" | "Topics" | "Styles" | "Stocks";
export const GROUPS: readonly TrackerGroup[] = ["Styles", "Leagues", "Topics", "Stocks"];

export type TrackerMove = Pick<Move, "source" | "amount" | "avgPrice" | "wallet" | "tab" | "league" | "category" | "eventTitle" | "marketTitle" | "marketId" | "newWallet" | "at"> &
  { detail?: Move["detail"]; outcomeSide?: Move["outcomeSide"]; trackers?: readonly string[] | null };

/** What the live rules need besides the move. */
export interface TrackerCtx {
  /** Wallets with 20+ resolved markets and a profit (lib/moves/records.ts isTopTrader). */
  topTrader: (wallet: string) => boolean;
  /** The top 1% of those by all-time profit. */
  topPct?: (wallet: string) => boolean;
  /** 3+ different insiders bought at this company within 30 days of this filing (see clusterIssuers). */
  cluster?: (issuerCik: string, at: number) => boolean;
}

export interface Tracker {
  slug: TrackerSlug;
  name: string;
  /** One line under the name. */
  line: string;
  group: TrackerGroup;
  /** The cover (public/hero). */
  photo: PhotoN;
  /** Prediction-market bets settle and get a record; SEC filings never settle. */
  kind: "bets" | "filings";
  rule: { fixed: (m: TrackerMove) => boolean } | { observed: true } | { live: (m: TrackerMove, ctx: TrackerCtx) => boolean; sql: () => SQL };
  /** Hidden until this feature is live (Crypto). */
  needs?: Feature;
}

export const BIG_BET = 100_000;
export const NEW_WALLET_MIN = 25_000;
export const UNDERDOG_MAX = 0.4;
export const FAVORITE_MIN = 0.75;
/** Steam: the price moved this much their way after the bet. */
export const STEAM = 0.05;
export const EARLY_MS = 24 * 3_600_000;
export const LATE_MS = 3_600_000;

/** Text rules (one pattern for JS and Postgres, both read case-insensitively). */
export const FED_RE = "(^|[^a-z])(fed|fomc|powell)([^a-z]|$)|interest rate|rate cut|rate hike|basis points|federal reserve|fed funds";
export const ELECTION_RE = "elect|midterm|senate|house race|governor|primary|mayor|nominee|congress";
export const CEO_RE = "(^|[^a-z])ceo([^a-z]|$)|chief executive";
const re = (p: string) => new RegExp(p, "i");
const text = (m: TrackerMove) => `${m.eventTitle} ${m.marketTitle}`;
const isBet = (m: TrackerMove) => m.source === "polymarket" || m.source === "kalshi";
const label = (m: TrackerMove) => leagueLabel({ tab: m.tab, league: m.league, eventTitle: m.eventTitle, marketTitle: m.marketTitle, marketId: m.marketId });
const ESPORTS = new Set(["Counter-Strike", "Dota 2", "League of Legends", "Valorant", "Rocket League", "Call of Duty"]);

const league = (slug: string, name: string, line: string, photo: PhotoN, test: (m: TrackerMove) => boolean): Tracker =>
  ({ slug, name, line, group: "Leagues", photo, kind: "bets", rule: { fixed: m => isBet(m) && m.tab === "sports" && test(m) } });
const topic = (slug: string, name: string, line: string, photo: PhotoN, test: (m: TrackerMove) => boolean, needs?: Feature): Tracker =>
  ({ slug, name, line, group: "Topics", photo, kind: "bets", rule: { fixed: m => isBet(m) && test(m) }, needs });
const style = (slug: string, name: string, line: string, photo: PhotoN, rule: Tracker["rule"]): Tracker =>
  ({ slug, name, line, group: "Styles", photo, kind: "bets", rule });

export const TRACKERS: readonly Tracker[] = [
  /* Styles */
  style("biggest-bets", "Whales ($100K+)", "Every single bet of $100K or more, on any market.", 7, { fixed: m => isBet(m) && m.amount >= BIG_BET }),
  style("top-traders", "Top Traders", "Big moves by wallets with 20+ settled markets and a profit.", 10, {
    live: (m, c) => m.source === "polymarket" && Boolean(m.wallet) && c.topTrader(m.wallet!),
    sql: () => sql`(terminal.moves.source = 'polymarket' and exists (select 1 from terminal.trader_records t
      where t.wallet = terminal.moves.wallet and t.resolved >= 20 and t.profit > 0))`,
  }),
  style("top-1-percent", "Top 1% Traders", "Big moves by the top 1% of traders by all-time profit.", 16, {
    live: (m, c) => m.source === "polymarket" && Boolean(m.wallet) && Boolean(c.topPct?.(m.wallet!)),
    sql: () => sql`(terminal.moves.source = 'polymarket' and terminal.moves.wallet in (select wallet from (
      select wallet, percent_rank() over (order by profit desc) as pr from terminal.trader_records where resolved >= 20 and profit > 0) r where r.pr < 0.01))`,
  }),
  style("underdog-hunters", "Underdog Hunters", "Big bets bought at under a 40% chance: the long shots.", 9, { fixed: m => isBet(m) && m.avgPrice > 0 && m.avgPrice < UNDERDOG_MAX }),
  style("favorites-only", "Favorites Only", "Big bets bought at over a 75% chance: the heavy favorites.", 3, { fixed: m => isBet(m) && m.avgPrice > FAVORITE_MIN && m.avgPrice < 1 }),
  style("early-money", "Early Money", "Big bets placed 24 hours or more before the game.", 15, { observed: true }),
  style("late-money", "Late Money", "Big bets placed in the last hour before the game.", 11, { observed: true }),
  style("steam", "Steam", "Big bets the price then moved 5 points or more toward.", 14, { observed: true }),
  style("new-wallets", "Brand-New Wallets", "Bets of $25K+ from wallets with no history at all.", 8, { fixed: m => m.source === "polymarket" && m.newWallet === true && m.amount >= NEW_WALLET_MIN }),
  /* Leagues */
  league("nfl-big-money", "NFL Big Money", "The biggest bets on NFL games and futures.", 12, m => m.league === "NFL"),
  league("nba-big-money", "NBA Big Money", "The biggest bets on NBA games and futures.", 5, m => m.league === "NBA"),
  league("mlb-big-money", "MLB Big Money", "The biggest bets on baseball.", 3, m => m.league === "MLB"),
  league("nhl-big-money", "NHL Big Money", "The biggest bets on hockey.", 11, m => m.league === "NHL"),
  league("college-football", "College Football", "The biggest bets on college football.", 12, m => label(m) === "College football"),
  league("college-basketball", "College Basketball", "The biggest bets on college basketball.", 5, m => label(m) === "College basketball"),
  league("soccer-big-money", "Soccer Big Money", "The biggest bets on soccer, every league.", 2, m => m.league === "soccer"),
  league("premier-league", "Premier League", "The biggest bets on English Premier League games.", 2, m => label(m) === "Premier League"),
  league("champions-league", "Champions League", "The biggest bets on the Champions League.", 13, m => label(m) === "Champions League"),
  league("la-liga", "La Liga", "The biggest bets on Spanish football.", 4, m => label(m) === "La Liga"),
  league("serie-a", "Serie A", "The biggest bets on Italian football.", 6, m => label(m) === "Serie A"),
  league("ufc", "UFC", "The biggest bets on UFC fights.", 14, m => m.league === "UFC"),
  league("tennis", "Tennis", "The biggest bets on tennis.", 9, m => m.league === "tennis"),
  league("golf", "Golf", "The biggest bets on golf.", 10, m => m.league === "golf"),
  league("esports", "Esports", "The biggest bets on Counter-Strike, Dota 2, League of Legends and more.", 16, m => ESPORTS.has(label(m) ?? "")),
  /* Topics */
  topic("fed-and-rates", "Fed & Rates", "Big money on Fed decisions and interest rates.", 13, m => m.tab === "markets" && re(FED_RE).test(text(m))),
  topic("elections-2026", "Elections 2026", "Big money on the 2026 races.", 16,
    m => m.tab === "markets" && m.category === "politics" && re(ELECTION_RE).test(text(m)) && /2026|midterm/i.test(text(m))),
  topic("crypto-prices", "Crypto Prices", "Big money on where Bitcoin, Ethereum and others trade next.", 15, m => m.tab === "crypto" || m.category === "crypto", "crypto"),
  topic("geopolitics", "Geopolitics", "Big money on wars, treaties and world leaders.", 6, m => m.tab === "markets" && m.category === "geopolitics"),
  topic("tech-and-ai", "Tech & AI", "Big money on AI, big tech and space.", 4, m => m.tab === "markets" && m.category === "tech"),
  topic("culture", "Culture", "Big money on awards, music, movies and the internet.", 7, m => m.tab === "markets" && m.category === "culture"),
  /* Stocks */
  { slug: "ceo-buys", name: "CEO Buys", line: "CEOs buying their own company's stock (SEC Form 4).", group: "Stocks", photo: 6, kind: "filings",
    rule: { fixed: m => m.source === "sec" && m.detail?.kind === "insider" && re(CEO_RE).test(m.detail.role) } },
  { slug: "cluster-buys", name: "Cluster Buys", line: "Three or more insiders buying at one company within 30 days.", group: "Stocks", photo: 16, kind: "filings",
    rule: {
      live: (m, c) => m.source === "sec" && m.detail?.kind === "insider" && Boolean(c.cluster?.(m.detail.issuerCik, m.at)),
      sql: () => sql`(terminal.moves.source = 'sec' and terminal.moves.detail->>'kind' = 'insider' and (
        select count(distinct o.detail->>'ownerName') from terminal.moves o
        where o.source = 'sec' and o.detail->>'kind' = 'insider' and o.hidden_at is null
          and o.detail->>'issuerCik' = terminal.moves.detail->>'issuerCik'
          and o.at between terminal.moves.at - interval '30 days' and terminal.moves.at + interval '30 days') >= 3)`,
    } },
  { slug: "big-funds", name: "Big Funds: New Positions", line: "Companies the largest funds bought into last quarter (SEC 13F).", group: "Stocks", photo: 4, kind: "filings",
    rule: { fixed: m => m.source === "sec" && m.detail?.kind === "fund" && m.detail.newPosition === true } },
];

/** Cluster buys, pure: the issuers where 3+ different insiders' buys fall within any 30 days of a given filing. */
export function clusterIssuers(insiderMoves: ReadonlyArray<{ at: number; detail?: Move["detail"] }>): (issuerCik: string, at: number) => boolean {
  const by = new Map<string, Array<{ at: number; owner: string }>>();
  for (const m of insiderMoves) if (m.detail?.kind === "insider") by.set(m.detail.issuerCik, [...(by.get(m.detail.issuerCik) ?? []), { at: m.at, owner: m.detail.ownerName }]);
  const D30 = 30 * 86_400_000;
  return (cik, at) => new Set((by.get(cik) ?? []).filter(x => Math.abs(x.at - at) <= D30).map(x => x.owner)).size >= 3;
}

/** Fifteen photos for more trackers than that: a photo's second use is mirrored, its third a tighter crop, the fourth
 *  both, so no two covers look the same. "" | "flip" | "zoom" | "flip zoom". */
export function coverVariant(slug: string): string {
  const t = TRACKERS.find(x => x.slug === slug);
  if (!t) return "";
  const k = TRACKERS.filter(x => x.photo === t.photo).findIndex(x => x.slug === slug);
  return ["", "cover--flip", "cover--zoom", "cover--flip cover--zoom"][k % 4]!;
}

/** The four on the home page's "Featured" row, in order. */
export const FEATURED: readonly TrackerSlug[] = ["ceo-buys", "fed-and-rates", "biggest-bets", "nba-big-money"];

/** Home lists lead with stocks, then prediction markets (topics, then the styles that span every market), then sports. */
const HOME_ORDER: Record<TrackerGroup, number> = { Stocks: 0, Topics: 1, Styles: 2, Leagues: 3 };
/** A list in the home order, keeping each group's own order (stable). */
export const homeOrder = <T extends { t: Pick<Tracker, "group"> }>(rows: readonly T[]): T[] =>
  rows.map((r, i) => ({ r, i })).sort((a, b) => HOME_ORDER[a.r.t.group] - HOME_ORDER[b.r.t.group] || a.i - b.i).map(x => x.r);

export const isFixed = (t: Tracker): t is Tracker & { rule: { fixed: (m: TrackerMove) => boolean } } => "fixed" in t.rule;
export const isObserved = (t: Tracker) => "observed" in t.rule;
export const isLive = (t: Tracker): t is Tracker & { rule: { live: (m: TrackerMove, c: TrackerCtx) => boolean; sql: () => SQL } } => "live" in t.rule;

/** Trackers a visitor can see (Crypto waits for its tab). */
export const visibleTrackers = (ready: (f: Feature) => boolean): Tracker[] => TRACKERS.filter(t => !t.needs || ready(t.needs));

export const trackerBySlug = (slug: string): Tracker | null => TRACKERS.find(t => t.slug === slug) ?? null;
export const isTrackerSlug = (s: string): boolean => TRACKERS.some(t => t.slug === s);
export const trackerHref = (slug: string) => `/trackers/${slug}`;

/** The rule over terminal.moves: stored tags for fixed and observed rules, SQL for live ones. */
export function trackerWhere(t: Tracker): SQL {
  return isLive(t) ? t.rule.sql() : sql`${t.slug} = any(terminal.moves.trackers)`;
}

/** The fixed trackers a move meets (what the worker stores). */
export const fixedTags = (m: TrackerMove): string[] => TRACKERS.filter(isFixed).filter(t => t.rule.fixed(m)).map(t => t.slug);
const OBSERVED = new Set(TRACKERS.filter(isObserved).map(t => t.slug));
/** A move's tags after re-tagging: its fixed tags now, plus any observed ones it already had. */
export const retag = (m: TrackerMove): string[] => [...fixedTags(m), ...(m.trackers ?? []).filter(s => OBSERVED.has(s))].sort();

/** Observed tags from what the venue says now: the price moved 5¢+ their way (open bets only), the bet came 24h+
 *  before the game or in its last hour. `yesPrice` is the YES side's price now; `startAt` the game's start. */
export function observedTags(m: Pick<TrackerMove, "source" | "avgPrice" | "at" | "outcomeSide"> & { result?: Move["result"] }, info: { yesPrice: number | null; startAt: number | null; closed: boolean }): string[] {
  if (!(m.source === "polymarket" || m.source === "kalshi")) return [];
  const out: string[] = [];
  if (!info.closed && !m.result && info.yesPrice !== null && m.avgPrice > 0 && m.avgPrice < 1) {
    const now = m.outcomeSide === "no" ? 1 - info.yesPrice : info.yesPrice;
    if (now - m.avgPrice >= STEAM - 1e-9) out.push("steam");
  }
  if (info.startAt !== null) {
    if (m.at <= info.startAt - EARLY_MS) out.push("early-money");
    else if (m.at >= info.startAt - LATE_MS && m.at < info.startAt) out.push("late-money");
  }
  return out;
}

/** The trackers a move belongs to (alerts): stored tags, else its fixed rules now, plus the live rules. */
export const trackersOf = (m: TrackerMove, ctx: TrackerCtx): TrackerSlug[] => {
  const tags = new Set([...(m.trackers ?? []), ...fixedTags(m)]);
  return TRACKERS.filter(t => tags.has(t.slug) || (isLive(t) && t.rule.live(m, ctx))).map(t => t.slug);
};

/* ---------- the record ---------- */

/** Top performers' windows. */
export const PERIODS = [
  { key: "1w", label: "1W", days: 7 }, { key: "1m", label: "1M", days: 30 }, { key: "3m", label: "3M", days: 91 },
  { key: "6m", label: "6M", days: 182 }, { key: "1y", label: "1Y", days: 365 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"] | "all";

/** A tracker's record over settled moves: won and lost, the average price paid (weighted by amount, in %), and what
 *  those bets really made (net, from the wallets' own trades). */
export interface TrackerRecord { won: number; lost: number; oddsPct: number | null; net: number; /** Money in those bets. */ staked?: number }

export const settledOf = (r: TrackerRecord | null | undefined) => (r ? r.won + r.lost : 0);
export const hasTrackerRecord = (r: TrackerRecord | null | undefined): r is TrackerRecord => settledOf(r) >= TRACKER_MIN_SETTLED;
export const winPct = (r: TrackerRecord) => Math.round((r.won / Math.max(1, r.won + r.lost)) * 100);

/** "Won 63%", or "New" under 20 settled moves. */
export const recordPill = (r: TrackerRecord | null | undefined): { text: string; tone: "won" | "lost" | "new" } =>
  hasTrackerRecord(r) ? { text: `Won ${winPct(r)}%`, tone: winPct(r) >= 50 ? "won" : "lost" } : { text: "New", tone: "new" };

/** The record as a result, plain text on the right: the net in green or red, the win rate in grey under it ("New" under
 *  20 settled moves, with no amount). */
export function recordResult(r: TrackerRecord | null | undefined): { amount: string | null; tone: "won" | "lost" | "none"; status: string } {
  if (!hasTrackerRecord(r)) return { amount: null, tone: "none", status: "New" };
  return { amount: signedShort(r.net), tone: r.net > 0 ? "won" : r.net < 0 ? "lost" : "none", status: `Won ${winPct(r)}%` };
}

/** "+12.4%": what the bets returned on the money in them, or null without a record. */
export function returnPct(r: TrackerRecord | null | undefined): string | null {
  if (!hasTrackerRecord(r) || !r.staked || r.staked <= 0) return null;
  const p = (r.net / r.staked) * 100;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
}

/** What a record returned on the money in it (net / staked), or −∞ without the money to tell. */
export const returnOf = (r: TrackerRecord): number => (r.staked && r.staked > 0 ? r.net / r.staked : Number.NEGATIVE_INFINITY);

/** Ranks trackers for one window: only those with a record there (20+ settled bets), best return first, then the
 *  better win rate, then most settled. */
export function topPerformers<T extends { slug: string; record: TrackerRecord | null }>(rows: readonly T[]): T[] {
  return rows.filter(r => hasTrackerRecord(r.record)).sort((a, b) =>
    (returnOf(b.record!) - returnOf(a.record!) || 0) || winPct(b.record!) - winPct(a.record!) || settledOf(b.record) - settledOf(a.record));
}

/** Popular: most followers first, then most money tracked in the last 30 days. */
export function popular<T extends { followers: number; tracked30d: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.followers - a.followers || b.tracked30d - a.tracked30d);
}

/* Everything the landing shows, read once per request from live data. Free for visitors, whole: today's #1 millionaire
 * market (its split, wallets, price and a line describing the data) and the last three millionaire bets with their
 * sides. Then live previews of what members get (a verdict and prices, board rows and a ping, the Daily Brief's top 3,
 * a followed wallet's last results, tonight's biggest race or game). Anything without data comes back empty and its
 * tile says so or steps aside: no number is ever made up. Server only. */
import { sql } from "drizzle-orm";
import { verifiedBoard, verifiedCount, type BoardWallet } from "@/lib/verified/board";
import type { Db } from "@/lib/db";
import { isReady } from "@/lib/features";
import type { CategorySlug } from "@/lib/brand/categories";
import { BOARD_DELAY_MS, lastResults, midnightET, positions, pulse, recentBets,
  type BoardBet, type CategoryLive, type MarketMoney, type Position, type Pulse, type TopWallet } from "@/lib/millionaires/queries";
import { leadRule, type Lead } from "@/lib/autopilot/lead";
import { memo } from "@/lib/memo";
import { electionBoard, electionDay, pulseData, type ElectionBoard, type PriceGap, type Race, type Pulse2, type Spotlight, type StakeRecord } from "@/lib/brand/pulse";

const DAY = 86_400_000;

export interface BestPrice { question: string; yes: { polymarket: number | null; kalshi: number | null } }
export interface Biggest { title: string; amount: number; pnl: number | null }
export const EMPTY_PULSE: Pulse = { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0, all: { count: 0, window: "hour" as const, today: 0, sinceMidnight: 0, countToday: 0 } };

export interface LandingData {
  now: number;
  member: boolean;
  pulse: Pulse;
  /** The free live sample: today's #1 millionaire bet (the biggest since midnight ET), whole, side included. */
  topBet: BoardBet | null;
  /** The free live sample: one race in full (the race with the most watchlist money this week). */
  race: Race | null;
  /** Today's #1 millionaire market (most $1M+ money since midnight ET, else the last 24 hours), whole. */
  top: { m: MarketMoney; positions: Position[]; window: "today" | "24h" } | null;
  /** The last three millionaire-tier bets, sides included, and how many more there were today. */
  last3: BoardBet[];
  moreToday: number;
  /** Member previews. */
  board: BoardBet[];
  biggest: Biggest | null;
  brief: MarketMoney[];
  wallet: (TopWallet & { results: Array<{ title: string; outcome: string; result: "won" | "lost" | "void"; amount: number }> }) | null;
  bigNight: MarketMoney | null;
  categories: { window: "day" | "week"; list: CategoryLive[] };
  /** The leading rule from the Kalshi backtest, or null (lib/autopilot/lead.ts). */
  record: Lead | null;
  bestPrice: BestPrice | null;
  /** The Pulse (lib/brand/pulse.ts). */
  pulse2: Pulse2;
  /** Election Day board, Nov 3–4 ET only (else null). */
  election: ElectionBoard | null;
  spotlight: Spotlight | null;
  /** The home's lead after Election Day: the board (60 minutes late for visitors, like /board). */
  lead: BoardBet[];
  stake: StakeRecord | null;
  gaps: PriceGap[];
  /** The live top Verified wallets (lib/verified/board.ts) and how many pass today, of how many checked. */
  verified: BoardWallet[];
  verifiedCount: { verified: number; checked: number };
  /** "Flagged in N seconds": the median time from a $1M+ trade's first fill to Insidir seeing it, trades of the last 24 hours (20+
   *  trades with a first-seen time, else null and the line isn't shown). */
  flagged: { seconds: number; n: number } | null;
  /** The homepage's stats row, each from a live query; null when that query failed or has nothing to count yet
   *  (the stat is then hidden, never a placeholder). */
  stats: { tracked: number | null; verified: number | null; signals24h: number | null };
  /** The product frames: settled $1M+ trades only (a side is public once its market settles), newest first. */
  settled: SettledTrade[];
}

export interface SettledTrade { id: string; wallet: string; verified: boolean; pnl: number | null; title: string; outcome: string; amount: number; price: number; at: number; settledAt: number; result: "won" | "lost" }


export const milDollars = (m: MarketMoney): number => m.millionaire.yes.dollars + m.millionaire.no.dollars;
const NIGHT: readonly CategorySlug[] = ["elections", "politics", "football", "basketball", "baseball", "hockey", "soccer", "tennis", "golf", "racing"];

export async function landingData(db: Db, now: number, member: boolean): Promise<LandingData> {
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(e => { console.error("landing", e instanceof Error ? e.message : e); return fallback; });
  const midnight = midnightET(now);
  const [p, today, day, last3, board, categories, pr, wallets, best, recent] = await Promise.all([
    safe(pulse(db, now), EMPTY_PULSE),
    // The landing (components/brand/landing/Landing.tsx) shows the hero, Free, the record and Election Day only since
    // 2026-11-08: the per-market money, categories, wallet spotlight and price gaps it no longer shows aren't loaded.
    Promise.resolve([] as MarketMoney[]),
    Promise.resolve([] as MarketMoney[]),
    safe(recentBets(db, { now, limit: 3, tier: "millionaire", withSide: true }), [] as BoardBet[]),
    safe(recentBets(db, { now, limit: 2, member }), [] as BoardBet[]),
    Promise.resolve({ window: "day" as const, list: [] }),
    isReady("autopilot") ? safe(leadRule(db), null) : Promise.resolve(null), // backtest claims wait for legal review (lib/features.ts)
    Promise.resolve([] as TopWallet[]),
    Promise.resolve(null),
    safe(recentBets(db, { now, since: now - DAY, limit: 200, member: true, tier: "millionaire" }), [] as BoardBet[]),
  ]);
  const byMil = (l: MarketMoney[]) => [...l].filter(m => milDollars(m) > 0).sort((a, b) => milDollars(b) - milDollars(a));
  const todayTop = byMil(today), dayTop = byMil(day);
  const pick = todayTop[0] ? { m: todayTop[0], window: "today" as const } : dayTop[0] ? { m: dayTop[0], window: "24h" as const } : null;
  const top = pick ? { ...pick, positions: await safe(positions(db, pick.m.marketId), []) } : null;
  const w = wallets[0] ?? null;
  const wallet = w ? { ...w, results: await safe(lastResults(db, w.wallet, 5), []) } : null;
  const b = [...recent].sort((x, y) => y.amount - x.amount)[0];
  const pool = todayTop.length ? todayTop : dayTop;
  const topBet = [...recent].filter(x => x.at >= midnight).sort((x, y) => y.amount - x.amount)[0] ?? null;
  const [pulse2, election, spotlight, stake, gaps, lead, races] = await Promise.all([
    safe(pulseData(db, now, p.sinceMidnight, pool), { today: p.sinceMidnight, biggest: null, hottest: null, disagree: { free: null, locked: [] }, unusual: null }),
    electionDay(now) ? safe(electionBoard(db, now, member), null) : Promise.resolve(null),
    Promise.resolve(null),
    // Your stake runs on the leading rule only: the best of many trackers was a pick after the fact.
    Promise.resolve(pr ? { n: pr.settled, won: pr.won, lost: pr.lost, staked: pr.settled * pr.perBet, net: pr.net, roi: pr.roi, stake: pr.perBet } : null),
    Promise.resolve([] as PriceGap[]),
    safe(recentBets(db, { now, limit: 8, member, tier: "millionaire", delayMs: member ? 0 : BOARD_DELAY_MS }), [] as BoardBet[]),
    electionDay(now) ? Promise.resolve(null) : safe(electionBoard(db, now, false), null),
  ]);
  const [settled, stats, verified, verifiedN, flagged] = await Promise.all([safe(settledTrades(db, 6), [] as SettledTrade[]),homeStats(db, now).catch(() => ({ tracked: null, verified: null, signals24h: null })),safe(verifiedBoard(db, { limit: 5, verifiedOnly: true }), [] as BoardWallet[]), safe(verifiedCount(db), { verified: 0, checked: 0 }), safe(flaggedIn(db, now), null)]);
  return {
    settled, stats, verified, verifiedCount: verifiedN, flagged, pulse2, election, spotlight, stake, gaps, lead, topBet, race: (election ?? races)?.free[0] ?? null,
    now, member, pulse: p, top, last3, moreToday: Math.max(0, p.countToday - last3.length), board, categories, record: pr, bestPrice: best,
    biggest: b ? { title: b.title, amount: b.amount, pnl: b.pnl } : null,
    brief: pool.slice(0, 3),
    wallet,
    bigNight: pool.find(m => NIGHT.includes(m.category)) ?? null,
  };
}

/** The visitors' landing, shared for 15 s (every visitor sees the same live numbers; members have their own home). */
export function landingFor(db: Db, now: number): Promise<LandingData> {
  return memo("brand:landing", 15_000, () => landingData(db, now, false));
}

/** No database (local preview): every stage in its empty state. */
export const emptyLanding = (now: number): LandingData => ({
  now, member: false, pulse: EMPTY_PULSE, topBet: null, race: null, top: null, last3: [], moreToday: 0, board: [], biggest: null, brief: [], wallet: null, bigNight: null,
  categories: { window: "day", list: [] }, record: null, bestPrice: null,
  pulse2: { today: 0, biggest: null, hottest: null, disagree: { free: null, locked: [] }, unusual: null }, election: null, spotlight: null, stake: null, gaps: [], lead: [],
  verified: [], verifiedCount: { verified: 0, checked: 0 }, flagged: null, stats: { tracked: null, verified: null, signals24h: null }, settled: [],
});

/** The newest settled (won or lost) trades by $1M+ wallets, with the wallet's profit and Verified state. */
export async function settledTrades(db: Db, limit: number): Promise<SettledTrade[]> {
  const r = await db.execute(sql`select b.id, b.wallet, b.market_title, b.outcome, b.amount::float8 as amount, b.price::float8 as price, b.at, b.settled_at, b.result,
      w.pnl::float8 as pnl, coalesce(v.verified, false) as verified
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet left join terminal.wallet_verification v on v.wallet = b.wallet
    where b.tier = 'millionaire' and b.result in ('won', 'lost') and b.settled_at is not null order by b.settled_at desc limit ${limit}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    id: String(x.id), wallet: String(x.wallet), verified: x.verified === true, pnl: x.pnl === null ? null : Number(x.pnl), title: String(x.market_title), outcome: String(x.outcome),
    amount: Number(x.amount), price: Number(x.price), at: new Date(String(x.at)).getTime(), settledAt: new Date(String(x.settled_at)).getTime(), result: x.result === "won" ? "won" : "lost",
  }));
}

/** Wallets tracked (the watchlist's $1M+ wallets), wallets verified (of those checked; null before the first check), and
 *  signals sent in the last 24 hours (pushes: followed-wallet entries, exits, price drops and $1M+ position signals). */
export async function homeStats(db: Db, now: number): Promise<LandingData["stats"]> {
  const r = await db.execute(sql`select
      (select count(*)::int from terminal.watchlist where pnl >= 1000000) as tracked,
      (select count(*) filter (where verified)::int from terminal.wallet_verification) as verified,
      (select count(*)::int from terminal.wallet_verification v join terminal.watchlist w on w.wallet = v.wallet where w.pnl >= 1000000) as checked,
      (select count(*)::int from terminal.alerts_sent where channel = 'push' and sent_at > ${new Date(now - DAY)}
        and (opp_id like 'mil:%' or opp_id like 'copy:%' or opp_id like 'exit:%' or opp_id like 'drop:%')) as signals`);
  const x = r.rows[0] as { tracked: number; verified: number; checked: number; signals: number };
  // Verified only once every tracked wallet has been checked: a partial first pass would understate it.
  const complete = x.tracked > 0 && x.checked >= x.tracked;
  return { tracked: x.tracked > 0 ? x.tracked : null, verified: complete ? x.verified : null, signals24h: x.signals };
}

/** The median seconds from a $1M+ trade's first fill to Insidir seeing it (seen_at − at), last 24 hours; null under 20. */
export async function flaggedIn(db: Db, now: number): Promise<{ seconds: number; n: number } | null> {
  const r = await db.execute(sql`select percentile_cont(0.5) within group (order by extract(epoch from seen_at - at))::float8 as s, count(*)::int as n
    from terminal.millionaire_bets where tier = 'millionaire' and seen_at is not null and at > ${new Date(now - DAY)} and seen_at >= at`);
  const x = r.rows[0] as { s: number | null; n: number } | undefined;
  return x && x.n >= 20 && x.s !== null ? { seconds: Math.max(1, Math.round(x.s)), n: x.n } : null;
}

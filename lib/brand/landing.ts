/* Everything the landing shows, read once per request from live data. Free for visitors, whole: today's #1 millionaire
 * market (its split, wallets, price and a line describing the data) and the last three millionaire bets with their
 * sides. Then live previews of what members get (a verdict and prices, board rows and a ping, the Daily Brief's top 3,
 * a followed wallet's last results, tonight's biggest race or game). Anything without data comes back empty and its
 * tile says so or steps aside: no number is ever made up. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CategorySlug } from "@/lib/brand/categories";
import { lastResults, liveCategories, marketMoney, midnightET, positions, proof, pulse, recentBets, topWallets,
  type BoardBet, type CategoryLive, type MarketMoney, type Position, type Proof, type Pulse, type TopWallet } from "@/lib/millionaires/queries";
import { memo } from "@/lib/memo";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";

let clients: { kalshi: KalshiClient; polymarket: PolymarketClient } | null = null;
const gapClients = () => (clients ??= { kalshi: new KalshiClient(), polymarket: new PolymarketClient() });
import { bestRecord, electionBoard, electionDay, priceGaps, pulseData, walletSpotlight, type ElectionBoard, type PriceGap, type Pulse2, type Spotlight, type StakeRecord } from "@/lib/brand/pulse";

const DAY = 86_400_000;

export interface BestPrice { question: string; yes: { polymarket: number | null; kalshi: number | null } }
export interface Biggest { title: string; amount: number; pnl: number | null }
export const EMPTY_PULSE: Pulse = { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 };

export interface LandingData {
  now: number;
  member: boolean;
  pulse: Pulse;
  /** The busiest markets (the free check's chips). */
  chips: Array<{ pick: string; label: string }>;
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
  proof: Proof | null;
  bestPrice: BestPrice | null;
  /** The Pulse (lib/brand/pulse.ts). */
  pulse2: Pulse2;
  /** Election Day board, Nov 3–4 ET only (else null). */
  election: ElectionBoard | null;
  spotlight: Spotlight | null;
  stake: StakeRecord | null;
  gaps: PriceGap[];
}

/** The newest Read that priced both venues (the members' "better price" preview). */
function bestPrice(db: Db): Promise<BestPrice | null> {
  return memo("brand:best-price", 5 * 60_000, async () => {
    const r = await db.execute(sql`select data from terminal.reads
      where data->'polymarket'->>'yesPrice' is not null and data->'kalshi'->>'yesPrice' is not null order by created_at desc limit 1`);
    const d = (r.rows[0] as { data: Record<string, any> } | undefined)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!d) return null;
    const pm = d.polymarket?.yesPrice ?? null, k = d.kalshi ? (d.kalshi.inverted ? 1 - d.kalshi.yesPrice : d.kalshi.yesPrice) : null;
    return { question: String(d.question), yes: { polymarket: pm === null ? null : Number(pm), kalshi: k === null ? null : Number(k) } };
  });
}

export const milDollars = (m: MarketMoney): number => m.millionaire.yes.dollars + m.millionaire.no.dollars;
const NIGHT: readonly CategorySlug[] = ["elections", "politics", "football", "basketball", "baseball", "hockey", "soccer", "tennis", "golf", "racing"];

export async function landingData(db: Db, now: number, member: boolean): Promise<LandingData> {
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(e => { console.error("landing", e instanceof Error ? e.message : e); return fallback; });
  const midnight = midnightET(now);
  const [p, today, day, last3, board, categories, pr, wallets, best, recent] = await Promise.all([
    safe(pulse(db, now), EMPTY_PULSE),
    safe(marketMoney(db, { since: midnight, limit: 20, now }), [] as MarketMoney[]),
    safe(marketMoney(db, { since: now - DAY, limit: 20, now }), [] as MarketMoney[]),
    safe(recentBets(db, { now, limit: 3, tier: "millionaire", withSide: true }), [] as BoardBet[]),
    safe(recentBets(db, { now, limit: 2, member }), [] as BoardBet[]),
    safe(liveCategories(db, now), { window: "day" as const, list: [] }),
    safe(proof(db, now), null),
    safe(topWallets(db, [], now, 1), [] as TopWallet[]),
    safe(bestPrice(db), null),
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
  const [pulse2, election, spotlight, stake, gaps] = await Promise.all([
    safe(pulseData(db, now, p.sinceMidnight, pool), { today: p.sinceMidnight, biggest: null, hottest: null, disagree: { free: null, locked: [] }, unusual: null }),
    electionDay(now) ? safe(electionBoard(db, now, member), null) : Promise.resolve(null),
    safe(walletSpotlight(db), null),
    safe(bestRecord(db, now), null),
    safe(priceGaps(db, gapClients(), now), [] as PriceGap[]),
  ]);
  return {
    pulse2, election, spotlight, stake, gaps,
    now, member, pulse: p, top, last3, moreToday: Math.max(0, p.countToday - last3.length), board, categories, proof: pr, bestPrice: best,
    chips: day.slice(0, 5).map(m => ({ pick: `polymarket:${m.marketId}`, label: m.title })),
    biggest: b ? { title: b.title, amount: b.amount, pnl: b.pnl } : null,
    brief: pool.slice(0, 3),
    wallet,
    bigNight: pool.find(m => NIGHT.includes(m.category)) ?? null,
  };
}

/** No database (local preview): every stage in its empty state. */
export const emptyLanding = (now: number): LandingData => ({
  now, member: false, pulse: EMPTY_PULSE, chips: [], top: null, last3: [], moreToday: 0, board: [], biggest: null, brief: [], wallet: null, bigNight: null,
  categories: { window: "day", list: [] }, proof: null, bestPrice: null,
  pulse2: { today: 0, biggest: null, hottest: null, disagree: { free: null, locked: [] }, unusual: null }, election: null, spotlight: null, stake: null, gaps: [],
});

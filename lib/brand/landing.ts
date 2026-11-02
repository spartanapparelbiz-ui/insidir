/* Everything the landing page shows, read once per request from live data (lib/millionaires/queries.ts and the Read
 * store). The live feed is live for visitors with the side removed on the server; the auto-playing Read of the market
 * with the most millionaire money is the one thing shown whole (the free aha). Any piece without data comes back empty
 * and its scene says so or steps aside: no number is ever made up. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveCategories, marketMoney, positions, proof, pulse, recentBets, topWallets, type BoardBet, type CategoryLive, type MarketMoney, type Position, type Proof, type Pulse, type TopWallet } from "@/lib/millionaires/queries";
import { memo } from "@/lib/memo";

const DAY = 86_400_000;

export interface BestPrice { question: string; yes: { polymarket: number | null; kalshi: number | null } }
export interface Biggest { title: string; amount: number; pnl: number | null }

export interface LandingData {
  now: number;
  member: boolean;
  pulse: Pulse;
  /** The live feed's first rows (sides removed for visitors). */
  bets: BoardBet[];
  /** The busiest markets right now (the ask box's chips). */
  chips: Array<{ pick: string; label: string }>;
  categories: { window: "day" | "week"; list: CategoryLive[] };
  /** The market with the most millionaire money, whole, and its millionaire wallets (the free auto-playing Read). */
  market: MarketMoney | null;
  positions: Position[];
  /** Today's biggest millionaire bet (How it works' ping, the exit-intent line). */
  biggest: Biggest | null;
  proof: Proof | null;
  wallet: TopWallet | null;
  bestPrice: BestPrice | null;
}

export const EMPTY_PULSE: Pulse = { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0 };

/** The newest Read that priced both venues (the Best price crop). */
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

/** Today's biggest bet by a Millionaire-tier wallet. */
async function biggestToday(db: Db, now: number): Promise<Biggest | null> {
  const list = await recentBets(db, { now, since: now - DAY, limit: 200, member: true, tier: "millionaire" });
  const b = list.sort((a, c) => c.amount - a.amount)[0];
  return b ? { title: b.title, amount: b.amount, pnl: b.pnl } : null;
}

export async function landingData(db: Db, now: number, member: boolean): Promise<LandingData> {
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(e => { console.error("landing", e instanceof Error ? e.message : e); return fallback; });
  const [p, bets, categories, markets, pr, wallets, best, biggest] = await Promise.all([
    safe(pulse(db, now), EMPTY_PULSE),
    safe(recentBets(db, { now, limit: 6, member }), []),
    safe(liveCategories(db, now), { window: "day" as const, list: [] }),
    safe(marketMoney(db, { since: now - 7 * DAY, limit: 20, now }), []),
    safe(proof(db, now), null),
    safe(topWallets(db, [], now, 1), []),
    safe(bestPrice(db), null),
    safe(biggestToday(db, now), null),
  ]);
  // The free Read: the most millionaire money among markets with a real split (3+ millionaire wallets), else the most.
  const wallets3 = (m: MarketMoney) => m.millionaire.yes.wallets + m.millionaire.no.wallets >= 3;
  const market = markets.find(wallets3) ?? markets[0] ?? null;
  const pos = market ? await safe(positions(db, market.marketId), []) : [];
  return {
    now, member, pulse: p, bets, categories, market, positions: pos, biggest, proof: pr, wallet: wallets[0] ?? null, bestPrice: best,
    chips: markets.slice(0, 5).map(m => ({ pick: `polymarket:${m.marketId}`, label: m.title })),
  };
}

/** No database (local preview): every scene in its empty state. */
export const emptyLanding = (now: number): LandingData => ({
  now, member: false, pulse: EMPTY_PULSE, bets: [], chips: [], categories: { window: "day", list: [] }, market: null, positions: [], biggest: null, proof: null, wallet: null, bestPrice: null,
});

/* Everything the landing page shows, read once per request from live data (lib/millionaires/queries.ts and the Read
 * store). Visitors get bets VISITOR_DELAY_MS late. Any piece that has no data yet comes back empty and its section says
 * so or steps aside: no number is ever made up. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveCategories, marketMoney, proof, pulse, recentBets, topWallets, VISITOR_DELAY_MS, type BoardBet, type CategoryLive, type MarketMoney, type Proof, type Pulse, type TopWallet } from "@/lib/millionaires/queries";
import { memo } from "@/lib/memo";

export interface BestPrice { question: string; yes: { polymarket: number | null; kalshi: number | null } }

export interface LandingData {
  now: number;
  delayed: boolean;
  pulse: Pulse;
  bets: BoardBet[];
  categories: { window: "day" | "week"; list: CategoryLive[] };
  /** The market with the most millionaire money on it right now (the How it works card and the bento crop). */
  market: MarketMoney | null;
  proof: Proof | null;
  wallet: TopWallet | null;
  bestPrice: BestPrice | null;
}

export const EMPTY_PULSE: Pulse = { count: 0, window: "hour", wallets: 0, millionaires: 0 };

/** The newest Read that priced both venues (the Best price crop). */
function bestPrice(db: Db): Promise<BestPrice | null> {
  return memo("brand:best-price", 5 * 60_000, async () => {
    const r = await db.execute(sql`select data from terminal.reads
      where data->'polymarket'->>'yesPrice' is not null and data->'kalshi'->>'yesPrice' is not null order by created_at desc limit 1`);
    const d = (r.rows[0] as { data: Record<string, any> } | undefined)?.data;
    if (!d) return null;
    const pm = d.polymarket?.yesPrice ?? null, k = d.kalshi ? (d.kalshi.inverted ? 1 - d.kalshi.yesPrice : d.kalshi.yesPrice) : null;
    return { question: String(d.question), yes: { polymarket: pm === null ? null : Number(pm), kalshi: k === null ? null : Number(k) } };
  });
}

export async function landingData(db: Db, now: number, member: boolean): Promise<LandingData> {
  const delayMs = member ? 0 : VISITOR_DELAY_MS;
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(e => { console.error("landing", e instanceof Error ? e.message : e); return fallback; });
  const [p, bets, categories, markets, pr, wallets, best] = await Promise.all([
    safe(pulse(db, now), EMPTY_PULSE),
    safe(recentBets(db, { now, delayMs, limit: 5, member }), []),
    safe(liveCategories(db, now), { window: "day" as const, list: [] }),
    safe(marketMoney(db, { since: now - 7 * 86_400_000, limit: 1, now }), []),
    safe(proof(db, now), null),
    safe(topWallets(db, [], now, 1), []),
    safe(bestPrice(db), null),
  ]);
  return { now, delayed: !member, pulse: p, bets, categories, market: markets[0] ?? null, proof: pr, wallet: wallets[0] ?? null, bestPrice: best };
}

/** No database (local preview): every section in its empty state. */
export const emptyLanding = (now: number): LandingData => ({ now, delayed: true, pulse: EMPTY_PULSE, bets: [], categories: { window: "day", list: [] }, market: null, proof: null, wallet: null, bestPrice: null });

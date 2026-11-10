/* The public sample market pages: /market/sample-polymarket and /market/nba-championship open a real, live market's page
 * (the canonical /market/<slug>), so the preview always shows today's data, never a mock. Server only.
 *   sample-polymarket  the open Polymarket market with the most money from watched wallets (up $100K+) in 7 days: still
 *                      trading (an order book, a price between 3¢ and 97¢, not settled, a game not started over 3 hours ago)
 *   nba-championship   the same, among markets on the NBA champion (falls back to the sample when there's none) */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { MarketRef } from "./resolve";

export const SAMPLE_SLUGS = ["sample-polymarket", "nba-championship"] as const;
export const isSampleSlug = (s: string): s is typeof SAMPLE_SLUGS[number] => (SAMPLE_SLUGS as readonly string[]).includes(s);

export async function sampleMarket(db: Db, slug: typeof SAMPLE_SLUGS[number], now: number): Promise<MarketRef | null> {
  const since = new Date(now - 7 * 86_400_000);
  const pick = async (like: string | null) => {
    const r = await db.execute(sql`select b.market_id as id, max(b.market_title) as title from terminal.millionaire_bets b
        join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
      where b.at > ${since} and i.closed = false and i.history_key is not null and i.yes_price between 0.03 and 0.97
        and (i.end_at is null or i.end_at > ${new Date(now)}) and (i.start_at is null or i.start_at > ${new Date(now - 3 * 3_600_000)})
        ${like ? sql`and (b.market_title ilike ${like} or b.event_title ilike ${like})` : sql``}
      group by b.market_id order by sum(b.amount) desc limit 1`);
    return (r.rows[0] as MarketRef | undefined) ?? null;
  };
  if (slug === "nba-championship") return (await pick("%NBA%Champion%")) ?? (await pick("%NBA Finals%")) ?? pick(null);
  return pick(null);
}

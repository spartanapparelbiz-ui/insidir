/* /market/<slug> → the market (server only; the slug rules are ./slug.ts). */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { marketSlug, parseMarketSlug } from "./slug";

export interface MarketRef { id: string; title: string }

/** The market a slug names (millionaire bets first, then the markets the matcher holds), or null. Several markets on one
 *  6-hex prefix: the one whose title gives the same words. */
export async function resolveMarketSlug(db: Db, slug: string): Promise<MarketRef | null> {
  const p = parseMarketSlug(slug);
  if (!p) return null;
  if (p.kind === "kalshi") {
    // A Kalshi ticker: its approved Polymarket twin's page, if it has one.
    const t = await db.execute(sql`select polymarket_id as id, polymarket_title as title from terminal.market_twins where status = 'approved' and kalshi_id = ${p.ticker} limit 1`);
    return (t.rows[0] as MarketRef | undefined) ?? null;
  }
  const where = p.kind === "id" ? sql`= ${p.id}` : sql`like ${`${p.prefix}%`}`;
  const r = await db.execute(sql`select id, title from (
      select market_id as id, max(market_title) as title from terminal.millionaire_bets where lower(market_id) ${where} group by market_id
      union all
      select id, data->>'title' from terminal.markets where venue = 'polymarket' and lower(id) ${where}
      union all
      select market_id, max(market_title) from terminal.moves where source = 'polymarket' and lower(market_id) ${where} group by market_id) x
    limit 8`);
  const rows = r.rows as unknown as MarketRef[];
  if (!rows.length) return null;
  if (p.kind === "id" || rows.length === 1) return rows[0]!;
  return rows.find(x => marketSlug(x.id, x.title) === decodeURIComponent(slug).toLowerCase()) ?? rows[0]!;
}

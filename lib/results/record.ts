/* The record (/results), honestly (server only): how every settled millionaire bet did, losses included.
 *   totals     won, lost, voided, over the window
 *   $100 line  $100 on every settled bet at the price the wallet paid: a win pays 100 / price, a loss pays nothing, a
 *              void is refunded. It's their price, not one you could have got. Shown only from MIN_SETTLED settled
 *              bets; before that, the tally so far and how many more it needs.
 *   by day     the same, per ET day, newest first
 *   by category
 * Wallets are short addresses only. Past results, not a promise. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";

export const MIN_SETTLED = 30;
export const STAKE = 100;

export interface Tally { won: number; lost: number; void: number; staked: number; back: number }
export interface RecordView {
  days: number; total: Tally; net: number | null;
  byDay: Array<{ day: string } & Tally>;
  byCategory: Array<{ category: CategorySlug } & Tally>;
}

const empty = (): Tally => ({ won: 0, lost: 0, void: 0, staked: 0, back: 0 });
/** One settled bet's $100: what came back. */
function payout(result: "won" | "lost" | "void", price: number): number {
  if (result === "void") return STAKE;
  if (result === "lost") return 0;
  return price > 0 && price < 1 ? STAKE / price : STAKE;
}
export function add(t: Tally, result: "won" | "lost" | "void", price: number): void {
  t[result]++;
  t.staked += STAKE; t.back += payout(result, price);
}
export const settledCount = (t: Tally) => t.won + t.lost;

export async function millionaireRecord(db: Db, now: number, days = 30): Promise<RecordView> {
  const r = await db.execute(sql`select result, price::float as price, category,
      to_char(settled_at at time zone 'America/New_York', 'YYYY-MM-DD') as day
    from terminal.millionaire_bets where tier = 'millionaire' and result is not null and settled_at > ${new Date(now - days * 86_400_000)}`);
  const total = empty(), byDay = new Map<string, Tally>(), byCat = new Map<CategorySlug, Tally>();
  for (const x of r.rows as Array<{ result: "won" | "lost" | "void"; price: number; category: string; day: string }>) {
    const cat: CategorySlug = isCategory(x.category) ? x.category : "world";
    add(total, x.result, Number(x.price));
    add(byDay.get(x.day) ?? (byDay.set(x.day, empty()), byDay.get(x.day)!), x.result, Number(x.price));
    add(byCat.get(cat) ?? (byCat.set(cat, empty()), byCat.get(cat)!), x.result, Number(x.price));
  }
  return {
    days, total, net: settledCount(total) >= MIN_SETTLED ? total.back - total.staked : null,
    byDay: [...byDay].map(([day, t]) => ({ day, ...t })).sort((a, b) => b.day.localeCompare(a.day)),
    byCategory: [...byCat].map(([category, t]) => ({ category, ...t })).sort((a, b) => settledCount(b) - settledCount(a)),
  };
}

/* The facts behind the trust block (components/TrustBlock.tsx), read from the database: the settled record (every
 * move whose market has settled, won or lost, the same rows as /results) and the latest hourly accuracy check.
 * Nothing here is typed in by hand. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { SOLD_EARLY_SHARE } from "@/lib/moves/realize";
import { notComboSql } from "@/lib/moves/combos";

/** The settled record, from Polymarket wallets only (Kalshi trades are anonymous: a trade can't be told apart from
 *  someone closing a position, so Kalshi isn't in it). Every settled move checked against the wallet's own trades
 *  (lib/moves/realize.ts):
 *    won / lost   bets still held at the result (at most half sold before it), by the market's result
 *    soldEarly    bets mostly sold before the result: not won or lost, but their money is in the net
 *    oddsPct      the average price paid on won and lost bets, weighted by amount (the market's chance, in %)
 *    net          what all those bets really made: sales before the result + payout on what was held − cost */
export interface SettledRecord { won: number; lost: number; refunded: number; soldEarly: number; oddsPct: number | null; net: number }

export interface TrustFacts {
  settled: SettledRecord | null;
  accuracy: { runAt: number; ok: number; checked: number; hidden: number } | null;
}

/** Pure: the record from rows (used by tests to check the SQL). */
export function recordOf(rows: ReadonlyArray<{ source?: string; result: string | null; amount: number; avgPrice: number; pnl?: number | null; soldShare?: number | null }>): SettledRecord {
  let won = 0, lost = 0, refunded = 0, soldEarly = 0, w = 0, wp = 0, net = 0;
  for (const r of rows) {
    if ((r.source ?? "polymarket") !== "polymarket" || r.result === null || r.pnl == null) continue;
    net += r.pnl;
    if (r.result === "void") { refunded++; continue; }
    if ((r.soldShare ?? 0) > SOLD_EARLY_SHARE) { soldEarly++; continue; }
    if (r.result === "won") won++; else if (r.result === "lost") lost++; else continue;
    if (r.avgPrice > 0 && r.avgPrice < 1) { w += r.amount; wp += r.amount * r.avgPrice; }
  }
  return { won, lost, refunded, soldEarly, oddsPct: w > 0 ? (wp / w) * 100 : null, net };
}

const RECORD_SQL = (tabs: string[]) => sql`with m as (
    select result, amount, avg_price, pnl, coalesce(sold_share, 0) > ${SOLD_EARLY_SHARE} as early from terminal.moves
    where source = 'polymarket' and result is not null and pnl is not null and hidden_at is null and ${notComboSql} and tab in (${sql.join(tabs.map(t => sql`${t}`), sql`, `)}))
  select count(*) filter (where result = 'won' and not early)::int as won, count(*) filter (where result = 'lost' and not early)::int as lost,
    count(*) filter (where result = 'void')::int as refunded, count(*) filter (where result <> 'void' and early)::int as sold_early,
    sum(amount * avg_price) filter (where result in ('won', 'lost') and not early and avg_price > 0 and avg_price < 1)::float as wp,
    sum(amount) filter (where result in ('won', 'lost') and not early and avg_price > 0 and avg_price < 1)::float as w,
    coalesce(sum(pnl), 0)::float as net
  from m`;

/** The settled record, from the database: one query, used by the home trust block, pricing and the top of /results,
 *  so the numbers always match. */
export async function settledRecord(db: Db): Promise<SettledRecord | null> {
  const r = (await db.execute(RECORD_SQL(liveTabs()))).rows[0] as { won: number; lost: number; refunded: number; sold_early: number; wp: number | null; w: number | null; net: number } | undefined;
  if (!r || Number(r.won) + Number(r.lost) + Number(r.refunded) + Number(r.sold_early) === 0) return null;
  return { won: Number(r.won), lost: Number(r.lost), refunded: Number(r.refunded), soldEarly: Number(r.sold_early), oddsPct: r.w ? (Number(r.wp) / Number(r.w)) * 100 : null, net: Number(r.net) };
}

export async function trustFacts(db: Db): Promise<TrustFacts> {
  const [settled, a] = await Promise.all([
    settledRecord(db),
    db.execute(sql`select run_at, count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status <> 'skipped')::int as checked,
      count(*) filter (where status = 'mismatch')::int as hidden
      from terminal.accuracy_checks where run_at = (select max(run_at) from terminal.accuracy_checks) group by run_at`),
  ]);
  const ar = a.rows[0] as { run_at: string; ok: number; checked: number; hidden: number } | undefined;
  return {
    settled,
    accuracy: ar && Number(ar.checked) > 0 ? { runAt: new Date(ar.run_at).getTime(), ok: Number(ar.ok), checked: Number(ar.checked), hidden: Number(ar.hidden) } : null,
  };
}

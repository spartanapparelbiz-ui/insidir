/* The facts behind the trust block (components/TrustBlock.tsx), read from the database: the settled record (every
 * move whose market has settled, won or lost, the same rows as /results) and the latest hourly accuracy check.
 * Nothing here is typed in by hand. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";

/** The settled record: every settled move we've shown (the same rows as /results), with the money behind it.
 *  oddsPct: the average price paid, weighted by amount, over won and lost moves (what the market said their chance
 *  was, in %). net: what those bets made together: a win pays amount / avgPrice − amount, a loss is −amount, a
 *  refund 0. */
export interface SettledRecord { won: number; lost: number; refunded: number; oddsPct: number | null; net: number }

export interface TrustFacts {
  settled: SettledRecord | null;
  accuracy: { runAt: number; ok: number; checked: number; hidden: number } | null;
}

/** Pure: the record from rows (used by tests to check the SQL). */
export function recordOf(rows: ReadonlyArray<{ result: string | null; amount: number; avgPrice: number }>): SettledRecord {
  let won = 0, lost = 0, refunded = 0, w = 0, wp = 0, net = 0;
  for (const r of rows) {
    if (r.result === "won") { won++; if (r.avgPrice > 0 && r.avgPrice < 1) net += r.amount / r.avgPrice - r.amount; }
    else if (r.result === "lost") { lost++; net -= r.amount; }
    else if (r.result === "void") refunded++;
    else continue;
    if ((r.result === "won" || r.result === "lost") && r.avgPrice > 0 && r.avgPrice < 1) { w += r.amount; wp += r.amount * r.avgPrice; }
  }
  return { won, lost, refunded, oddsPct: w > 0 ? (wp / w) * 100 : null, net };
}

const RECORD_SQL = (tabs: string[]) => sql`select count(*) filter (where result = 'won')::int as won, count(*) filter (where result = 'lost')::int as lost,
    count(*) filter (where result = 'void')::int as refunded,
    sum(amount * avg_price) filter (where result in ('won', 'lost') and avg_price > 0 and avg_price < 1)::float as wp,
    sum(amount) filter (where result in ('won', 'lost') and avg_price > 0 and avg_price < 1)::float as w,
    coalesce(sum(case when result = 'won' and avg_price > 0 and avg_price < 1 then amount / avg_price - amount when result = 'lost' then -amount else 0 end), 0)::float as net
  from terminal.moves where result is not null and hidden_at is null and tab in (${sql.join(tabs.map(t => sql`${t}`), sql`, `)})`;

/** The settled record, from the database: one query, used by the home trust block, pricing and the top of /results,
 *  so the numbers always match. */
export async function settledRecord(db: Db): Promise<SettledRecord | null> {
  const r = (await db.execute(RECORD_SQL(liveTabs()))).rows[0] as { won: number; lost: number; refunded: number; wp: number | null; w: number | null; net: number } | undefined;
  if (!r || Number(r.won) + Number(r.lost) + Number(r.refunded) === 0) return null;
  return { won: Number(r.won), lost: Number(r.lost), refunded: Number(r.refunded), oddsPct: r.w ? (Number(r.wp) / Number(r.w)) * 100 : null, net: Number(r.net) };
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

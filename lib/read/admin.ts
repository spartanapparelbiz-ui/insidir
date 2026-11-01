/* /admin's numbers for the one tool (server only), from first-party events (lib/analytics) and terminal.reads:
 *   to first Read   per visitor, from their first landing_view to their first "read" (both on the same visitor id)
 *   to paid         per paying account, from the first landing_view of the visitor it came from (users.visitor_id,
 *                   kept from the pay-first checkout's metadata) to its first "paid"
 *   Reads           how many, and how long building one took (the 5-second budget)
 *   Cancel reasons  the one reason each member gave, counted.
 * Medians and 75th percentiles; free-access accounts are left out of the paid numbers. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { userNotFree } from "@/lib/analytics";

export interface Spread { n: number; medianS: number | null; p75S: number | null }
export interface ReadTimings { toRead: Spread; toPaid: Spread; reads: { n: number; medianMs: number | null; p95Ms: number | null; over5s: number } }

const spread = (x: Record<string, unknown> | undefined): Spread => ({ n: Number(x?.n ?? 0), medianS: x?.med == null ? null : Number(x.med), p75S: x?.p75 == null ? null : Number(x.p75) });

export async function readTimings(db: Db, since: Date): Promise<ReadTimings> {
  const [toRead, toPaid, reads] = await Promise.all([
    db.execute(sql`with l as (select visitor_id, min(at) as at from terminal.events where name = 'landing_view' and at >= ${since} group by visitor_id),
        r as (select visitor_id, min(at) as at from terminal.events where name = 'read' and at >= ${since} group by visitor_id),
        d as (select extract(epoch from r.at - l.at) as s from l join r using (visitor_id) where r.at >= l.at)
      select count(*)::int as n, percentile_cont(0.5) within group (order by s) as med, percentile_cont(0.75) within group (order by s) as p75 from d`),
    db.execute(sql`with p as (select user_id, min(at) as at from terminal.events where name = 'paid' and at >= ${since} group by user_id),
        d as (select extract(epoch from p.at - min(l.at)) as s from p join terminal.users u on u.id = p.user_id
          join terminal.events l on l.name = 'landing_view' and l.visitor_id = u.visitor_id and l.at <= p.at
          where ${userNotFree(sql`u.email`)} group by p.user_id, p.at)
      select count(*)::int as n, percentile_cont(0.5) within group (order by s) as med, percentile_cont(0.75) within group (order by s) as p75 from d`),
    db.execute(sql`select count(*)::int as n, percentile_cont(0.5) within group (order by ms) as med, percentile_cont(0.95) within group (order by ms) as p95,
        count(*) filter (where ms > 5000)::int as over from terminal.reads where created_at >= ${since}`),
  ]);
  const r = reads.rows[0] as Record<string, unknown> | undefined;
  return {
    toRead: spread(toRead.rows[0] as Record<string, unknown>), toPaid: spread(toPaid.rows[0] as Record<string, unknown>),
    reads: { n: Number(r?.n ?? 0), medianMs: r?.med == null ? null : Math.round(Number(r.med)), p95Ms: r?.p95 == null ? null : Math.round(Number(r.p95)), over5s: Number(r?.over ?? 0) },
  };
}

export async function cancelReasonCounts(db: Db, since: Date): Promise<Array<{ reason: string; n: number }>> {
  const r = await db.execute(sql`select reason, count(*)::int as n from terminal.cancel_reasons where created_at >= ${since} group by reason order by n desc`);
  return (r.rows as Array<{ reason: string; n: number }>).map(x => ({ reason: x.reason, n: Number(x.n) }));
}

/** "42s", "6m 10s", "3h 5m", "2d 4h". */
export function duration(s: number | null): string {
  if (s === null) return "—";
  const v = Math.round(s);
  if (v < 60) return `${v}s`;
  if (v < 3600) return `${Math.floor(v / 60)}m ${v % 60}s`;
  if (v < 86400) return `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`;
  return `${Math.floor(v / 86400)}d ${Math.floor((v % 86400) / 3600)}h`;
}

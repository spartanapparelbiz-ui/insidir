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
    db.execute(sql`with l as (select visitor_id, min(at) as at from terminal.events where name = 'landing_view' and at >= ${since} and visitor_id not like 'monitor-%' group by visitor_id),
        r as (select visitor_id, min(at) as at from terminal.events where name = 'read' and at >= ${since} group by visitor_id),
        d as (select extract(epoch from r.at - l.at) as s from l join r using (visitor_id) where r.at >= l.at)
      select count(*)::int as n, percentile_cont(0.5) within group (order by s) as med, percentile_cont(0.75) within group (order by s) as p75 from d`),
    db.execute(sql`with p as (select user_id, min(at) as at from terminal.events where name = 'paid' and at >= ${since} group by user_id),
        d as (select extract(epoch from p.at - min(l.at)) as s from p join terminal.users u on u.id = p.user_id
          join terminal.events l on l.name = 'landing_view' and l.visitor_id = u.visitor_id and l.at <= p.at
          where ${userNotFree(sql`u.email`)} group by p.user_id, p.at)
      select count(*)::int as n, percentile_cont(0.5) within group (order by s) as med, percentile_cont(0.75) within group (order by s) as p75 from d`),
    db.execute(sql`select count(*)::int as n, percentile_cont(0.5) within group (order by ms) as med, percentile_cont(0.95) within group (order by ms) as p95,
        count(*) filter (where ms > 5000)::int as over from terminal.reads where created_at >= ${since} and input <> 'refresh' and coalesce(visitor_id, '') not like 'monitor-%'`),
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

export interface PostRow { post: string; source: string | null; visits: number; reads: number; paid: number }

/** Per post (utm_content, else utm_campaign, else utm_source, from each visitor's first landing): visits → Reads → paid
 *  (an account that came from that visitor and has a "paid" event). Monitor visits left out. */
export async function postFunnel(db: Db, since: Date): Promise<PostRow[]> {
  const r = await db.execute(sql`with l as (
      select distinct on (visitor_id) visitor_id, coalesce(props->>'utm_content', props->>'utm_campaign', props->>'utm_source') as post, props->>'utm_source' as source
      from terminal.events where name = 'landing_view' and at >= ${since} and visitor_id not like 'monitor-%' order by visitor_id, at asc)
    select coalesce(l.post, '(no UTM)') as post, max(l.source) as source, count(*)::int as visits,
      count(*) filter (where exists (select 1 from terminal.events r where r.name = 'read' and r.visitor_id = l.visitor_id))::int as reads,
      count(*) filter (where exists (select 1 from terminal.users u join terminal.events p on p.user_id = u.id and p.name = 'paid' where u.visitor_id = l.visitor_id and ${userNotFree(sql`u.email`)}))::int as paid
    from l group by 1 order by visits desc limit 50`);
  return (r.rows as Array<{ post: string; source: string | null; visits: number; reads: number; paid: number }>).map(x => ({ post: x.post, source: x.source, visits: Number(x.visits), reads: Number(x.reads), paid: Number(x.paid) }));
}

export interface Retention { day8: { started: number; paid: number }; churn30: { active: number; churned: number } }

/** Paid on day 8: of the accounts whose $1 week started 8 to 38 days ago, how many were charged again 6+ days after it
 *  (the $39). 30-day churn: of the accounts paying 30 to 60 days ago, how many no longer have Insidir or are set to
 *  cancel. Free-access accounts left out. */
export async function retention(db: Db, now: number): Promise<Retention> {
  const d = (n: number) => new Date(now - n * 86_400_000);
  const [a, b] = await Promise.all([
    db.execute(sql`with f as (select p.user_id, min(p.at) as first from terminal.events p join terminal.users u on u.id = p.user_id
        where p.name = 'paid' and ${userNotFree(sql`u.email`)} group by p.user_id)
      select count(*)::int as started, count(*) filter (where exists (select 1 from terminal.events p2 where p2.name = 'paid' and p2.user_id = f.user_id and p2.at >= f.first + interval '6 days'))::int as paid
      from f where f.first between ${d(38)} and ${d(8)}`),
    db.execute(sql`with c as (select distinct p.user_id from terminal.events p join terminal.users u on u.id = p.user_id
        where p.name = 'paid' and p.at between ${d(60)} and ${d(30)} and ${userNotFree(sql`u.email`)})
      select count(*)::int as active, count(*) filter (where u.plan = 'free' or u.cancel_at_period_end)::int as churned from c join terminal.users u on u.id = c.user_id`),
  ]);
  const x = a.rows[0] as { started: number; paid: number } | undefined, y = b.rows[0] as { active: number; churned: number } | undefined;
  return { day8: { started: Number(x?.started ?? 0), paid: Number(x?.paid ?? 0) }, churn30: { active: Number(y?.active ?? 0), churned: Number(y?.churned ?? 0) } };
}

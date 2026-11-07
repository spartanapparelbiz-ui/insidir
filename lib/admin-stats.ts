/* /admin's numbers for the one tool (server only), from first-party events (lib/analytics):
 *   Cancel reasons  the one reason each member gave, counted; retention and the post funnel. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { userNotFree } from "@/lib/analytics";
import { TRIAL } from "@/lib/plans";

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

export interface Retention { afterTrial: { started: number; paid: number }; churn30: { active: number; churned: number } }

/** Paid after the trial (day TRIAL.days + 1): of the accounts whose $1 trial started TRIAL.days + 1 to TRIAL.days + 31
 *  days ago, how many were charged again TRIAL.days - 1 or more days after it
 *  (the $39). 30-day churn: of the accounts paying 30 to 60 days ago, how many no longer have Insidir or are set to
 *  cancel. Free-access accounts left out. */
export async function retention(db: Db, now: number): Promise<Retention> {
  const d = (n: number) => new Date(now - n * 86_400_000);
  const [a, b] = await Promise.all([
    db.execute(sql`with f as (select p.user_id, min(p.at) as first from terminal.events p join terminal.users u on u.id = p.user_id
        where p.name = 'paid' and ${userNotFree(sql`u.email`)} group by p.user_id)
      select count(*)::int as started, count(*) filter (where exists (select 1 from terminal.events p2 where p2.name = 'paid' and p2.user_id = f.user_id and p2.at >= f.first + make_interval(days => ${TRIAL.days - 1})))::int as paid
      from f where f.first between ${d(TRIAL.days + 31)} and ${d(TRIAL.days + 1)}`),
    db.execute(sql`with c as (select distinct p.user_id from terminal.events p join terminal.users u on u.id = p.user_id
        where p.name = 'paid' and p.at between ${d(60)} and ${d(30)} and ${userNotFree(sql`u.email`)})
      select count(*)::int as active, count(*) filter (where u.plan = 'free' or u.cancel_at_period_end)::int as churned from c join terminal.users u on u.id = c.user_id`),
  ]);
  const x = a.rows[0] as { started: number; paid: number } | undefined, y = b.rows[0] as { active: number; churned: number } | undefined;
  return { afterTrial: { started: Number(x?.started ?? 0), paid: Number(x?.paid ?? 0) }, churn30: { active: Number(y?.active ?? 0), churned: Number(y?.churned ?? 0) } };
}

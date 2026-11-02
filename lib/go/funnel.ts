/* /admin/go: the /go funnel per UTM source, from go_step / go_time events (app/api/go/route.ts): visitors at each step,
 * drop-off from the step before, median seconds spent on it; then checkout opened, paid, and still paid after the
 * trial (accounts made from those visitors, on a paid plan, older than the trial). Plus ping opt-in and pings per
 * member per day. Free-access accounts are left out. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { TRIAL } from "@/lib/plans";

export const GO_STEPS = ["hook", "topics", "venue", "stake", "building", "aha", "paywall", "checkout"] as const;
export const GO_LABEL: Record<string, string> = { hook: "Hook", topics: "What they bet on", venue: "Where they bet", stake: "Bet size", building: "Building", aha: "Aha", paywall: "Paywall", checkout: "Checkout opened" };

export interface GoRow { source: string; steps: Record<string, { visitors: number; medianMs: number | null }>; paid: number; paidAfterTrial: number }

export async function goFunnel(db: Db, since: Date, now: number): Promise<GoRow[]> {
  // Visitors who saw each step (go_step), and the median time spent on it by those who moved on (go_time).
  const r = await db.execute(sql`select coalesce(props->>'source', 'direct') as source, props->>'step' as step,
      count(distinct visitor_id) filter (where name = 'go_step')::int as visitors,
      percentile_cont(0.5) within group (order by (props->>'ms')::float) filter (where name = 'go_time') as median
    from terminal.events where name in ('go_step', 'go_time') and at >= ${since} group by 1, 2`);
  const paid = await db.execute(sql`select coalesce(e.source, 'direct') as source,
      count(distinct u.id) filter (where u.plan <> 'free')::int as paid,
      count(distinct u.id) filter (where u.plan <> 'free' and u.created_at < ${new Date(now - TRIAL.days * 86_400_000)} and not coalesce(u.cancel_at_period_end, false))::int as after
    from (select distinct visitor_id, coalesce(props->>'source', 'direct') as source from terminal.events where name = 'go_step' and at >= ${since}) e
    join terminal.users u on u.visitor_id = e.visitor_id group by 1`);
  const out = new Map<string, GoRow>();
  const row = (s: string) => out.get(s) ?? (out.set(s, { source: s, steps: {}, paid: 0, paidAfterTrial: 0 }), out.get(s)!);
  for (const x of r.rows as Array<{ source: string; step: string; visitors: number; median: number | null }>) row(x.source).steps[x.step] = { visitors: Number(x.visitors), medianMs: x.median === null ? null : Number(x.median) };
  for (const x of paid.rows as Array<{ source: string; paid: number; after: number }>) Object.assign(row(x.source), { paid: Number(x.paid), paidAfterTrial: Number(x.after) });
  return [...out.values()].sort((a, b) => (b.steps.hook?.visitors ?? 0) - (a.steps.hook?.visitors ?? 0));
}

export interface PingStats { members: number; optedIn: number; pingsPerMemberDay: number | null }
export async function pingStats(db: Db, now: number): Promise<PingStats> {
  const r = await db.execute(sql`select
      (select count(*)::int from terminal.users where plan <> 'free') as members,
      (select count(distinct u.id)::int from terminal.users u join terminal.push_subscriptions p on p.user_id = u.id where u.plan <> 'free') as opted,
      (select count(*)::float from terminal.millionaire_pings where sent_at > ${new Date(now - 7 * 86_400_000)}) as pings`);
  const x = r.rows[0] as { members: number; opted: number; pings: number } | undefined;
  const opted = Number(x?.opted ?? 0);
  return { members: Number(x?.members ?? 0), optedIn: opted, pingsPerMemberDay: opted ? Number(x?.pings ?? 0) / opted / 7 : null };
}

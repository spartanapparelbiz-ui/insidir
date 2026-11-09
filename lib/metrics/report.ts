/* /admin/metrics: which account and which post bring paying users who stay. Rows grouped by source (the account:
 * ?ref=, else utm_source, else the referrer's host, else direct; lib/attribution.ts) or by source and post
 * (utm_content), for a window of days (ET), from terminal.events (lib/metrics/events.ts) and terminal.users.
 *   visits        new visitors whose first touch was in the window
 *   signups       accounts made in the window
 *   trials        $1 trials started in the window
 *   paid          trials that turned into the $39 plan in the window
 *   trial→paid %  of the trials started in the window that are past their 3 days, the share that paid
 *   MRR           paying members now × the monthly price (members in the $1 trial and members set to cancel don't count)
 *   30-day churn  of members paying in the last 30 days, the share that cancelled or were refunded in them
 *   activation %  of the window's signups, the share that followed 2+ wallets within 24 hours, opened the Daily Brief
 *                 or clicked an alert
 *   D1/D7/D30     of the window's signups at least N days old, the share signed in on day N or later
 * Free-access accounts (FREE_ACCESS_EMAILS) and our monitor are left out of everything. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { userNotFree } from "@/lib/analytics";
import { PLANS, TRIAL } from "@/lib/plans";

export type GroupBy = "source" | "post";
export interface MetricsWindow { from: string; to: string }
export interface MetricsRow {
  key: string; source: string; post: string | null;
  visits: number; signups: number; trials: number; paid: number;
  trialsMatured: number; converted: number; trialToPaid: number | null;
  paying: number; mrr: number; churned: number; churn30: number | null;
  activated: number; activation: number | null;
}
export interface Retention { d1: number | null; d7: number | null; d30: number | null; n1: number; n7: number; n30: number }
export interface MetricsTotals extends MetricsRow { retention: Retention }

const DAY = 86_400_000;
const etDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The window from a query string: ?from=&to= (ET dates, inclusive), default the last 30 days. */
export function readWindow(q: Record<string, string | string[] | undefined>, now: number): MetricsWindow {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const days = Number(one(q.days));
  const from = isDate(one(q.from)) ? one(q.from)! : etDate(now - ((days > 0 && days <= 3650 ? days : 30) - 1) * DAY);
  const to = isDate(one(q.to)) ? one(q.to)! : etDate(now);
  return from <= to ? { from, to } : { from: to, to: from };
}

const START = (w: MetricsWindow) => sql`((${w.from}::date)::timestamp at time zone 'America/New_York')`;
const END = (w: MetricsWindow) => sql`(((${w.to}::date) + 1)::timestamp at time zone 'America/New_York')`;
const pct = (a: number, b: number) => (b > 0 ? a / b : null);

/** The key a user or a touch is grouped under. */
const userKey = (by: GroupBy): SQL => by === "post"
  ? sql`coalesce(u.source, 'direct') || ' · ' || coalesce(nullif(u.first_touch->>'utm_content', ''), '(no post tag)')`
  : sql`coalesce(u.source, 'direct')`;
const touchKey = (by: GroupBy): SQL => by === "post"
  ? sql`coalesce(e.props->>'source', 'direct') || ' · ' || coalesce(nullif(e.props->>'utm_content', ''), '(no post tag)')`
  : sql`coalesce(e.props->>'source', 'direct')`;

/** Accounts counted: not on the free-access list. */
const COUNTED = sql`${userNotFree(sql`u.email`)}`;
/** Paying now: on the plan, past the trial, not set to cancel. An account from before billing events is paying when
 *  Whop says active and it isn't trialing. */
const PAYING = sql`(u.plan = 'insidir' and not u.cancel_at_period_end and coalesce(u.membership_status, 'active') in ('active', 'past_due')
  and not (exists (select 1 from terminal.events t where t.user_id = u.id and t.name = 'trial_start')
           and not exists (select 1 from terminal.events c where c.user_id = u.id and c.name = 'trial_convert')))`;

export async function metricsRows(db: Db, w: MetricsWindow, by: GroupBy, now = Date.now()): Promise<MetricsRow[]> {
  const S = START(w), E = END(w), nowTs = new Date(now), matured = new Date(now - TRIAL.days * DAY), d30 = new Date(now - 30 * DAY);
  const r = await db.execute(sql`
    with visits as (
      select ${touchKey(by)} as k, count(distinct e.visitor_id)::int as n from terminal.events e
      where e.name = 'touch' and e.props->>'kind' = 'first' and e.at >= ${S} and e.at < ${E} and e.visitor_id not like 'monitor-%' group by 1),
    acct as (
      select u.id, ${userKey(by)} as k, u.created_at,
        (u.created_at >= ${S} and u.created_at < ${E}) as signed_up,
        (select min(at) from terminal.events t where t.user_id = u.id and t.name = 'trial_start') as trial_at,
        (select min(at) from terminal.events t where t.user_id = u.id and t.name = 'trial_convert') as paid_at,
        (select max(at) from terminal.events t where t.user_id = u.id and t.name in ('sub_cancel', 'cancel', 'refund')) as churn_at,
        exists (select 1 from terminal.events t where t.user_id = u.id and (t.name in ('brief_open', 'alert_opened') or t.name = 'activation_follow2')) as activated,
        ${PAYING} as paying
      from terminal.users u where ${COUNTED}),
    g as (
      select k,
        count(*) filter (where signed_up)::int as signups,
        count(*) filter (where trial_at >= ${S} and trial_at < ${E})::int as trials,
        count(*) filter (where paid_at >= ${S} and paid_at < ${E})::int as paid,
        count(*) filter (where trial_at >= ${S} and trial_at < ${E} and trial_at <= ${matured})::int as trials_matured,
        count(*) filter (where trial_at >= ${S} and trial_at < ${E} and trial_at <= ${matured} and paid_at is not null)::int as converted,
        count(*) filter (where paying)::int as paying,
        count(*) filter (where churn_at >= ${d30} and churn_at <= ${nowTs} and (paid_at is not null or trial_at is null) and not paying)::int as churned,
        count(*) filter (where signed_up and activated)::int as activated
      from acct group by k)
    select coalesce(g.k, v.k) as k, coalesce(v.n, 0)::int as visits, coalesce(g.signups, 0)::int as signups, coalesce(g.trials, 0)::int as trials,
      coalesce(g.paid, 0)::int as paid, coalesce(g.trials_matured, 0)::int as trials_matured, coalesce(g.converted, 0)::int as converted,
      coalesce(g.paying, 0)::int as paying, coalesce(g.churned, 0)::int as churned, coalesce(g.activated, 0)::int as activated
    from g full outer join visits v on v.k = g.k`);
  const price = PLANS.insidir.price;
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const key = String(x.k ?? "direct"), n = (k: string) => Number(x[k] ?? 0);
    const [source, post] = by === "post" ? [key.split(" · ")[0]!, key.split(" · ").slice(1).join(" · ")] : [key, null];
    return {
      key, source, post, visits: n("visits"), signups: n("signups"), trials: n("trials"), paid: n("paid"),
      trialsMatured: n("trials_matured"), converted: n("converted"), trialToPaid: pct(n("converted"), n("trials_matured")),
      paying: n("paying"), mrr: n("paying") * price, churned: n("churned"), churn30: pct(n("churned"), n("paying") + n("churned")),
      activated: n("activated"), activation: pct(n("activated"), n("signups")),
    };
  }).filter(r => r.visits || r.signups || r.trials || r.paid || r.paying || r.churned)
    .sort((a, b) => b.mrr - a.mrr || b.paid - a.paid || b.trials - a.trials || b.signups - a.signups || b.visits - a.visits || a.key.localeCompare(b.key));
}

/** The window's totals: every row summed (rates recomputed from the sums), plus D1/D7/D30 retention. */
export async function metricsTotals(db: Db, w: MetricsWindow, rows: readonly MetricsRow[], now = Date.now()): Promise<MetricsTotals> {
  const sum = (k: keyof MetricsRow) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const t = {
    key: "Total", source: "Total", post: null, visits: sum("visits"), signups: sum("signups"), trials: sum("trials"), paid: sum("paid"),
    trialsMatured: sum("trialsMatured"), converted: sum("converted"), trialToPaid: pct(sum("converted"), sum("trialsMatured")),
    paying: sum("paying"), mrr: sum("mrr"), churned: sum("churned"), churn30: pct(sum("churned"), sum("paying") + sum("churned")),
    activated: sum("activated"), activation: pct(sum("activated"), sum("signups")),
  };
  return { ...t, retention: await retention(db, w, now) };
}

/** Of the window's signups at least N days old, the share signed in on day N or later (ET days). */
export async function retention(db: Db, w: MetricsWindow, now = Date.now()): Promise<Retention> {
  const r = (await db.execute(sql`
    with c as (select u.id, (u.created_at at time zone 'America/New_York')::date as d0 from terminal.users u
      where u.created_at >= ${START(w)} and u.created_at < ${END(w)} and ${COUNTED})
    select
      count(*) filter (where c.d0 + 1 <= ${etDate(now)}::date)::int as n1,
      count(*) filter (where c.d0 + 1 <= ${etDate(now)}::date and exists (select 1 from terminal.user_activity a where a.user_id = c.id and a.day >= c.d0 + 1))::int as r1,
      count(*) filter (where c.d0 + 7 <= ${etDate(now)}::date)::int as n7,
      count(*) filter (where c.d0 + 7 <= ${etDate(now)}::date and exists (select 1 from terminal.user_activity a where a.user_id = c.id and a.day >= c.d0 + 7))::int as r7,
      count(*) filter (where c.d0 + 30 <= ${etDate(now)}::date)::int as n30,
      count(*) filter (where c.d0 + 30 <= ${etDate(now)}::date and exists (select 1 from terminal.user_activity a where a.user_id = c.id and a.day >= c.d0 + 30))::int as r30
    from c`)).rows[0] as Record<string, number>;
  const n = (k: string) => Number(r?.[k] ?? 0);
  return { d1: pct(n("r1"), n("n1")), d7: pct(n("r7"), n("n7")), d30: pct(n("r30"), n("n30")), n1: n("n1"), n7: n("n7"), n30: n("n30") };
}

export const fmtPct = (v: number | null): string => (v === null ? "—" : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`);
export const fmtUsd = (v: number): string => `$${Math.round(v).toLocaleString("en-US")}`;

/** The table as CSV (the rows, then the total). */
export function metricsCsv(rows: readonly MetricsRow[], total: MetricsTotals, w: MetricsWindow, by: GroupBy): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rate = (v: number | null) => (v === null ? "" : (v * 100).toFixed(1));
  const head = ["from", "to", "source", ...(by === "post" ? ["post"] : []), "visits", "signups", "trials", "paid", "trials_past_3_days", "converted", "trial_to_paid_pct", "paying_now", "mrr_usd", "churned_30d", "churn_30d_pct", "activated", "activation_pct"];
  const line = (r: MetricsRow) => [w.from, w.to, r.source, ...(by === "post" ? [r.post ?? ""] : []), r.visits, r.signups, r.trials, r.paid, r.trialsMatured, r.converted, rate(r.trialToPaid), r.paying, r.mrr, r.churned, rate(r.churn30), r.activated, rate(r.activation)].map(esc).join(",");
  const tail = [`# retention: D1 ${rate(total.retention.d1)}% (n=${total.retention.n1}), D7 ${rate(total.retention.d7)}% (n=${total.retention.n7}), D30 ${rate(total.retention.d30)}% (n=${total.retention.n30})`];
  return [head.join(","), ...rows.map(line), line({ ...total, source: "TOTAL", post: by === "post" ? "" : null }), ...tail].join("\n") + "\n";
}

/** The daily snapshot (worker metrics:daily, after midnight ET): yesterday's counts per source, with the state at the
 *  time it ran (paying, MRR, churn, the last 30 days' activation and retention), and a "__all__" row. Idempotent. */
export async function snapshotDaily(db: Db, now = Date.now(), day = etDate(now - DAY)): Promise<number> {
  const w = { from: day, to: day };
  const rows = await metricsRows(db, w, "source", now);
  const last30 = { from: etDate(now - 30 * DAY), to: day };
  const state = new Map((await metricsRows(db, last30, "source", now)).map(r => [r.key, r]));
  const total = await metricsTotals(db, last30, [...state.values()], now);
  const keys = new Set([...rows.map(r => r.key), ...state.keys()]);
  const write = async (source: string, today: Partial<MetricsRow>, s: Partial<MetricsRow>, ret: Retention | null) => {
    await db.execute(sql`insert into terminal.metrics_daily (day, source, visits, signups, trials, paid, paying, trial_to_paid, mrr, churn30, activation, retention, computed_at)
      values (${day}::date, ${source}, ${today.visits ?? 0}, ${today.signups ?? 0}, ${today.trials ?? 0}, ${today.paid ?? 0}, ${s.paying ?? 0}, ${s.trialToPaid ?? null}, ${s.mrr ?? 0},
        ${s.churn30 ?? null}, ${s.activation ?? null}, ${ret ? JSON.stringify(ret) : null}::jsonb, ${new Date(now)})
      on conflict (day, source) do update set visits = excluded.visits, signups = excluded.signups, trials = excluded.trials, paid = excluded.paid, paying = excluded.paying,
        trial_to_paid = excluded.trial_to_paid, mrr = excluded.mrr, churn30 = excluded.churn30, activation = excluded.activation, retention = excluded.retention, computed_at = excluded.computed_at`);
  };
  for (const k of keys) await write(k, rows.find(r => r.key === k) ?? {}, state.get(k) ?? {}, null);
  const todayAll = rows.reduce((a, r) => ({ visits: a.visits + r.visits, signups: a.signups + r.signups, trials: a.trials + r.trials, paid: a.paid + r.paid }), { visits: 0, signups: 0, trials: 0, paid: 0 });
  await write("__all__", todayAll, total, total.retention);
  return keys.size + 1;
}

/** The snapshot runs once a day, after midnight ET. */
export function snapshotDue(now: number, lastDay: string | null): { due: boolean; day: string } {
  const day = etDate(now - DAY);
  return { due: day !== lastDay, day };
}

export async function recentSnapshots(db: Db, days = 30): Promise<Array<{ day: string; visits: number; signups: number; trials: number; paid: number; paying: number; mrr: number }>> {
  const r = await db.execute(sql`select to_char(day, 'YYYY-MM-DD') as day, visits, signups, trials, paid, paying, mrr from terminal.metrics_daily
    where source = '__all__' order by day desc limit ${days}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({ day: String(x.day), visits: Number(x.visits), signups: Number(x.signups), trials: Number(x.trials), paid: Number(x.paid), paying: Number(x.paying), mrr: Number(x.mrr) }));
}

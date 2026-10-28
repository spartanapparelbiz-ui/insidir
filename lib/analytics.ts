/* First-party measurement: the funnel (landing view → feed view → unlock click → checkout start → paid → first
 * alert opened), UTM tags per IG account and reel, and a cookie A/B split on the hero headline and CTA.
 * Nothing goes to third parties. Visitor ids are random (set in middleware.ts), never derived from anything personal. */
import { gte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { events } from "./db/schema";
import { freeAccessEmails } from "./billing/free";

/** The sign-up funnel, in order: each step is the events that count for it. Each person counts once per step, on the
 *  day they first got there. Free-access accounts (lib/billing/free.ts) are left out of every number. */
export const FUNNEL_STEPS = [
  { key: "landing_view", label: "Landing view", names: ["landing_view"] },
  { key: "cta_click", label: "CTA click", names: ["unlock_click", "hero_cta_click"] },
  { key: "start_view", label: "/start view", names: ["start_view"] },
  { key: "account_created", label: "Account created", names: ["account_created"] },
  { key: "checkout_start", label: "Payment started", names: ["checkout_start"] },
  { key: "paid", label: "Paid", names: ["paid"] },
  { key: "onboarding_done", label: "Onboarding done", names: ["onboarding_done", "onboarding_skip"] },
  { key: "first_follow", label: "First follow", names: ["first_follow"] },
] as const;
export const FUNNEL = FUNNEL_STEPS.map(s => s.key);
export const FUNNEL_LABEL: Record<string, string> = Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, s.label]));
const STEP_OF = sql.raw(`case name ${FUNNEL_STEPS.flatMap(s => s.names.map(n => `when '${n}' then '${s.key}'`)).join(" ")} end`);
const STEP_NAMES = FUNNEL_STEPS.flatMap(s => [...s.names]);

/** SQL: this event isn't from a free-access account (by its account, or the visitor id that account signed up from). */
function notFreeAccess(): ReturnType<typeof sql> {
  const list = [...freeAccessEmails()];
  if (!list.length) return sql`true`;
  const emails = sql.join(list.map(e => sql`${e}`), sql`, `);
  return sql`not exists (select 1 from terminal.users fu where lower(fu.email) in (${emails})
    and (fu.id = terminal.events.user_id or (fu.visitor_id is not null and fu.visitor_id = terminal.events.visitor_id)))`;
}

/** SQL: a user isn't on the free-access list (signups, paid and conversion numbers). */
export function userNotFree(col = sql`email`): ReturnType<typeof sql> {
  const list = [...freeAccessEmails()];
  return list.length ? sql`coalesce(lower(${col}), '') not in (${sql.join(list.map(e => sql`${e}`), sql`, `)})` : sql`true`;
}

/** Drop-off between two steps: the share of the previous step that didn't reach this one. */
export const dropOff = (cur: number, prev: number): number | null => (prev > 0 ? Math.max(0, 1 - cur / prev) : null);
export type FunnelEvent = (typeof FUNNEL)[number];
/** Events the browser may report (the rest are recorded by the server). */
export const CLIENT_EVENTS: ReadonlySet<string> = new Set(["unlock_click", "checkout_start", "onboarding_done", "onboarding_skip", "first_feed_hint",
  // The home hero: its button, a tap on the ticker strip, and the feed preview scrolled into view.
  "hero_cta_click", "ticker_click", "feed_preview_view", "offer_view",
  // A lock opened (its sheet: what you get, the price, one button); where says which (live, record, follow, alerts).
  "lock_view"]);

export const UTM_COOKIE = "insidir_utm";
export const AB_COOKIE = "insidir_ab";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** A/B tests: each visitor is assigned one variant per test, kept in a cookie for 90 days. */
export const AB_TESTS = {
  hero: {
    a: { headline: "Two apps. Two prices. You keep the difference.", cta: "See today's live deals" },
    b: { headline: "Polymarket and Kalshi disagree. You collect the difference.", cta: "See today's live deals" },
  },
} as const;
export type HeroVariant = keyof typeof AB_TESTS.hero;

export function readUtm(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const out: Record<string, string> = {};
    for (const k of UTM_KEYS) { const x = (v as Record<string, unknown>)[k]; if (typeof x === "string" && x.length <= 100) out[k] = x; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

export function utmFromSearch(params: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) { const v = params.get(k); if (v) out[k] = v.slice(0, 100); }
  return Object.keys(out).length ? out : null;
}

export const heroVariant = (ab: string | undefined): HeroVariant => (/(^|,)hero:b(,|$)/.test(ab ?? "") ? "b" : "a");

export async function recordEvent(e: { name: string; visitorId?: string | null; userId?: string | null; variant?: string | null; props?: Record<string, string | number | boolean> }): Promise<void> {
  if (!hasDatabase()) return;
  await getDb().insert(events).values({ name: e.name, visitorId: e.visitorId ?? "server", userId: e.userId ?? null, variant: e.variant ?? null, props: e.props ?? null });
}

export interface FunnelRow { name: string; visitors: number }
export interface AbRow { variant: string; landing: number; feed: number; checkout: number; paid: number }

/** Distinct people (the account, else the visitor) reaching each funnel step since `since`. */
export async function funnelStats(since: Date): Promise<FunnelRow[]> {
  const res = await getDb().execute(sql`select ${STEP_OF} as step, count(distinct coalesce(user_id, visitor_id))::int as n from terminal.events
    where at >= ${since} and name in (${sql.join(STEP_NAMES.map(n => sql`${n}`), sql`, `)}) and ${notFreeAccess()} group by 1`);
  const rows = res.rows as Array<{ step: string; n: number }>;
  return FUNNEL.map(name => ({ name, visitors: Number(rows.find(r => r.step === name)?.n ?? 0) }));
}

export interface FunnelDay { day: string; counts: Record<string, number> }

/** People reaching each funnel step per day (Eastern days), counted on the day they first reached it. */
export async function funnelByDay(since: Date): Promise<FunnelDay[]> {
  const res = await getDb().execute(sql`
    with firsts as (
      select ${STEP_OF} as name, coalesce(user_id, visitor_id) as who, min(at) as at from terminal.events
      where name in (${sql.join(STEP_NAMES.map(n => sql`${n}`), sql`, `)}) and ${notFreeAccess()} group by 1, 2)
    select to_char(at at time zone 'America/New_York', 'YYYY-MM-DD') as day, name, count(*)::int as n
    from firsts where at >= ${since} group by 1, 2 order by 1 desc`);
  const days = new Map<string, Record<string, number>>();
  for (const r of res.rows as Array<{ day: string; name: string; n: number }>) {
    const d = days.get(r.day) ?? Object.fromEntries(FUNNEL.map(n => [n, 0]));
    d[r.name] = Number(r.n);
    days.set(r.day, d);
  }
  return [...days].map(([day, counts]) => ({ day, counts }));
}

/** Conversion per hero variant: visitors who saw the landing page with that variant, and how far they got. */
export async function abStats(since: Date): Promise<AbRow[]> {
  const res = await getDb().execute(sql`
    with seen as (select distinct visitor_id, variant from terminal.events where name = 'landing_view' and variant is not null and at >= ${since})
    select s.variant,
      count(distinct s.visitor_id)::int as landing,
      count(distinct e.visitor_id) filter (where e.name = 'feed_view')::int as feed,
      count(distinct e.visitor_id) filter (where e.name = 'checkout_start')::int as checkout,
      count(distinct u.id) filter (where u.plan <> 'free' and ${userNotFree(sql`u.email`)})::int as paid
    from seen s
    left join terminal.events e on e.visitor_id = s.visitor_id and e.at >= ${since}
    left join terminal.users u on u.visitor_id = s.visitor_id
    group by s.variant order by s.variant`);
  return (res.rows as Array<Record<string, unknown>>).map(r => ({ variant: String(r.variant), landing: Number(r.landing), feed: Number(r.feed), checkout: Number(r.checkout), paid: Number(r.paid) }));
}

/** UTM performance: signups and paid members per source/campaign/content. */
export async function utmStats(): Promise<Array<{ source: string; campaign: string; content: string; signups: number; paid: number }>> {
  const res = await getDb().execute(sql`
    select coalesce(utm->>'utm_source','(none)') as source, coalesce(utm->>'utm_campaign','') as campaign, coalesce(utm->>'utm_content','') as content,
      count(*)::int as signups, count(*) filter (where plan <> 'free')::int as paid
    from terminal.users where ${userNotFree()} group by 1,2,3 order by paid desc, signups desc limit 100`);
  return (res.rows as Array<Record<string, unknown>>).map(r => ({ source: String(r.source), campaign: String(r.campaign), content: String(r.content), signups: Number(r.signups), paid: Number(r.paid) }));
}

/** Every email on the free-access list and whether it has an account yet (for /admin). */
export async function freeAccessAccounts(): Promise<Array<{ email: string; userId: string | null }>> {
  const list = [...freeAccessEmails()];
  if (!list.length) return [];
  const res = await getDb().execute(sql`select id, lower(email) as email from terminal.users where lower(email) in (${sql.join(list.map(e => sql`${e}`), sql`, `)})`);
  const by = new Map((res.rows as Array<{ id: string; email: string }>).map(r => [r.email, r.id]));
  return list.map(email => ({ email, userId: by.get(email) ?? null }));
}

export const sinceDays = (days: number): Date => new Date(Date.now() - days * 86_400_000);

/* First-party measurement: the funnel (landing view → feed view → unlock click → checkout start → paid → first
 * alert opened), UTM tags per IG account and reel, and a cookie A/B split on the hero headline and CTA.
 * Nothing goes to third parties. Visitor ids are random (set in middleware.ts), never derived from anything personal. */
import { gte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { events } from "./db/schema";

/** The funnel: Home → the free feed (no sign-up) → a lock → checkout → paid → first follow → first alert opened; and
 *  cancel, to see who leaves. Each person counts once per step, on the day they first got there. */
export const FUNNEL = ["landing_view", "feed_view", "lock_view", "checkout_start", "paid", "first_follow", "alert_opened", "cancel"] as const;
export const FUNNEL_LABEL: Record<(typeof FUNNEL)[number], string> = {
  landing_view: "Home", feed_view: "Viewed the feed", lock_view: "Hit a lock", checkout_start: "Started checkout", paid: "Paid",
  first_follow: "First follow", alert_opened: "First alert opened", cancel: "Cancelled",
};
export type FunnelEvent = (typeof FUNNEL)[number];
/** Events the browser may report (the rest are recorded by the server). */
export const CLIENT_EVENTS: ReadonlySet<string> = new Set(["unlock_click", "checkout_start", "onboarding_done", "onboarding_skip",
  // The home hero: its button, a tap on the ticker strip, and the feed preview scrolled into view.
  "hero_cta_click", "ticker_click", "feed_preview_view",
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

/** Distinct visitors (or users, for server events) reaching each funnel step since `since`. */
export async function funnelStats(since: Date): Promise<FunnelRow[]> {
  const rows = await getDb().select({ name: events.name, visitors: sql<number>`count(distinct coalesce(${events.userId}, ${events.visitorId}))::int` })
    .from(events).where(gte(events.at, since)).groupBy(events.name);
  return FUNNEL.map(name => ({ name, visitors: rows.find(r => r.name === name)?.visitors ?? 0 }));
}

export interface FunnelDay { day: string; counts: Record<string, number> }

/** People reaching each funnel step per day (Eastern days), counted on the day they first reached it. */
export async function funnelByDay(since: Date): Promise<FunnelDay[]> {
  const res = await getDb().execute(sql`
    with firsts as (
      select name, coalesce(user_id, visitor_id) as who, min(at) as at from terminal.events
      where name in (${sql.join(FUNNEL.map(n => sql`${n}`), sql`, `)}) group by name, coalesce(user_id, visitor_id))
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
      count(distinct u.id) filter (where u.plan <> 'free')::int as paid
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
    from terminal.users group by 1,2,3 order by paid desc, signups desc limit 100`);
  return (res.rows as Array<Record<string, unknown>>).map(r => ({ source: String(r.source), campaign: String(r.campaign), content: String(r.content), signups: Number(r.signups), paid: Number(r.paid) }));
}

export const sinceDays = (days: number): Date => new Date(Date.now() - days * 86_400_000);

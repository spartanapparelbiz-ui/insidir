/* Watchlists and in-app alerts (docs/INSIDIR-V3.md §3): a member's named lists of companies and people, which form
 * families alert from each list, and the alert inbox.
 *
 * Alerts (worker, alertsOnce, every minute): a filing alerts a member when it is for a company or a person on one of
 * their lists, of a form family that list alerts on, seen in the last ALERT_WINDOW_MS, and accepted by EDGAR within the
 * last day (so a filing read late, by the backfill or a company refresh, never alerts as new). Once per member and
 * filing. latency_ms = when the alert was made − EDGAR's acceptance time; /status reports it. In-app only. */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { secAlerts, secWatchlistItems, secWatchlists } from "@/lib/db/schema";

export const MAX_LISTS = 20;
export const MAX_ITEMS = 200;
export const ALERT_WINDOW_MS = 30 * 60_000;
/** The form families a list can alert on, and the forms in each (amendments included). */
export const FORM_FAMILIES: Record<string, { label: string; forms: readonly string[] }> = {
  ownership: { label: "Insider filings (Forms 3, 4, 5)", forms: ["3", "4", "5"] },
  "8-K": { label: "8-K current reports", forms: ["8-K"] },
  "10-Q": { label: "10-Q quarterly reports", forms: ["10-Q"] },
  "10-K": { label: "10-K annual reports", forms: ["10-K", "10-KT"] },
  "13D/G": { label: "Schedules 13D and 13G", forms: ["SCHEDULE 13D", "SCHEDULE 13G"] },
};
export const FAMILY_KEYS = Object.keys(FORM_FAMILIES);

export interface ListView { id: number; name: string; forms: string[]; items: Array<{ kind: "company" | "person"; cik: string; label: string }> }

export async function listsFor(db: Db, userId: string): Promise<ListView[]> {
  const lists = await db.select().from(secWatchlists).where(eq(secWatchlists.userId, userId)).orderBy(asc(secWatchlists.createdAt), asc(secWatchlists.id));
  if (!lists.length) return [];
  const items = await db.select().from(secWatchlistItems).where(inArray(secWatchlistItems.watchlistId, lists.map(l => l.id))).orderBy(asc(secWatchlistItems.label));
  return lists.map(l => ({ id: l.id, name: l.name, forms: l.forms, items: items.filter(i => i.watchlistId === l.id).map(i => ({ kind: i.kind, cik: i.cik, label: i.label })) }));
}

/** The member's list with this id, or null (someone else's or gone). */
async function own(db: Db, userId: string, id: number) {
  return (await db.select().from(secWatchlists).where(and(eq(secWatchlists.id, id), eq(secWatchlists.userId, userId))).limit(1))[0] ?? null;
}

export const cleanName = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return s ? s : null;
};
export const cleanForms = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) return null;
  const f = [...new Set(raw.filter((x): x is string => typeof x === "string" && FAMILY_KEYS.includes(x)))];
  return f;
};

export async function createList(db: Db, userId: string, name: string): Promise<{ id: number } | { error: string }> {
  const n = (await db.select({ c: sql<number>`count(*)::int` }).from(secWatchlists).where(eq(secWatchlists.userId, userId)))[0]?.c ?? 0;
  if (n >= MAX_LISTS) return { error: `You have ${MAX_LISTS} watchlists, the most there can be.` };
  const r = await db.insert(secWatchlists).values({ userId, name }).returning({ id: secWatchlists.id });
  return { id: r[0]!.id };
}
export async function updateList(db: Db, userId: string, id: number, set: { name?: string; forms?: string[] }): Promise<boolean> {
  if (!(await own(db, userId, id))) return false;
  await db.update(secWatchlists).set(set).where(eq(secWatchlists.id, id));
  return true;
}
export async function deleteList(db: Db, userId: string, id: number): Promise<boolean> {
  return (await db.delete(secWatchlists).where(and(eq(secWatchlists.id, id), eq(secWatchlists.userId, userId))).returning({ id: secWatchlists.id })).length > 0;
}
export async function addItem(db: Db, userId: string, id: number, item: { kind: "company" | "person"; cik: string; label: string }): Promise<{ ok: true } | { error: string }> {
  if (!(await own(db, userId, id))) return { error: "That watchlist isn't yours." };
  const n = (await db.select({ c: sql<number>`count(*)::int` }).from(secWatchlistItems).where(eq(secWatchlistItems.watchlistId, id)))[0]?.c ?? 0;
  if (n >= MAX_ITEMS) return { error: `A watchlist holds at most ${MAX_ITEMS}.` };
  await db.insert(secWatchlistItems).values({ watchlistId: id, ...item }).onConflictDoNothing();
  return { ok: true };
}
export async function removeItem(db: Db, userId: string, id: number, kind: "company" | "person", cik: string): Promise<boolean> {
  if (!(await own(db, userId, id))) return false;
  await db.delete(secWatchlistItems).where(and(eq(secWatchlistItems.watchlistId, id), eq(secWatchlistItems.kind, kind), eq(secWatchlistItems.cik, cik)));
  return true;
}

/* ---------- alerts ---------- */

const familySql = (col: ReturnType<typeof sql>) => sql`case
  when regexp_replace(${col}, '/A$', '') in ('3','4','5') then 'ownership'
  when regexp_replace(${col}, '/A$', '') = '8-K' then '8-K'
  when regexp_replace(${col}, '/A$', '') = '10-Q' then '10-Q'
  when regexp_replace(${col}, '/A$', '') in ('10-K','10-KT') then '10-K'
  when regexp_replace(${col}, '/A$', '') in ('SCHEDULE 13D','SCHEDULE 13G','SC 13D','SC 13G') then '13D/G'
  else null end`;

/** One run: alerts for every new filing that matches a list. Returns how many were made and their latency. */
export async function alertsOnce(db: Db, now: number): Promise<{ made: number; p50Ms: number | null; maxMs: number | null }> {
  const since = new Date(now - ALERT_WINDOW_MS), fresh = new Date(now - 86_400_000), at = new Date(now);
  // Forms 3, 4 and 5: by the company, or by any reporting owner.
  const own = await db.execute(sql`
    insert into terminal.sec_alerts (user_id, accession, form, title, url, accepted_at, created_at, latency_ms)
    select distinct on (w.user_id, f.accession) w.user_id, f.accession, f.form,
      'Form ' || f.form || ' · ' || coalesce(f.owners->0->>'name', 'Reporting owner') || ' · ' || f.company || coalesce(' (' || f.ticker || ')', ''),
      f.url, f.filed_at, ${at}, greatest(0, extract(epoch from (${at}::timestamptz - f.filed_at)) * 1000)::int
    from terminal.filings f
    join terminal.sec_watchlist_items i on (i.kind = 'company' and i.cik = f.issuer_cik) or (i.kind = 'person' and f.owners @> jsonb_build_array(jsonb_build_object('cik', i.cik)))
    join terminal.sec_watchlists w on w.id = i.watchlist_id and 'ownership' = any(w.forms)
    where f.read_at >= ${since} and f.filed_at >= ${fresh}
    on conflict (user_id, accession) do nothing
    returning latency_ms`);
  // 8-K, 10-Q, 10-K, 13D/G: by the company.
  const other = await db.execute(sql`
    insert into terminal.sec_alerts (user_id, accession, form, title, url, accepted_at, created_at, latency_ms)
    select distinct on (w.user_id, c.accession) w.user_id, c.accession, c.form,
      c.form || ' · ' || coalesce(co.name, 'CIK ' || c.cik) || coalesce(' (' || co.tickers[1] || ')', ''),
      c.url, c.accepted_at, ${at}, case when c.accepted_at is null then null else greatest(0, extract(epoch from (${at}::timestamptz - c.accepted_at)) * 1000)::int end
    from terminal.company_filings c
    left join terminal.companies co on co.cik = c.cik
    join terminal.sec_watchlist_items i on i.kind = 'company' and i.cik = c.cik
    join terminal.sec_watchlists w on w.id = i.watchlist_id and ${familySql(sql`c.form`)} = any(w.forms)
    where c.seen_at >= ${since} and coalesce(c.accepted_at, c.seen_at) >= ${fresh} and ${familySql(sql`c.form`)} <> 'ownership'
    on conflict (user_id, accession) do nothing
    returning latency_ms`);
  const lat = [...own.rows, ...other.rows].map(r => (r as { latency_ms: number | null }).latency_ms).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  return { made: own.rows.length + other.rows.length, p50Ms: lat.length ? lat[Math.floor(lat.length / 2)]! : null, maxMs: lat.length ? lat.at(-1)! : null };
}

export type AlertView = typeof secAlerts.$inferSelect;
export async function inbox(db: Db, userId: string, limit = 100): Promise<AlertView[]> {
  return db.select().from(secAlerts).where(eq(secAlerts.userId, userId)).orderBy(desc(secAlerts.createdAt), desc(secAlerts.id)).limit(limit);
}
export async function unreadCount(db: Db, userId: string): Promise<number> {
  return (await db.select({ c: sql<number>`count(*)::int` }).from(secAlerts).where(and(eq(secAlerts.userId, userId), isNull(secAlerts.readAt))))[0]?.c ?? 0;
}
/** Marks one alert (id) or every alert read. */
export async function markRead(db: Db, userId: string, id: number | null, now = Date.now()): Promise<void> {
  const where = id === null ? and(eq(secAlerts.userId, userId), isNull(secAlerts.readAt)) : and(eq(secAlerts.userId, userId), eq(secAlerts.id, id));
  await db.update(secAlerts).set({ readAt: new Date(now) }).where(where);
}

/** Alert latency over the last day, for /status: median and slowest, in seconds. */
export async function alertLatency(db: Db, now: number): Promise<{ alerts: number; p50s: number | null; p95s: number | null }> {
  const r = await db.execute(sql`select count(*)::int as n, percentile_cont(0.5) within group (order by latency_ms) as p50, percentile_cont(0.95) within group (order by latency_ms) as p95
    from terminal.sec_alerts where created_at > ${new Date(now - 86_400_000)} and latency_ms is not null`);
  const row = (r.rows[0] ?? {}) as { n?: number; p50?: number | null; p95?: number | null };
  const s = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v) / 1000));
  return { alerts: Number(row.n ?? 0), p50s: s(row.p50), p95s: s(row.p95) };
}

/* The Form 4 backfill (docs/INSIDIR-V3.md §3 SEC filings): every Form 4 and 4/A of every issuer, read from EDGAR's daily
 * form index (www.sec.gov/Archives/edgar/daily-index/YYYY/QTRn/form.YYYYMMDD.idx), through the worker's one SecClient
 * (SEC_USER_AGENT, at most 8 requests a second, shared with the live feed).
 *
 *   Days     one terminal.form4_days row per day from FORM4_BACKFILL_FROM (default: a year back) to yesterday, US
 *            Eastern. Newest days first, so recent coverage comes in before old.
 *   A day    its index read once (Form 4 and 4/A, one entry per accession), then each filing EDGAR's live feed hasn't
 *            already given us is read (index.json + the ownership XML: two requests) and stored (lib/stocks/filings.ts).
 *            A filing that fails is retried on later runs; after three failures it is set aside in `failed` so one
 *            broken submission can't hold a day open. A day is done when nothing is pending.
 *   No index Weekends and market holidays have no index (404): a weekend day is done without asking, any other day
 *            once EDGAR has had three days to post it.
 *   Coverage "Every Form 4 filed since <day>": the day after the newest day not yet done (coverageSince). */
import { and, desc, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { form4Days, secSeen } from "@/lib/db/schema";
import { readAndSave } from "./filings";
import type { SecClient } from "./sec";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const BACKFILL_MS = n("FORM4_BACKFILL_MS", 60_000);
/** Filings read per run (two requests each, about 40 seconds at 8 a second when the live feed is quiet). */
export const BACKFILL_PER_RUN = n("FORM4_BACKFILL_PER_RUN", 150);
export const BACKFILL_DAYS = 365;
const MAX_TRIES = 3;
const DAY = 86_400_000;

/** The key each read Form 4 is marked with in terminal.sec_seen (V3 reads every filing again under the wider parser). */
export const seenKey = (accession: string) => `f4v3:${accession}`;

/** Today's date in New York, "YYYY-MM-DD". */
export const etDay = (now: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
const addDays = (day: string, k: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + k * DAY).toISOString().slice(0, 10);
const weekend = (day: string): boolean => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

/** The days the backfill covers, newest first: yesterday (ET) back to `from`. Pure. */
export function backfillDays(now: number, from: string | null): string[] {
  const end = addDays(etDay(now), -1);
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : addDays(end, -(BACKFILL_DAYS - 1));
  const out: string[] = [];
  for (let d = end; d >= start && out.length < 20 * 366; d = addDays(d, -1)) out.push(d);
  return out;
}

export const indexUrl = (day: string): string => {
  const [y, m, d] = day.split("-");
  return `https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${Math.ceil(Number(m) / 3)}/form.${y}${m}${d}.idx`;
};

/** A daily form index → its Form 4 and 4/A filings, once per accession (EDGAR lists a Form 4 under each filer: the
 *  issuer and every reporting owner). Pure. */
export function parseFormIndex(text: string): Array<{ accession: string; cik: string; form: "4" | "4/A" }> {
  const out = new Map<string, { accession: string; cik: string; form: "4" | "4/A" }>();
  for (const raw of text.split(/\r?\n/)) {
    const m = /^(4|4\/A)\s+.*?\s(\d{1,10})\s+(\d{8})\s+edgar\/data\/(\d{1,10})\/(\d{10})-(\d{2})-(\d{6})\.txt\s*$/.exec(raw);
    if (!m) continue;
    const accession = `${m[5]}${m[6]}${m[7]}`;
    if (!out.has(accession)) out.set(accession, { accession, cik: m[4]!, form: m[1] as "4" | "4/A" });
  }
  return [...out.values()];
}

async function seenSet(db: Db, accessions: string[]): Promise<Set<string>> {
  const keys = accessions.map(seenKey), have = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    for (const r of await db.select({ key: secSeen.key }).from(secSeen).where(inArray(secSeen.key, keys.slice(i, i + 1000)))) have.add(r.key);
  }
  return have;
}

export interface BackfillRun { days: number; listed: number; read: number; skipped: number; errors: number; failed: number; requests: number; since: string | null }

/** One run: at most `budget` filings read, newest open days first. */
export async function backfillOnce(db: Db, sec: SecClient, now: number, budget = BACKFILL_PER_RUN, env: Record<string, string | undefined> = process.env): Promise<BackfillRun> {
  const before = sec.stats.requests;
  const days = backfillDays(now, env.FORM4_BACKFILL_FROM ?? null);
  for (let i = 0; i < days.length; i += 500) await db.insert(form4Days).values(days.slice(i, i + 500).map(day => ({ day }))).onConflictDoNothing();
  const open = await db.select().from(form4Days).where(and(isNull(form4Days.doneAt), sql`${form4Days.day} >= ${days.at(-1) ?? "9999"}`)).orderBy(desc(form4Days.day)).limit(10);
  const run: BackfillRun = { days: 0, listed: 0, read: 0, skipped: 0, errors: 0, failed: 0, requests: 0, since: null };
  const today = etDay(now);
  for (const d of open) {
    if (run.read + run.errors >= budget) break;
    let pending = d.pending, listed = d.listed, failed = d.failed;
    if (listed === null) {
      if (weekend(d.day)) { await db.update(form4Days).set({ listed: 0, doneAt: new Date(now), updatedAt: new Date(now) }).where(sql`${form4Days.day} = ${d.day}`); run.days++; continue; }
      const body = await sec.textOrNull(indexUrl(d.day));
      if (body === null) {
        // No index yet: wait for it, unless EDGAR has had three days (a holiday).
        if (addDays(d.day, 3) <= today) await db.update(form4Days).set({ listed: 0, doneAt: new Date(now), updatedAt: new Date(now) }).where(sql`${form4Days.day} = ${d.day}`);
        continue;
      }
      const all = parseFormIndex(body);
      const have = await seenSet(db, all.map(f => f.accession));
      pending = all.filter(f => !have.has(seenKey(f.accession))).map(f => ({ accession: f.accession, cik: f.cik }));
      listed = all.length;
      run.listed += listed;
      run.skipped += all.length - pending.length;
      await db.update(form4Days).set({ listed, pending, updatedAt: new Date(now) }).where(sql`${form4Days.day} = ${d.day}`);
    }
    const left: typeof pending = [];
    for (const f of pending) {
      if (run.read + run.errors >= budget) { left.push(f); continue; }
      try {
        // Read by the date it was filed; the index.json stamp gives the exact time when EDGAR has it.
        await readAndSave(db, sec, f.cik, f.accession, { fallback: Date.parse(`${d.day}T21:00:00Z`) });
        await db.insert(secSeen).values({ key: seenKey(f.accession) }).onConflictDoNothing();
        run.read++;
      } catch {
        run.errors++;
        const tries = (f.tries ?? 0) + 1;
        if (tries >= MAX_TRIES) { failed = [...failed, f.accession]; run.failed++; } else left.push({ ...f, tries });
      }
    }
    await db.update(form4Days).set({ pending: left, failed, updatedAt: new Date(now), ...(left.length ? {} : { doneAt: new Date(now) }) }).where(sql`${form4Days.day} = ${d.day}`);
    run.days++;
  }
  run.requests = sec.stats.requests - before;
  run.since = await coverageSince(db, now, env);
  return run;
}

/** The first day from which every Form 4 to yesterday has been read: the day after the newest day still open. null
 *  until yesterday itself is done. */
export async function coverageSince(db: Db, now: number, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  const days = backfillDays(now, env.FORM4_BACKFILL_FROM ?? null);
  const first = days.at(-1), last = days[0];
  if (!first || !last) return null;
  const r = await db.select({ day: form4Days.day }).from(form4Days)
    .where(and(isNull(form4Days.doneAt), sql`${form4Days.day} between ${first} and ${last}`)).orderBy(desc(form4Days.day)).limit(1);
  const known = await db.select({ c: sql<number>`count(*)::int` }).from(form4Days).where(sql`${form4Days.day} between ${first} and ${last} and ${form4Days.doneAt} is not null`);
  if (!known[0]?.c) return null;
  if (!r[0]) return first;
  return r[0].day >= last ? null : addDays(r[0].day, 1);
}

/** Days past their three tries' worth of failures, for /admin and the PR notes. */
export async function failedFilings(db: Db, limit = 50): Promise<Array<{ day: string; failed: string[] }>> {
  return (await db.select({ day: form4Days.day, failed: form4Days.failed }).from(form4Days).where(sql`jsonb_array_length(${form4Days.failed}) > 0`).orderBy(desc(form4Days.day)).limit(limit))
    .map(r => ({ day: r.day, failed: r.failed }));
}

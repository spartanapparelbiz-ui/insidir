/* The filings poller (docs/RESEARCH-DESK.md §5.1): the only code that reads EDGAR's current-filings feeds for this
 * feature. One run:
 *
 *   1. Form 4 feed and 8-K feed, page by page until a page holds nothing new. "New" is one indexed lookup of the
 *      page's accessions in terminal.sec_filings, so a filing is never fetched twice.
 *   2. 8-K: stored straight from the feed entry (items are in it): zero extra requests.
 *      Form 4: two requests (index.json, the XML), cut to the compact payload.
 *   3. One multi-row insert, ON CONFLICT (accession) DO NOTHING: a second worker or a cron overlap can't duplicate.
 *   4. The Stream rules for the companies that just filed a Form 4 (lib/filings/rules.ts), upserted by key.
 *
 * Nothing is written per member: the stored filing is the alert, and each member's browser filters the shared feed
 * by their watchlists. The run is stateless, so it works in the long-running worker (every FILINGS_MS) or as a
 * serverless cron hit (app/api/cron/filings/route.ts). */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { filingAnomalies, issuerTickers, secFilings } from "@/lib/db/schema";
import { companyName, filingIndexUrl, parseAtom, type AtomFiling } from "@/lib/stocks/form4";
import { readOwnership } from "@/lib/stocks/history";
import type { SecClient } from "@/lib/stocks/sec";
import { easternDate, form4Payload, parse8kAtom, type EightKEntry } from "./parse";
import { clustersOf, RULE_VERSION, velocityBaseline, velocityOf, VELOCITY_QUIET_DAYS, weekOf, whaleOf, type AnomalyDraft } from "./rules";
import type { FilingPayload, FilingRow, FormType } from "./types";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const FILINGS_MS = n("FILINGS_MS", 60_000);
/** Form 4s read per run (two requests each at 125 ms ≈ 40 s); the rest wait for the next run. */
export const FORM4_PER_RUN = n("FILINGS_FORM4_PER_RUN", 150);
export const FEED_PAGES = 5;
const DAY = 86_400_000;

const feedUrl = (type: "4" | "8-K", start: number) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${type}&output=atom&count=100${start ? `&start=${start}` : ""}`;

async function known(db: Db, accessions: string[]): Promise<Set<string>> {
  if (!accessions.length) return new Set();
  const rows = await db.select({ a: secFilings.accession }).from(secFilings).where(inArray(secFilings.accession, accessions));
  return new Set(rows.map(r => r.a));
}

/** New entries from one feed: pages until a page has nothing unseen (or `cap` entries are queued). */
async function fresh<T extends { accession: string }>(db: Db, sec: SecClient, type: "4" | "8-K", parse: (xml: string) => T[], cap: number): Promise<T[]> {
  const out: T[] = [], queued = new Set<string>();
  for (let page = 0; page < FEED_PAGES && out.length < cap; page++) {
    const batch = parse(await sec.text(feedUrl(type, page * 100))).filter(f => !queued.has(f.accession));
    if (!batch.length) break;
    const have = await known(db, batch.map(f => f.accession));
    const unseen = batch.filter(f => !have.has(f.accession));
    for (const f of unseen) { queued.add(f.accession); out.push(f); }
    if (!unseen.length) break;
  }
  return out.slice(0, cap);
}

type Insert = typeof secFilings.$inferInsert;

async function tickersFor(db: Db, ciks: string[]): Promise<Map<string, string>> {
  if (!ciks.length) return new Map();
  const rows = await db.select({ t: issuerTickers.ticker, c: issuerTickers.cik }).from(issuerTickers).where(inArray(issuerTickers.cik, [...new Set(ciks)]));
  const out = new Map<string, string>();
  // Several share classes per company: the shortest ticker is the common one (BRK-A vs BRK-B both 5; first wins).
  for (const r of rows.sort((a, b) => a.t.length - b.t.length || a.t.localeCompare(b.t))) if (!out.has(r.c)) out.set(r.c, r.t);
  return out;
}

function eightKRow(e: EightKEntry, ticker: string | null): Insert {
  return { accession: e.accession, form: e.form, issuerCik: e.cik, ticker, company: companyName(e.company), acceptedAt: new Date(e.acceptedAt),
    filedOn: e.filedOn, url: e.url, payload: { kind: "8-K", items: e.items } };
}

async function form4Row(sec: SecClient, f: AtomFiling): Promise<Insert> {
  const acceptedAt = f.publishedAt ?? Date.now();
  const got = await readOwnership(sec, f.indexBase);
  const form: FormType = f.formType === "4/A" ? "4/A" : "4";
  if (!got) {
    // No ownership XML: stored (so it is never fetched again) and never shown.
    return { accession: f.accession, form, issuerCik: String(Number(f.filerCik)), ticker: null, company: "Unknown issuer", acceptedAt: new Date(acceptedAt),
      filedOn: easternDate(acceptedAt), url: filingIndexUrl(f.filerCik, f.accession), payload: { kind: "4", owners: [], lines: [], codes: [], derivativeLines: 0, unparsed: true } };
  }
  const o = got.ownership, cik = String(Number(o.issuerCik));
  return { accession: f.accession, form, issuerCik: cik, ticker: o.ticker, company: companyName(o.issuerName), acceptedAt: new Date(acceptedAt),
    filedOn: easternDate(acceptedAt), url: filingIndexUrl(cik, f.accession), payload: form4Payload(o) };
}

export const toRow = (r: typeof secFilings.$inferSelect): FilingRow => ({
  id: r.id, accession: r.accession, form: r.form, cik: r.issuerCik, ticker: r.ticker, company: r.company,
  acceptedAt: r.acceptedAt.getTime(), detectedAt: r.detectedAt.getTime(), filedOn: r.filedOn, url: r.url, payload: r.payload as FilingPayload,
});

async function upsertAnomalies(db: Db, drafts: readonly AnomalyDraft[]): Promise<number> {
  if (!drafts.length) return 0;
  const rows = await db.insert(filingAnomalies).values(drafts.map(d => ({ key: d.key, kind: d.kind, issuerCik: d.cik, ticker: d.ticker, company: d.company,
    windowStart: d.windowStart, windowEnd: d.windowEnd, total: d.total, facts: d.facts, ruleVersion: RULE_VERSION })))
    // A cluster that gains an owner group updates in place; its detection time stays the first match's.
    .onConflictDoUpdate({ target: filingAnomalies.key, set: { facts: sql`excluded.facts`, total: sql`excluded.total`, windowEnd: sql`excluded.window_end`, updatedAt: sql`now()` },
      setWhere: sql`${filingAnomalies.facts} is distinct from excluded.facts` })
    .returning({ id: filingAnomalies.id });
  return rows.length;
}

/** The Stream rules for companies that just filed Form 4s. Reads only those companies' rows, by index. */
export async function detect(db: Db, inserted: readonly FilingRow[], now: number): Promise<number> {
  const f4s = inserted.filter(f => f.form === "4" || f.form === "4/A");
  if (!f4s.length) return 0;
  const drafts: AnomalyDraft[] = [];
  for (const f of f4s) { const w = whaleOf(f); if (w) drafts.push(w); }

  // Cluster: every original Form 4 at the company filed since the earliest week a new purchase falls in.
  const byCik = new Map<string, FilingRow[]>();
  for (const f of f4s) byCik.set(f.cik, [...(byCik.get(f.cik) ?? []), f]);
  for (const [cik, list] of byCik) {
    const weeks = list.flatMap(f => (f.payload.kind === "4" ? f.payload.lines.filter(l => l.code === "P" && l.ad === "A" && l.date).map(l => weekOf(l.date!)) : []));
    if (!weeks.length) continue;
    const from = weeks.sort()[0]!;
    const rows = (await db.select().from(secFilings).where(and(eq(secFilings.issuerCik, cik), eq(secFilings.form, "4"), gte(secFilings.filedOn, from)))).map(toRow);
    const touched = new Set(weeks);
    drafts.push(...clustersOf(rows).filter(c => touched.has(c.windowStart)));
  }

  // Velocity: a count over the trailing week and the baseline, per company (two indexed counts).
  const [oldest] = await db.select({ at: sql<string | null>`min(${secFilings.filedOn})` }).from(secFilings);
  const since = oldest?.at ? Date.parse(`${oldest.at}T00:00:00Z`) : now;
  const base = velocityBaseline(now, since);
  if (base.weeks > 0) {
    for (const [cik, list] of byCik) {
      const window = await db.select({ payload: secFilings.payload }).from(secFilings)
        .where(and(eq(secFilings.issuerCik, cik), inArray(secFilings.form, ["4", "4/A"]), gte(secFilings.acceptedAt, new Date(now - 7 * DAY))));
      if (window.length < 5) continue;
      const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(secFilings)
        .where(and(eq(secFilings.issuerCik, cik), inArray(secFilings.form, ["4", "4/A"]), gte(secFilings.acceptedAt, new Date(base.from)), lt(secFilings.acceptedAt, new Date(base.to))));
      const sample = list[0]!;
      const v = velocityOf({ cik, ticker: list.find(f => f.ticker)?.ticker ?? null, company: sample.company, now, collectingSince: since, baselineCount: b?.n ?? 0,
        window: window.map(w => ({ codes: (w.payload as FilingPayload).kind === "4" ? (w.payload as { codes: string[] }).codes : [] })) });
      if (!v) continue;
      const recent = await db.select({ id: filingAnomalies.id }).from(filingAnomalies)
        .where(and(eq(filingAnomalies.issuerCik, cik), eq(filingAnomalies.kind, "velocity"), gte(filingAnomalies.detectedAt, new Date(now - VELOCITY_QUIET_DAYS * DAY)))).limit(1);
      if (!recent.length) drafts.push(v);
    }
  }
  return upsertAnomalies(db, drafts);
}

export interface FilingsRun { form4: number; eightK: number; anomalies: number; errors: number; lagMs: number | null }

/** One poll of both feeds. Safe to run from any number of places: inserts are idempotent. */
export async function filingsOnce(db: Db, sec: SecClient, now = Date.now()): Promise<FilingsRun> {
  let errors = 0;
  const rows: Insert[] = [];

  const eightKs = await fresh(db, sec, "8-K", parse8kAtom, 500).catch(() => { errors++; return [] as EightKEntry[]; });
  const tick = await tickersFor(db, eightKs.map(e => e.cik));
  for (const e of eightKs) rows.push(eightKRow(e, tick.get(e.cik) ?? null));

  const form4s = await fresh(db, sec, "4", parseAtom, FORM4_PER_RUN).catch(() => { errors++; return [] as AtomFiling[]; });
  for (const f of form4s) {
    try { rows.push(await form4Row(sec, f)); } catch { errors++; } // a network failure leaves it unseen: next run retries
  }
  // Form 4s whose XML has no ticker: the directory's.
  const missing = await tickersFor(db, rows.filter(r => !r.ticker).map(r => r.issuerCik));
  for (const r of rows) if (!r.ticker) r.ticker = missing.get(r.issuerCik) ?? null;

  const inserted: FilingRow[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const got = await db.insert(secFilings).values(rows.slice(i, i + 200)).onConflictDoNothing({ target: secFilings.accession }).returning();
    inserted.push(...got.map(toRow));
  }
  const anomalies = await detect(db, inserted.filter(r => !(r.payload.kind === "4" && r.payload.unparsed)), now).catch(() => { errors++; return 0; });
  const lags = inserted.map(r => r.detectedAt - r.acceptedAt).filter(l => l >= 0).sort((a, b) => a - b);
  return {
    form4: inserted.filter(r => r.form === "4" || r.form === "4/A").length, eightK: inserted.filter(r => r.form === "8-K" || r.form === "8-K/A").length,
    anomalies, errors, lagMs: lags.length ? lags[Math.min(lags.length - 1, Math.floor(lags.length * 0.95))]! : null,
  };
}

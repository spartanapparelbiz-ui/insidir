/* Reads and writes behind /api/filings (docs/RESEARCH-DESK.md). Cost rules:
 *   - The shared feed is one query per 10 s per server instance however many members poll (memo), served by slicing.
 *   - Per-member reads happen on page load only (watched filings since a time, one indexed query), never per poll.
 *   - Member writes are one row each: a watchlist, a company's journal, the positions document, the read cursor. */
import { and, between, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { filingAnomalies, issuerTickers, researchJournal, researchMembers, secFilings, userWatchlists, workerHeartbeats } from "@/lib/db/schema";
import { memo } from "@/lib/memo";
import { toRow } from "./ingest";
import { TAPE_BUCKET } from "./filter";
export { LIMITS } from "./limits";
import type { AnomalyRow, FilingRow, Journal, JournalNote, MemberState, Position, StatusEvent, ThesisStatus, Watchlist } from "./types";

export const FEED_CACHE_MS = 10_000;
export const FEED_SIZE = 500;
const shown = sql`not (${secFilings.payload} ? 'unparsed')`;

/** The newest FEED_SIZE filings, shared by every member for FEED_CACHE_MS. */
export const latestFilings = (db: Db): Promise<FilingRow[]> => memo("filings:latest", FEED_CACHE_MS, async () =>
  (await db.select().from(secFilings).where(shown).orderBy(desc(secFilings.id)).limit(FEED_SIZE)).map(toRow));

/** Filings after a cursor, from the shared cache. `gap` when the cursor is older than the cache holds: the client then
 *  reloads its watched companies with watchedSince. */
export interface EdgarHealth { lastRunAt: number | null; lastOkAt: number | null; ok: boolean | null; lagP95Sec: number | null }

/** The poller's own heartbeat (worker job or cron run "filings"): when EDGAR was last read, and whether that worked.
 *  Shared with the feed's cache, so the terminal's EDGAR light costs no extra read per member. */
export const edgarHealth = (db: Db): Promise<EdgarHealth> => memo("filings:health", FEED_CACHE_MS, async () => {
  const [h] = await db.select().from(workerHeartbeats).where(eq(workerHeartbeats.job, "filings"));
  const lag = Number(h?.stats?.lagP95Sec);
  return { lastRunAt: h?.lastRunAt.getTime() ?? null, lastOkAt: h?.lastOkAt?.getTime() ?? null, ok: h?.ok ?? null, lagP95Sec: Number.isFinite(lag) ? lag : null };
});

export async function feedAfter(db: Db, after: number): Promise<{ rows: FilingRow[]; cursor: number; gap: boolean; edgar: EdgarHealth }> {
  const [all, edgar] = await Promise.all([latestFilings(db), edgarHealth(db)]);
  const cursor = all[0]?.id ?? after;
  const oldest = all.at(-1)?.id ?? 0;
  // A first poll only learns the cursor: the page has already loaded its watched companies with watchedSince.
  if (after <= 0) return { rows: [], cursor, gap: false, edgar };
  if (after > 0 && all.length === FEED_SIZE && after < oldest - 1) return { rows: [], cursor, gap: true, edgar };
  return { rows: all.filter(r => r.id > after), cursor, gap: false, edgar };
}

/** One page of the tape: every shown filing whose id falls in bucket `b` (ids b×TAPE_BUCKET … +TAPE_BUCKET−1),
 *  newest first. Filings are written once and never change, so a bucket below the newest is immutable: it is cached
 *  for 10 minutes here and for a day in the browser, and every member scrolling back reads the same cached pages. */
export const tapeBucket = (db: Db, b: number, newest: boolean): Promise<FilingRow[]> => memo(`filings:tape:${b}`, newest ? FEED_CACHE_MS : 600_000, async () =>
  (await db.select().from(secFilings).where(and(between(secFilings.id, b * TAPE_BUCKET, b * TAPE_BUCKET + TAPE_BUCKET - 1), shown)).orderBy(desc(secFilings.id))).map(toRow));

/** A member's watched companies' filings since a time (page load only; index sec_filings_issuer_idx). */
export async function watchedSince(db: Db, ciks: readonly string[], since: number, limit = 500): Promise<FilingRow[]> {
  if (!ciks.length) return [];
  return (await db.select().from(secFilings).where(and(inArray(secFilings.issuerCik, [...ciks]), gte(secFilings.acceptedAt, new Date(since)), shown))
    .orderBy(desc(secFilings.acceptedAt)).limit(limit)).map(toRow);
}

const anomalyRow = (r: typeof filingAnomalies.$inferSelect): AnomalyRow => ({
  id: r.id, key: r.key, kind: r.kind, cik: r.issuerCik, ticker: r.ticker, company: r.company, windowStart: r.windowStart, windowEnd: r.windowEnd,
  total: r.total, facts: r.facts, ruleVersion: r.ruleVersion, detectedAt: r.detectedAt.getTime(),
});

/** The Stream: newest 300 matches, shared for 30 s. Filtering and sorting happen in the browser. */
export const streamRows = (db: Db): Promise<AnomalyRow[]> => memo("filings:stream", 30_000, async () =>
  (await db.select().from(filingAnomalies).orderBy(desc(filingAnomalies.detectedAt)).limit(300)).map(anomalyRow));

/** One company: its last 300 filings and its Stream matches, shared for 60 s. */
export const companyRows = (db: Db, cik: string): Promise<{ filings: FilingRow[]; anomalies: AnomalyRow[] }> => memo(`filings:co:${cik}`, 60_000, async () => {
  const [f, a] = await Promise.all([
    db.select().from(secFilings).where(and(eq(secFilings.issuerCik, cik), shown)).orderBy(desc(secFilings.acceptedAt)).limit(300),
    db.select().from(filingAnomalies).where(eq(filingAnomalies.issuerCik, cik)).orderBy(desc(filingAnomalies.detectedAt)).limit(50),
  ]);
  return { filings: f.map(toRow), anomalies: a.map(anomalyRow) };
});

/** The whole ticker directory as [ticker, cik, title] triples (~10k, a few hundred KB before compression), shared 1 h. */
export const tickerList = (db: Db): Promise<Array<[string, string, string]>> => memo("filings:tickers", 3_600_000, async () =>
  (await db.select().from(issuerTickers).orderBy(issuerTickers.ticker)).map(r => [r.ticker, r.cik, r.title] as [string, string, string]));

/** A company page's key: a ticker from the SEC directory, or a bare CIK (companies without a listed ticker are
 *  shown by CIK with the name they filed under). */
export async function resolveTicker(db: Db, key: string): Promise<{ ticker: string; cik: string; title: string } | null> {
  const k = key.trim().toUpperCase();
  if (/^\d{1,10}$/.test(k)) {
    const cik = String(Number(k));
    const [t] = await db.select().from(issuerTickers).where(eq(issuerTickers.cik, cik)).orderBy(sql`length(${issuerTickers.ticker})`, issuerTickers.ticker).limit(1);
    if (t) return t;
    const [f] = await db.select({ company: secFilings.company }).from(secFilings).where(eq(secFilings.issuerCik, cik)).orderBy(desc(secFilings.acceptedAt)).limit(1);
    return f ? { ticker: cik, cik, title: f.company } : null;
  }
  const [r] = await db.select().from(issuerTickers).where(eq(issuerTickers.ticker, k));
  return r ?? null;
}

/* ---------- member state ---------- */

export async function memberState(db: Db, userId: string): Promise<MemberState> {
  const [lists, [me], journals] = await Promise.all([
    db.select().from(userWatchlists).where(eq(userWatchlists.userId, userId)).orderBy(userWatchlists.position, userWatchlists.id),
    db.select().from(researchMembers).where(eq(researchMembers.userId, userId)),
    db.select({ cik: researchJournal.issuerCik, ticker: researchJournal.ticker, status: researchJournal.status, notes: sql<number>`jsonb_array_length(${researchJournal.notes})::int`,
      updatedAt: researchJournal.updatedAt }).from(researchJournal).where(eq(researchJournal.userId, userId)).orderBy(desc(researchJournal.updatedAt)),
  ]);
  return {
    watchlists: lists.map(l => ({ id: l.id, name: l.name, items: l.items })),
    seenId: me?.seenId ?? 0, ackVersion: me?.ackVersion ?? null, positions: me?.positions ?? [], positionsVersion: me?.positionsVersion ?? 0,
    journals: journals.map(j => ({ cik: j.cik, ticker: j.ticker, status: j.status, notes: j.notes, updatedAt: j.updatedAt.getTime() })),
  };
}

/** Replaces the member's lists with `lists` (ids kept where given): one transaction, one row per list. */
export async function saveWatchlists(db: Db, userId: string, lists: ReadonlyArray<Omit<Watchlist, "id"> & { id?: number }>): Promise<Watchlist[]> {
  return db.transaction(async tx => {
    const keep = lists.map(l => l.id).filter((id): id is number => typeof id === "number");
    const existing = await tx.select({ id: userWatchlists.id }).from(userWatchlists).where(eq(userWatchlists.userId, userId));
    const drop = existing.map(e => e.id).filter(id => !keep.includes(id));
    if (drop.length) await tx.delete(userWatchlists).where(and(eq(userWatchlists.userId, userId), inArray(userWatchlists.id, drop)));
    const out: Watchlist[] = [];
    for (const [position, l] of lists.entries()) {
      if (l.id !== undefined && existing.some(e => e.id === l.id)) {
        await tx.update(userWatchlists).set({ name: l.name, items: l.items, position, updatedAt: new Date() }).where(and(eq(userWatchlists.id, l.id), eq(userWatchlists.userId, userId)));
        out.push({ id: l.id, name: l.name, items: l.items });
      } else {
        const [r] = await tx.insert(userWatchlists).values({ userId, name: l.name, items: l.items, position }).returning({ id: userWatchlists.id });
        out.push({ id: r!.id, name: l.name, items: l.items });
      }
    }
    return out;
  });
}

export async function journalFor(db: Db, userId: string, cik: string): Promise<Journal | null> {
  const [r] = await db.select().from(researchJournal).where(and(eq(researchJournal.userId, userId), eq(researchJournal.issuerCik, cik)));
  return r ? { cik: r.issuerCik, ticker: r.ticker, status: r.status, history: r.history, notes: r.notes, version: r.version, updatedAt: r.updatedAt.getTime() } : null;
}

/** Saves a company's journal if `version` is the stored one (0 for a new journal). A status change appends to the
 *  history on the server, so the history can't be rewritten by a client. Returns null on a stale version. */
export async function saveJournal(db: Db, userId: string, cik: string, ticker: string, input: { status: ThesisStatus | null; reason: string | null; notes: JournalNote[]; version: number },
  now = Date.now()): Promise<Journal | null> {
  return db.transaction(async tx => {
    const [cur] = await tx.select().from(researchJournal).where(and(eq(researchJournal.userId, userId), eq(researchJournal.issuerCik, cik))).for("update");
    if ((cur?.version ?? 0) !== input.version) return null;
    const history: StatusEvent[] = [...(cur?.history ?? [])];
    if ((cur?.status ?? null) !== input.status) history.push({ from: cur?.status ?? null, to: input.status, reason: input.status === "passed" ? input.reason : null, at: now });
    const values = { ticker, status: input.status, history, notes: input.notes, version: input.version + 1, updatedAt: new Date(now) };
    if (cur) await tx.update(researchJournal).set(values).where(and(eq(researchJournal.userId, userId), eq(researchJournal.issuerCik, cik)));
    else await tx.insert(researchJournal).values({ userId, issuerCik: cik, ...values });
    return { cik, ...values, updatedAt: now };
  });
}

const ensureMember = (db: Db, userId: string) => db.insert(researchMembers).values({ userId }).onConflictDoNothing();

/** Moves the read cursor forward only. */
export async function markSeen(db: Db, userId: string, id: number): Promise<void> {
  await ensureMember(db, userId);
  await db.update(researchMembers).set({ seenId: sql`greatest(${researchMembers.seenId}, ${id})`, updatedAt: new Date() }).where(eq(researchMembers.userId, userId));
}

export async function acknowledge(db: Db, userId: string, version: number): Promise<void> {
  await ensureMember(db, userId);
  await db.update(researchMembers).set({ ackVersion: version, ackAt: new Date(), updatedAt: new Date() }).where(eq(researchMembers.userId, userId));
}

/** Replaces the positions document when `version` matches; returns the new version, or null when stale. */
export async function savePositions(db: Db, userId: string, positions: Position[], version: number): Promise<number | null> {
  await ensureMember(db, userId);
  const rows = await db.update(researchMembers).set({ positions, positionsVersion: version + 1, updatedAt: new Date() })
    .where(and(eq(researchMembers.userId, userId), eq(researchMembers.positionsVersion, version))).returning({ v: researchMembers.positionsVersion });
  return rows[0]?.v ?? null;
}

/** Everything the member wrote, for "Download my research" (docs/RESEARCH-DESK.md §10). */
export async function exportAll(db: Db, userId: string): Promise<Record<string, unknown>> {
  const [state, journals] = await Promise.all([memberState(db, userId), db.select().from(researchJournal).where(eq(researchJournal.userId, userId))]);
  return {
    exportedAt: new Date().toISOString(), watchlists: state.watchlists, positions: state.positions,
    journals: journals.map(j => ({ cik: j.issuerCik, ticker: j.ticker, status: j.status, history: j.history, notes: j.notes, updatedAt: j.updatedAt.toISOString() })),
  };
}

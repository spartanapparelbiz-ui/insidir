/* The research journal (docs/INSIDIR-V3.md §3): a member's status on a company (Researching, Watching or Passed) and a
 * private note, shown beside the company's filings and listed on /journal. Private to the member: never shown to anyone
 * else, never indexed, deleted with the account (users ON DELETE CASCADE). */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";

export const STATUSES = [
  { key: "researching", label: "Researching" },
  { key: "watching", label: "Watching" },
  { key: "passed", label: "Passed" },
] as const;
export type Status = (typeof STATUSES)[number]["key"];
export const NOTE_MAX = 5000;

export const isStatus = (v: unknown): v is Status => STATUSES.some(s => s.key === v);
export const cleanNote = (v: unknown): string | null => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, NOTE_MAX) : null);
const cikOf = (v: unknown): string | null => { const s = String(v ?? ""); return /^\d{1,10}$/.test(s) && Number(s) > 0 ? String(Number(s)) : null; };
export const parseEntry = (b: { cik?: unknown; status?: unknown; note?: unknown } | null): { cik: string; status: Status; note: string } | null => {
  const cik = cikOf(b?.cik), note = cleanNote(b?.note ?? "");
  return cik && isStatus(b?.status) && note !== null ? { cik, status: b!.status as Status, note } : null;
};

export type Entry = typeof journalEntries.$inferSelect;

export async function entryFor(db: Db, userId: string, cik: string): Promise<Entry | null> {
  return (await db.select().from(journalEntries).where(and(eq(journalEntries.userId, userId), eq(journalEntries.cik, cik))).limit(1))[0] ?? null;
}
export async function saveEntry(db: Db, userId: string, e: { cik: string; status: Status; note: string }, now = Date.now()): Promise<void> {
  await db.insert(journalEntries).values({ userId, ...e, updatedAt: new Date(now) })
    .onConflictDoUpdate({ target: [journalEntries.userId, journalEntries.cik], set: { status: e.status, note: e.note, updatedAt: new Date(now) } });
}
export async function deleteEntry(db: Db, userId: string, cik: string): Promise<void> {
  await db.delete(journalEntries).where(and(eq(journalEntries.userId, userId), eq(journalEntries.cik, cik)));
}

/** Every entry, with the company's name and ticker, by status or by last edit. */
export async function journalFor(db: Db, userId: string, sort: "status" | "recent"): Promise<Array<Entry & { company: string; ticker: string | null }>> {
  const order = sort === "status"
    ? [sql`array_position(array['researching','watching','passed'], ${journalEntries.status})`, desc(journalEntries.updatedAt)]
    : [desc(journalEntries.updatedAt), asc(journalEntries.cik)];
  const r = await db.select({ e: journalEntries, company: sql<string>`coalesce(c.name, 'CIK ' || ${journalEntries.cik})`, ticker: sql<string | null>`c.tickers[1]` })
    .from(journalEntries).leftJoin(sql`terminal.companies c`, sql`c.cik = ${journalEntries.cik}`)
    .where(eq(journalEntries.userId, userId)).orderBy(...order);
  return r.map(x => ({ ...x.e, company: x.company, ticker: x.ticker }));
}

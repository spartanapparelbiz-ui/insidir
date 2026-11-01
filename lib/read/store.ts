/* The Read, kept and served (server only).
 *   Cache       each market is built at most once a minute (READ_TTL_MS) and its analyst line written at most once a
 *               minute; everyone reading it in that minute shares both.
 *   AI cap      a member's analyst lines cost at most READ_AI_DAILY_USD a day (default $0.10, by UTC day); over it, the
 *               template line. Visitors never get a model line: theirs is blurred.
 *   Free Read   a visitor (or a signed-in account without Insidir) gets FREE_READS; members unlimited.
 *   Kept        every Read is saved (terminal.reads) so /read/<id> shows it as it was, and its share image. */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { readAiUsage, readOffers, reads } from "@/lib/db/schema";
import { memo } from "@/lib/memo";
import { buildRead, type Clients } from "./build";
import { writeLine, type Line } from "./line";
import { readFacts, readHasMoney } from "./math";
import type { ReadData, Venue } from "./types";

export const READ_TTL_MS = 60_000;
export const FREE_READS = 1;
export const aiDailyCapUsd = (): number => Number(process.env.READ_AI_DAILY_USD ?? 0.1);
const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function aiSpent(db: Db, who: string, now: number): Promise<number> {
  const r = await db.select({ usd: readAiUsage.usd }).from(readAiUsage).where(and(eq(readAiUsage.who, who), eq(readAiUsage.day, dayOf(now))));
  return Number(r[0]?.usd ?? 0);
}
export async function addAiSpend(db: Db, who: string, usd: number, now: number): Promise<void> {
  await db.insert(readAiUsage).values({ who, day: dayOf(now), usd, calls: 1 })
    .onConflictDoUpdate({ target: [readAiUsage.who, readAiUsage.day], set: { usd: sql`${readAiUsage.usd} + ${usd}`, calls: sql`${readAiUsage.calls} + 1` } });
}

/** The market, built at most once a minute. */
export function cachedRead(db: Db, clients: Clients, venue: Venue, id: string, now: number): Promise<Omit<ReadData, "line">> {
  return memo(`read:${venue}:${id}`, READ_TTL_MS, () => buildRead(db, clients, venue, id, now));
}

/** The analyst line for a member: shared for a minute per market; written by the model only while they're under the cap. */
export function lineFor(db: Db, data: Omit<ReadData, "line">, userId: string, now: number, f?: typeof fetch): Promise<Line> {
  return memo(`readline:${data.key}`, READ_TTL_MS, async () => {
    const allowModel = (await aiSpent(db, userId, now)) < aiDailyCapUsd();
    const line = await writeLine(readFacts(data), { allowModel, f });
    if (line.costUsd > 0) await addAiSpend(db, userId, line.costUsd, now);
    return line;
  });
}

const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newReadId(): string {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, x => ALPHA[x % ALPHA.length]).join("");
}

export interface StoredRead { id: string; userId: string | null; visitorId: string | null; input: string; data: ReadData; ms: number | null; createdAt: number }
const rowOf = (r: typeof reads.$inferSelect): StoredRead => ({ id: r.id, userId: r.userId, visitorId: r.visitorId, input: r.input, data: r.data as unknown as ReadData, ms: r.ms, createdAt: r.createdAt.getTime() });

/** Saves a Read. It counts toward the free Read only when it shows proven money or big bets (readHasMoney). */
export async function saveRead(db: Db, r: { userId: string | null; visitorId: string | null; input: StoredRead["input"]; data: ReadData; ms: number }, now: number): Promise<string> {
  const id = newReadId();
  await db.insert(reads).values({ id, userId: r.userId, visitorId: r.visitorId, input: r.input as "link", marketKey: r.data.key, data: r.data as unknown as Record<string, unknown>, ms: r.ms, counted: readHasMoney(r.data), createdAt: new Date(now) });
  return id;
}

export async function getRead(db: Db, id: string): Promise<StoredRead | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const r = (await db.select().from(reads).where(eq(reads.id, id)).limit(1))[0];
  return r ? rowOf(r) : null;
}

/** A member's line, written the first time they open a Read that was saved without one (a visitor's, before they paid). */
export async function setLine(db: Db, id: string, line: ReadData["line"]): Promise<void> {
  await db.execute(sql`update terminal.reads set data = jsonb_set(data, '{line}', ${JSON.stringify(line)}::jsonb) where id = ${id}`);
}

/** A Read someone ran as a visitor becomes theirs once they're signed in on the same browser (their Your markets). */
export async function claimRead(db: Db, id: string, userId: string, visitorId: string): Promise<void> {
  await db.execute(sql`update terminal.reads set user_id = ${userId} where id = ${id} and user_id is null and visitor_id = ${visitorId}`);
}

export async function readsOf(db: Db, userId: string, limit = 20): Promise<StoredRead[]> {
  return (await db.select().from(reads).where(eq(reads.userId, userId)).orderBy(desc(reads.createdAt)).limit(limit)).map(rowOf);
}

/** Reads this visitor (or free account) has run that count: ones with proven money or big bets. */
export async function readsUsed(db: Db, who: { userId: string | null; visitorId: string | null }): Promise<number> {
  const conds = [who.userId ? sql`user_id = ${who.userId}` : null, who.visitorId ? sql`visitor_id = ${who.visitorId}` : null].filter(Boolean) as ReturnType<typeof sql>[];
  if (!conds.length) return 0;
  const r = await db.execute(sql`select count(*)::int as n from terminal.reads where counted and (${sql.join(conds, sql` or `)})`);
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

/** How long the markets a "Which one?" offered stay open to pick. */
export const READ_OFFER_MS = 30 * 60_000;
const whoKey = (who: { userId: string | null; visitorId: string | null }) => (who.userId ? `u:${who.userId}` : who.visitorId ? `v:${who.visitorId}` : null);

/** Remembers the markets just offered to a visitor or free account ("p:<id>" / "k:<ticker>" and "<venue>:<id>"). */
export async function saveOffer(db: Db, who: { userId: string | null; visitorId: string | null }, keys: readonly string[], now: number): Promise<void> {
  const k = whoKey(who);
  if (k && keys.length) await db.insert(readOffers).values({ who: k, keys: [...keys], createdAt: new Date(now) });
}

/** Whether this market was offered to them in a "Which one?" in the last READ_OFFER_MS. */
export async function wasOffered(db: Db, who: { userId: string | null; visitorId: string | null }, key: string, now: number): Promise<boolean> {
  const k = whoKey(who);
  if (!k) return false;
  const r = await db.execute(sql`select 1 from terminal.read_offers where who = ${k} and ${key} = any(keys) and created_at > ${new Date(now - READ_OFFER_MS)} limit 1`);
  return r.rows.length > 0;
}

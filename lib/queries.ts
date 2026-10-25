/* Reads for the pages. Every number on the site comes from here (the database); a page hides a section when its
 * number isn't there rather than filling it with a placeholder. Server-only. */
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { opportunities, pairs, receipts, whaleTrades, markets, matchOverrides } from "./db/schema";
import type { StoredOpp } from "./feed";
import type { MarketPair, Opportunity, VMarket, WhaleTrade } from "./types";

/** How far back the free (delayed) feed and the landing page's "today" numbers look. */
export const RECENT_HOURS = 24;

const safe = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => {
  if (!hasDatabase()) return fallback;
  try { return await run(); } catch (e) { console.error("query failed:", e instanceof Error ? e.message : e); return fallback; }
};

/** Active opportunities plus those first seen in the last day (the free feed shows them as they were then),
 *  each with its live state and its snapshot from first detection. */
export const storedOpps = (): Promise<StoredOpp[]> => safe([], async () => {
  const db = getDb();
  const since = new Date(Date.now() - RECENT_HOURS * 3_600_000);
  const rows = await db.select({ o: opportunities, snap: receipts.snapshot }).from(opportunities)
    .leftJoin(receipts, eq(receipts.oppId, opportunities.id))
    .where(and(gte(opportunities.lastSeenAt, since)))
    .orderBy(desc(opportunities.profitPerDay)).limit(2_000);
  return rows.map(r => ({ live: r.o.data, snapshot: r.snap ?? r.o.data, firstSeenAt: r.o.firstSeenAt.getTime(), lastSeenAt: r.o.lastSeenAt.getTime(), active: r.o.active }));
});

export const storedOpp = (id: string): Promise<StoredOpp | null> => safe(null, async () => {
  const db = getDb();
  const rows = await db.select({ o: opportunities, snap: receipts.snapshot }).from(opportunities).leftJoin(receipts, eq(receipts.oppId, opportunities.id))
    .where(eq(opportunities.id, id)).limit(1);
  const r = rows[0];
  return r ? { live: r.o.data, snapshot: r.snap ?? r.o.data, firstSeenAt: r.o.firstSeenAt.getTime(), lastSeenAt: r.o.lastSeenAt.getTime(), active: r.o.active } : null;
});

export interface ReceiptRow {
  id: number;
  snapshot: Opportunity;
  detectedAt: number;
  settledAt: number | null;
  sameWay: boolean | null;
  realizedProfit: number | null;
}

export const receiptRows = (days: number): Promise<ReceiptRow[]> => safe([], async () => {
  const rows = await getDb().select().from(receipts).where(gte(receipts.detectedAt, new Date(Date.now() - days * 86_400_000)))
    .orderBy(desc(receipts.detectedAt)).limit(5_000);
  return rows.map(r => ({ id: r.id, snapshot: r.snapshot, detectedAt: r.detectedAt.getTime(), settledAt: r.settledAt?.getTime() ?? null, sameWay: r.sameWay, realizedProfit: r.realizedProfit }));
});

/** Today's proof numbers from the receipts log (locks only, not second opinions). Null when nothing was found. */
export interface ProofStats { found: number; biggestRoi: number; medianRoi: number }
export function proofStats(rows: readonly ReceiptRow[], sinceMs: number): ProofStats | null {
  const rois = rows.filter(r => r.detectedAt >= sinceMs && r.snapshot.kind !== "second_opinion").map(r => r.snapshot.roi).sort((a, b) => a - b);
  if (!rois.length) return null;
  const mid = Math.floor(rois.length / 2);
  const median = rois.length % 2 ? rois[mid] ?? 0 : ((rois[mid - 1] ?? 0) + (rois[mid] ?? 0)) / 2;
  return { found: rois.length, biggestRoi: rois[rois.length - 1] ?? 0, medianRoi: median };
}

export const whales = (limit = 100): Promise<WhaleTrade[]> => safe([], async () => {
  const rows = await getDb().select().from(whaleTrades).orderBy(desc(whaleTrades.at)).limit(limit);
  return rows.map(r => r.data);
});

export interface PairView { pair: MarketPair; a: VMarket | null; b: VMarket | null; override: { action: string; note: string | null } | null }

export const pairViews = (limit = 500): Promise<PairView[]> => safe([], async () => {
  const db = getDb();
  const rows = await db.select().from(pairs).orderBy(desc(pairs.updatedAt)).limit(limit);
  const mk = async (venue: string, id: string) => (await db.select().from(markets).where(and(eq(markets.venue, venue as VMarket["venue"]), eq(markets.id, id))).limit(1))[0]?.data ?? null;
  const out: PairView[] = [];
  for (const r of rows) {
    const p = r.data;
    const o = (await db.select().from(matchOverrides).where(eq(matchOverrides.key, p.id)).limit(1))[0];
    out.push({ pair: p, a: await mk(p.a.venue, p.a.id), b: await mk(p.b.venue, p.b.id), override: o ? { action: o.action, note: o.note } : null });
  }
  return out;
});

export const marketsByKey = (keys: ReadonlyArray<{ venue: VMarket["venue"]; id: string }>): Promise<Map<string, VMarket>> => safe(new Map(), async () => {
  const out = new Map<string, VMarket>();
  for (const k of keys) {
    const r = (await getDb().select().from(markets).where(and(eq(markets.venue, k.venue), eq(markets.id, k.id))).limit(1))[0];
    if (r) out.set(`${k.venue}:${k.id}`, r.data);
  }
  return out;
});

export const settledCount = (): Promise<number> => safe(0, async () => (await getDb().select({ id: receipts.id }).from(receipts).where(isNotNull(receipts.settledAt))).length);

/** "Left on the table today": total profit available across GREEN locks first found since `sinceMs`, as computed at
 *  detection (fees included, fillable size only). Null when there were none. */
export function leftOnTable(rows: readonly ReceiptRow[], sinceMs: number): { total: number; deals: number } | null {
  const green = rows.filter(r => r.detectedAt >= sinceMs && r.snapshot.safety === "green" && r.snapshot.kind !== "second_opinion" && r.snapshot.profit > 0);
  if (!green.length) return null;
  return { total: green.reduce((a, r) => a + r.snapshot.profit, 0), deals: green.length };
}

/** Average GREEN locks found per day over the window. The landing page's refund offer only shows when this is >= 1
 *  over the last 30 days (computed from the receipts log, never assumed). */
export function greenPerDay(rows: readonly ReceiptRow[], days: number, now: number): number {
  const since = now - days * 86_400_000;
  const n = rows.filter(r => r.detectedAt >= since && r.snapshot.safety === "green" && r.snapshot.kind !== "second_opinion").length;
  return n / days;
}

/** The single most recent real deal from the last 24 hours for the hero, as found (snapshot). */
export function heroDeal(rows: readonly ReceiptRow[], now: number): ReceiptRow | null {
  return rows.find(r => r.detectedAt >= now - 86_400_000 && r.snapshot.kind === "cross_arb" && r.snapshot.safety === "green" && r.snapshot.legs.length === 2) ?? null;
}

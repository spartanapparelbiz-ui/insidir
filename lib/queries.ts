/* Reads for the pages. Every number on the site comes from here (the database); a page hides a section when its
 * number isn't there rather than filling it with a placeholder. Server-only. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { pairs, quarantinedDeals, markets, matchOverrides } from "./db/schema";
import type { MarketPair, Opportunity, VMarket } from "./types";

const safe = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => {
  if (!hasDatabase()) return fallback;
  try { return await run(); } catch (e) { console.error("query failed:", e instanceof Error ? e.message : e); return fallback; }
};

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

const marketsByKey = (keys: ReadonlyArray<{ venue: VMarket["venue"]; id: string }>): Promise<Map<string, VMarket>> => safe(new Map(), async () => {
  const out = new Map<string, VMarket>();
  const byVenue = new Map<VMarket["venue"], Set<string>>();
  for (const k of keys) byVenue.set(k.venue, (byVenue.get(k.venue) ?? new Set()).add(k.id));
  for (const [venue, ids] of byVenue) {
    const rows = await getDb().select().from(markets).where(and(eq(markets.venue, venue), inArray(markets.id, [...ids])));
    for (const r of rows) out.set(`${venue}:${r.id}`, r.data);
  }
  return out;
});

/** Quarantined deals for /admin review, latest first, with each leg's market (title and rules). */
export interface QuarantineView { opp: Opportunity; reasons: string[]; firstSeenAt: number; lastSeenAt: number; markets: Array<VMarket | null> }
export const quarantineViews = (limit = 100): Promise<QuarantineView[]> => safe([], async () => {
  const rows = await getDb().select().from(quarantinedDeals).orderBy(desc(quarantinedDeals.lastSeenAt)).limit(limit);
  const byKey = await marketsByKey(rows.flatMap(r => r.data.legs.map(l => ({ venue: l.venue, id: l.marketId }))));
  return rows.map(r => ({
    opp: r.data, reasons: r.reasons, firstSeenAt: r.firstSeenAt.getTime(), lastSeenAt: r.lastSeenAt.getTime(),
    markets: r.data.legs.map(l => byKey.get(`${l.venue}:${l.marketId}`) ?? null),
  }));
});

export const quarantineCount = (): Promise<number> => safe(0, async () => (await getDb().select({ n: sql<number>`count(*)::int` }).from(quarantinedDeals))[0]?.n ?? 0);

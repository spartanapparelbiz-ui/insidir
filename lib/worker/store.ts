/* The worker's database side: match cache, LLM spend, overrides, markets and pairs, opportunities and receipts,
 * heartbeats, whales and alert bookkeeping. */
import { and, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { alertsSent, llmUsage, markets, matchDecisions, matchOverrides, nearMisses, opportunities, pairs, pushSubscriptions, quarantinedDeals, receipts, users, whaleTrades, workerHeartbeats } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import { hiddenKinds } from "@/lib/flags";
import type { AlertUser } from "@/lib/alerts/fanout";
import type { MatchCache, MatchDecision } from "@/lib/matching/cache";
import type { LlmUsageStore } from "@/lib/matching/llm";
import type { Override } from "@/lib/matching";
import type { NearMiss } from "@/lib/engines/near-miss";
import type { MarketPair, Opportunity, VMarket, WhaleTrade } from "@/lib/types";
import { dealClosed, dealFound, priceTick, publish, whale, type LiveRowInput } from "@/lib/live/publish";

/** An opportunity not re-found for this long is marked inactive. */
export const DEACTIVATE_AFTER_MS = 90_000;

export function dbMatchCache(db: Db): MatchCache {
  return {
    async get(key) {
      const r = (await db.select().from(matchDecisions).where(eq(matchDecisions.key, key)).limit(1))[0];
      return r ? (r.decision as unknown as MatchDecision) : null;
    },
    async getMany(keys) {
      const out = new Map<string, MatchDecision>();
      for (let i = 0; i < keys.length; i += 1000) {
        const rows = await db.select().from(matchDecisions).where(inArray(matchDecisions.key, keys.slice(i, i + 1000)));
        for (const r of rows) out.set(r.key, r.decision as unknown as MatchDecision);
      }
      return out;
    },
    async set(key, decision) {
      const value = decision as unknown as Record<string, unknown>;
      await db.insert(matchDecisions).values({ key, decision: value }).onConflictDoUpdate({ target: matchDecisions.key, set: { decision: value, decidedAt: new Date() } });
    },
  };
}

export function dbUsageStore(db: Db): LlmUsageStore {
  return {
    async getMonthSpendUsd(month) { return (await db.select().from(llmUsage).where(eq(llmUsage.month, month)).limit(1))[0]?.usd ?? 0; },
    async addSpendUsd(month, usd) {
      await db.insert(llmUsage).values({ month, usd, calls: 1 })
        .onConflictDoUpdate({ target: llmUsage.month, set: { usd: sql`${llmUsage.usd} + ${usd}`, calls: sql`${llmUsage.calls} + 1` } });
    },
  };
}

/** Admin overrides from /admin, in matching's shape. */
export async function loadOverrides(db: Db): Promise<Map<string, Override>> {
  const out = new Map<string, Override>();
  for (const o of await db.select().from(matchOverrides)) {
    out.set(o.key, o.action === "block" ? { action: "block" } : o.action === "match" ? { action: "force_match", inverted: o.inverted, ...(o.safety ? { safety: o.safety } : {}) }
      : { safety: o.safety ?? "yellow", ...(o.note ? { notes: [o.note] } : {}) });
  }
  return out;
}

export async function saveMarkets(db: Db, list: readonly VMarket[]): Promise<void> {
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    await db.insert(markets).values(chunk.map(m => ({ venue: m.venue, id: m.id, data: m, updatedAt: new Date() })))
      .onConflictDoUpdate({ target: [markets.venue, markets.id], set: { data: sql`excluded.data`, updatedAt: sql`excluded.updated_at` } });
  }
}

export async function savePairs(db: Db, list: readonly MarketPair[]): Promise<void> {
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    await db.insert(pairs).values(chunk.map(p => ({ id: p.id, data: p, safety: p.safety, blocked: p.blocked, updatedAt: new Date() })))
      .onConflictDoUpdate({ target: pairs.id, set: { data: sql`excluded.data`, safety: sql`excluded.safety`, blocked: sql`excluded.blocked`, updatedAt: sql`excluded.updated_at` } });
  }
}

/** Stores a scan. New opportunities get a receipt (the snapshot at detection, never changed) and a live "deal found"
 *  event; a price that moved on a known deal gets a live "price tick" (at most one per deal per TICK_MIN_MS, tracked
 *  in `lastTickAt`). Returns the new ids. */
export async function saveOpportunities(db: Db, opps: readonly Opportunity[], now: Date, lastTickAt: Map<string, number> = new Map()): Promise<string[]> {
  if (!opps.length) return [];
  const prior = await db.select({ id: opportunities.id, data: opportunities.data, firstSeenAt: opportunities.firstSeenAt, active: opportunities.active })
    .from(opportunities).where(inArray(opportunities.id, opps.map(o => o.id)));
  const existing = new Set(prior.map(r => r.id));
  const priorById = new Map(prior.map(r => [r.id, r]));
  for (const o of opps) {
    const venues = [...new Set(o.legs.map(l => l.venue))];
    await db.insert(opportunities).values({ id: o.id, kind: o.kind, data: o, venues, safety: o.safety, roi: o.roi, profitPerDay: o.profitPerDay, firstSeenAt: now, lastSeenAt: now, active: true })
      .onConflictDoUpdate({ target: opportunities.id, set: { data: o, venues, safety: o.safety, roi: o.roi, profitPerDay: o.profitPerDay, lastSeenAt: now, active: true } });
  }
  const fresh = opps.filter(o => !existing.has(o.id));
  for (const o of fresh) {
    await db.insert(receipts).values({ oppId: o.id, kind: o.kind, safety: o.safety, detectedAt: now, snapshot: o }).onConflictDoNothing();
  }
  const live: LiveRowInput[] = fresh.map(o => dealFound(o, now));
  for (const o of opps) {
    const p = priorById.get(o.id);
    // A deal that had closed and came back counts as found again.
    if (p && !p.active) { live.push(dealFound(o, p.firstSeenAt, now)); continue; }
    const tick = p ? priceTick(p.data, o, p.firstSeenAt, now, lastTickAt) : null;
    if (tick) { live.push(tick); lastTickAt.set(o.id, now.getTime()); }
  }
  await publish(db, live);
  return fresh.map(o => o.id);
}

/** Stores quarantined deals (never in opportunities or receipts) and switches off any live copy a scan showed before
 *  it crossed a limit. Returns the ids seen for the first time. */
export async function saveQuarantined(db: Db, list: ReadonlyArray<{ opp: Opportunity; reasons: string[] }>, now: Date): Promise<string[]> {
  if (!list.length) return [];
  const ids = list.map(q => q.opp.id);
  const existing = new Set((await db.select({ id: quarantinedDeals.id }).from(quarantinedDeals).where(inArray(quarantinedDeals.id, ids))).map(r => r.id));
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    await db.insert(quarantinedDeals).values(chunk.map(q => ({ id: q.opp.id, kind: q.opp.kind, data: q.opp, reasons: q.reasons, firstSeenAt: now, lastSeenAt: now })))
      .onConflictDoUpdate({ target: quarantinedDeals.id, set: { data: sql`excluded.data`, reasons: sql`excluded.reasons`, lastSeenAt: now } });
  }
  await db.update(opportunities).set({ active: false }).where(and(eq(opportunities.active, true), inArray(opportunities.id, ids)));
  return ids.filter(id => !existing.has(id));
}

/** Switches off every live deal of these kinds (a disabled engine's leftovers). */
export async function deactivateKinds(db: Db, kinds: readonly string[]): Promise<number> {
  if (!kinds.length) return 0;
  return (await db.update(opportunities).set({ active: false }).where(and(eq(opportunities.active, true), inArray(opportunities.kind, [...kinds]))).returning({ id: opportunities.id })).length;
}

/** Deals not re-found recently are no longer live; each one gets a live "deal closed" event with how long it lasted. */
export async function deactivateStale(db: Db, now: Date): Promise<number> {
  const res = await db.update(opportunities).set({ active: false })
    .where(and(eq(opportunities.active, true), lt(opportunities.lastSeenAt, new Date(now.getTime() - DEACTIVATE_AFTER_MS))))
    .returning({ id: opportunities.id, data: opportunities.data, firstSeenAt: opportunities.firstSeenAt, lastSeenAt: opportunities.lastSeenAt });
  await publish(db, res.map(r => dealClosed(r.data, r.firstSeenAt, r.lastSeenAt, now)));
  return res.length;
}

export async function heartbeat(db: Db, job: string, ok: boolean, error: string | null, stats: Record<string, number | string> = {}): Promise<void> {
  const now = new Date();
  const row = { job, lastRunAt: now, ok, error, stats, ...(ok ? { lastOkAt: now } : {}) };
  await db.insert(workerHeartbeats).values(row).onConflictDoUpdate({ target: workerHeartbeats.job, set: { lastRunAt: now, ok, error, stats, ...(ok ? { lastOkAt: now } : {}) } });
}

/** Stores big trades; each one not seen before gets a live "whale" event. */
/** The closest matched market per venue pair, replacing the last scan's. Pairs that vanish keep their last row
 *  (with its time), so the landing page can still show the last known prices. */
export async function saveNearMisses(db: Db, list: readonly NearMiss[]): Promise<void> {
  for (const n of list) {
    const row = { venues: n.venues.join("|"), data: n, at: new Date(n.at) };
    await db.insert(nearMisses).values(row).onConflictDoUpdate({ target: nearMisses.venues, set: { data: row.data, at: row.at } });
  }
}

export async function saveWhales(db: Db, trades: readonly WhaleTrade[]): Promise<void> {
  const added: WhaleTrade[] = [];
  for (const t of trades) {
    const r = await db.insert(whaleTrades).values({ key: `${t.txHash ?? ""}:${t.wallet}:${t.marketId}:${t.outcome}`, data: t, at: new Date(t.timestamp) })
      .onConflictDoNothing().returning({ key: whaleTrades.key });
    if (r.length) added.push(t);
  }
  await publish(db, added.map(whale));
}

/** Active deals first seen within the alert window, with their first-seen time. */
export async function alertableDeals(db: Db, since: Date): Promise<Array<{ opp: Opportunity; firstSeenAt: number; active: boolean }>> {
  const hidden = hiddenKinds();
  const rows = await db.select().from(opportunities).where(and(eq(opportunities.active, true), gte(opportunities.firstSeenAt, since), hidden.length ? notInArray(opportunities.kind, hidden) : undefined));
  return rows.map(r => ({ opp: r.data, firstSeenAt: r.firstSeenAt.getTime(), active: r.active }));
}

/** Users who could get an alert or a summary right now. */
export async function alertUsers(db: Db, now: Date): Promise<AlertUser[]> {
  const rows = await db.select().from(users);
  const subs = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  const withPush = new Set(subs.map(s => s.userId));
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const emails = await db.select({ userId: alertsSent.userId, n: sql<number>`count(*)::int` }).from(alertsSent)
    .where(and(eq(alertsSent.channel, "email"), gte(alertsSent.sentAt, hourAgo))).groupBy(alertsSent.userId);
  const emailCount = new Map(emails.map(e => [e.userId, e.n]));
  return rows.map(u => ({
    id: u.id, email: u.email, plan: u.plan, region: u.region, settings: { ...DEFAULT_SETTINGS, ...u.settings }, hasPush: withPush.has(u.id),
    emailsLastHour: emailCount.get(u.id) ?? 0, lastDigestAt: u.lastDigestAt?.getTime() ?? null,
  }));
}

/** Claims an alert (user, deal, channel) exactly once across workers. */
export async function claimAlert(db: Db, userId: string, oppId: string, channel: "push" | "email"): Promise<boolean> {
  const r = await db.insert(alertsSent).values({ userId, oppId, channel }).onConflictDoNothing().returning({ oppId: alertsSent.oppId });
  return r.length > 0;
}

export async function pushTargets(db: Db, userId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}
export async function dropPush(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
export async function markDigestSent(db: Db, userId: string, at: Date): Promise<void> {
  await db.update(users).set({ lastDigestAt: at }).where(eq(users.id, userId));
}

/** Receipts whose markets should have resolved by now and aren't settled yet. */
export async function unsettledReceipts(db: Db, now: Date, limit = 500): Promise<Array<{ id: number; snapshot: Opportunity }>> {
  const rows = await db.select({ id: receipts.id, snapshot: receipts.snapshot }).from(receipts).where(isNull(receipts.settledAt)).limit(5_000);
  return rows.filter(r => r.snapshot.closeTime !== null && r.snapshot.closeTime < now.getTime()).slice(0, limit);
}

export async function settleReceipt(db: Db, id: number, results: Record<string, "yes" | "no" | "void">, sameWay: boolean, realizedProfit: number, at: Date): Promise<void> {
  await db.update(receipts).set({ settledAt: at, results, sameWay, realizedProfit }).where(eq(receipts.id, id));
}

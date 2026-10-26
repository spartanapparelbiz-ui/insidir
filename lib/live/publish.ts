/* The worker's side of the live pipe: what it saw happen, written to terminal.live_events in the order it happened.
 * Nothing here is invented: each event is a real change in the worker's own data (a new deal, a deal no longer found,
 * a price that moved, a big trade). */
import { lt } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveEvents } from "@/lib/db/schema";
import type { Opportunity, Venue, WhaleTrade } from "@/lib/types";
import type { RawDealClosed, RawDealFound, RawPriceTick } from "./types";

/** At most one price tick per deal this often, so the stream stays readable. */
export const TICK_MIN_MS = 10_000;
/** Live events older than this are deleted. */
export const LIVE_KEEP_MS = 7 * 86_400_000;

const venuesOf = (o: Opportunity): Venue[] => [...new Set(o.legs.map(l => l.venue))];
const legKey = (o: Opportunity): string => o.legs.map(l => `${l.venue}:${l.side}:${l.avgPrice.toFixed(4)}`).join("|");

export interface LiveRowInput { type: "deal_found" | "deal_closed" | "price_tick" | "whale"; oppId: string | null; venues: Venue[]; data: Record<string, unknown>; at: Date }

/** `at` is when it was (re)found; a deal that closed and came back keeps its original first-seen time. */
export function dealFound(o: Opportunity, firstSeenAt: Date, at: Date = firstSeenAt): LiveRowInput {
  const data: RawDealFound = { opp: o, firstSeenAt: firstSeenAt.getTime() };
  return { type: "deal_found", oppId: o.id, venues: venuesOf(o), data: data as unknown as Record<string, unknown>, at };
}

export function dealClosed(o: Opportunity, firstSeenAt: Date, lastSeenAt: Date, at: Date): LiveRowInput {
  const data: RawDealClosed = { title: o.title, kind: o.kind, safety: o.safety, roi: o.roi, firstSeenAt: firstSeenAt.getTime(), closedAt: lastSeenAt.getTime(), lifeMs: Math.max(0, lastSeenAt.getTime() - firstSeenAt.getTime()) };
  return { type: "deal_closed", oppId: o.id, venues: venuesOf(o), data: data as unknown as Record<string, unknown>, at };
}

/** A tick when any leg's price moved since the last stored state, at most once per TICK_MIN_MS per deal. */
export function priceTick(prev: Opportunity, next: Opportunity, firstSeenAt: Date, at: Date, lastTickAt: ReadonlyMap<string, number>): LiveRowInput | null {
  if (legKey(prev) === legKey(next)) return null;
  const last = lastTickAt.get(next.id);
  if (last !== undefined && at.getTime() - last < TICK_MIN_MS) return null;
  const data: RawPriceTick = {
    legs: next.legs.map(l => ({ venue: l.venue, side: l.side, avgPrice: l.avgPrice })),
    roi: next.roi, profit: next.profit, profitPerDay: next.profitPerDay, cost: next.cost, fees: next.fees, sets: next.sets, firstSeenAt: firstSeenAt.getTime(),
  };
  return { type: "price_tick", oppId: next.id, venues: venuesOf(next), data: data as unknown as Record<string, unknown>, at };
}

export function whale(t: WhaleTrade): LiveRowInput {
  return { type: "whale", oppId: null, venues: [t.venue], data: t as unknown as Record<string, unknown>, at: new Date(t.timestamp) };
}

export async function publish(db: Db, rows: readonly LiveRowInput[]): Promise<void> {
  if (!rows.length) return;
  // Insert in time order so ids follow time, which is how the stream reads them.
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (let i = 0; i < sorted.length; i += 500) await db.insert(liveEvents).values(sorted.slice(i, i + 500));
}

export async function pruneLive(db: Db, now: Date): Promise<void> {
  await db.delete(liveEvents).where(lt(liveEvents.at, new Date(now.getTime() - LIVE_KEEP_MS)));
}

/* Reads from the live events log for server-rendered pages. Server only. */
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { liveEvents } from "@/lib/db/schema";
import type { FeedViewer } from "@/lib/feed";
import type { LiveEvent, RawLiveEvent, RawPriceTick } from "./types";
import { viewEvent } from "./view";

/** The latest real price tick for a deal at or before `at` (the viewer's clock), or null. */
export async function latestTick(oppId: string, at: number): Promise<RawPriceTick | null> {
  if (!hasDatabase()) return null;
  try {
    const r = (await getDb().select({ data: liveEvents.data }).from(liveEvents)
      .where(and(eq(liveEvents.oppId, oppId), eq(liveEvents.type, "price_tick"), lte(liveEvents.at, new Date(at))))
      .orderBy(desc(liveEvents.id)).limit(1))[0];
    return r ? (r.data as unknown as RawPriceTick) : null;
  } catch { return null; }
}

/** The latest events this viewer may already see (for the tape's first paint), newest first, price ticks excluded. */
export async function recentFor(viewer: FeedViewer, now: number, n = 12): Promise<LiveEvent[]> {
  if (!hasDatabase()) return [];
  try {
    const rows = await getDb().select().from(liveEvents)
      .where(and(ne(liveEvents.type, "price_tick"), gte(liveEvents.at, new Date(now - 6 * 3_600_000))))
      .orderBy(desc(liveEvents.id)).limit(500);
    const out: LiveEvent[] = [];
    for (const r of rows) {
      const raw: RawLiveEvent = { id: r.id, type: r.type, oppId: r.oppId, venues: r.venues, data: r.data as unknown as RawLiveEvent["data"], at: r.at.getTime() };
      const v = viewEvent(raw, viewer, now);
      if (v) out.push(v);
      if (out.length >= n) break;
    }
    return out;
  } catch { return []; }
}

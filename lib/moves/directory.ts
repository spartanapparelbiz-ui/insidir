/* Market details for the moves feed (title, category, link) without holding every market in memory. A trade names
 * its market; the directory looks it up in terminal.markets (written by the Price gaps matcher when it runs) and
 * asks the venue for the ones it doesn't have (getMarketsById), keeping the most recent DIRECTORY_MAX in memory for
 * DIRECTORY_TTL_MS. */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { markets } from "@/lib/db/schema";
import type { VMarket } from "@/lib/types";

export const DIRECTORY_MAX = 5000;
export const DIRECTORY_TTL_MS = 6 * 3_600_000;

type Venue = "polymarket" | "kalshi";
export interface DirectorySource { getMarketsById(ids: readonly string[]): Promise<Map<string, VMarket>> }

export class MarketDirectory {
  private mem = new Map<string, { m: VMarket; at: number }>();
  constructor(private readonly db: Db | null, private readonly sources: Record<Venue, DirectorySource>, private readonly max = DIRECTORY_MAX) {}

  get size(): number { return this.mem.size; }

  /** The markets for these ids on one venue, from memory, then the database, then the venue. Unknown ids are absent. */
  async lookup(venue: Venue, ids: readonly string[], now = Date.now()): Promise<Map<string, VMarket>> {
    const out = new Map<string, VMarket>();
    let missing: string[] = [];
    for (const id of new Set(ids)) {
      const hit = this.mem.get(`${venue}:${id}`);
      if (hit && now - hit.at < DIRECTORY_TTL_MS) out.set(id, hit.m); else missing.push(id);
    }
    if (missing.length && this.db) {
      for (const r of await this.db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, venue), inArray(markets.id, missing)))) this.put(venue, r.data, now, out);
      missing = missing.filter(id => !out.has(id));
    }
    if (missing.length) {
      try { for (const [, m] of await this.sources[venue].getMarketsById(missing)) this.put(venue, m, now, out); } catch { /* the trade is classified as "other" this time */ }
    }
    return out;
  }

  private put(venue: Venue, full: VMarket, now: number, out: Map<string, VMarket>): void {
    // Moves need the title, category and link; the rules text would be most of the memory.
    const m = { ...full, rules: "" };
    const k = `${venue}:${m.id}`;
    this.mem.delete(k);
    this.mem.set(k, { m, at: now });
    if (this.mem.size > this.max) this.mem.delete(this.mem.keys().next().value!);
    out.set(m.id, m);
  }
}

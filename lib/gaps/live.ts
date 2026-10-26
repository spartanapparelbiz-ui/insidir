/* The Price gaps live scanner, inside the existing worker (no new service). Reads terminal.gap_targets (written by
 * the cron matcher) every TARGETS_MS (10 min) and only books those markets every BOOKS_MS (10 s): Kalshi through
 * batch orderbooks (up to 100 tickers per request) and Polymarket through POST /books (up to 500 tokens per
 * request). Every engine runs over those books; deals that look too good, or come from pairs whose rules differ,
 * are quarantined (lib/quarantine.ts) instead of shown. Holds only the targets' markets and one round of books.
 * Off unless GAPS_ENABLED=1. */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { gapTargets, markets } from "@/lib/db/schema";
import type { VenueClient } from "@/lib/exchanges";
import { marketKey } from "@/lib/engines/common";
import { quarantineReasons } from "@/lib/quarantine";
import { marketsToBook, scan, type ScanOptions, type Universe } from "@/lib/scanner";
import type { Book, MarketPair, Opportunity, VEvent, VMarket, Venue } from "@/lib/types";

export const TARGETS_MS = 10 * 60_000;
export const BOOKS_MS = 10_000;

export interface LiveRound { opps: Opportunity[]; held: Array<{ opp: Opportunity; reasons: string[] }>; books: number; requests: number; errors: string[] }

/** Requests one round of books costs: Kalshi in groups of 100 tickers, Polymarket in groups of 500 tokens (two per
 *  market: YES and NO), Polymarket US one per market. */
export function requestsFor(need: ReadonlyMap<Venue, readonly VMarket[]>): number {
  let n = 0;
  for (const [venue, list] of need) {
    if (venue === "kalshi") n += Math.ceil(list.length / 100);
    else if (venue === "polymarket") n += Math.ceil((list.length * 2) / 500);
    else n += list.length;
  }
  return n;
}

export class LiveGaps {
  private universe: Universe = { markets: [], events: [], pairs: [] };
  private byKey = new Map<string, VMarket>();
  private need = new Map<Venue, VMarket[]>();
  private loadedAt = 0;

  constructor(private readonly db: Db, private readonly clients: Record<Venue, Pick<VenueClient, "getBooks">>, private readonly options: ScanOptions) {}

  get size(): { targets: number; markets: number; books: number } {
    return { targets: this.universe.pairs.length + this.universe.events.length, markets: this.byKey.size, books: [...this.need.values()].reduce((s, l) => s + l.length, 0) };
  }

  /** Re-reads the targets and their markets when they are older than TARGETS_MS (or when forced). */
  async refresh(now: number, force = false): Promise<boolean> {
    if (!force && now - this.loadedAt < TARGETS_MS) return false;
    const rows = await this.db.select().from(gapTargets);
    const pairs: MarketPair[] = [], events: VEvent[] = [];
    const want = new Map<Venue, Set<string>>();
    for (const r of rows) {
      if (r.kind === "pair") pairs.push(r.data as unknown as MarketPair);
      else events.push(r.data as unknown as VEvent);
      for (const k of r.marketKeys) {
        const i = k.indexOf(":");
        const venue = k.slice(0, i) as Venue;
        (want.get(venue) ?? want.set(venue, new Set()).get(venue)!).add(k.slice(i + 1));
      }
    }
    const list: VMarket[] = [];
    for (const [venue, set] of want) {
      const ids = [...set];
      for (let i = 0; i < ids.length; i += 2000) {
        // Rules text is only for matching and the deal page; the engines never read it, so it isn't kept here.
        for (const r of await this.db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, venue), inArray(markets.id, ids.slice(i, i + 2000))))) list.push({ ...r.data, rules: "" });
      }
    }
    this.universe = { markets: list, events, pairs };
    this.byKey = new Map(list.map(m => [marketKey(m.venue, m.id), m]));
    this.need = marketsToBook(this.universe, now, this.options);
    this.loadedAt = now;
    return true;
  }

  /** One round: the targets' books, every engine, and the quarantine split. Nothing is stored here. */
  async round(now: number): Promise<LiveRound> {
    const books = new Map<string, Book>();
    const errors: string[] = [];
    for (const [venue, list] of this.need) {
      if (!list.length) continue;
      try {
        for (const [id, b] of await this.clients[venue].getBooks(list, { priority: "normal" })) books.set(marketKey(venue, id), b);
      } catch (e) { errors.push(`${venue}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    const { opps: found } = scan(this.universe, books, now, this.options);
    const pairs = new Map(this.universe.pairs.map(p => [p.id, p]));
    const fee = (venue: Venue, id: string) => this.byKey.get(marketKey(venue, id))?.fee;
    const opps: Opportunity[] = [], held: LiveRound["held"] = [];
    for (const opp of found) {
      const reasons = quarantineReasons(opp, { pair: opp.pairId ? pairs.get(opp.pairId) : undefined, fee });
      if (reasons.length) held.push({ opp, reasons }); else opps.push(opp);
    }
    return { opps, held, books: books.size, requests: requestsFor(this.need), errors };
  }
}

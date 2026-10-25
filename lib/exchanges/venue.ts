/* The interface every venue client implements, and a small TTL cache so listMarkets + listEvents in one cycle cost
 * one sweep. */
import type { Book, VEvent, Venue, VMarket } from "@/lib/types";
import type { Clock, Priority } from "./http";

export interface ListOptions {
  /** Bypass the sweep cache. */
  refresh?: boolean;
  priority?: Priority;
}

export interface BookOptions {
  /** "hot" for markets with live opportunities: those requests jump the background sweep's queue. */
  priority?: Priority;
}

export interface VenueClient {
  readonly venue: Venue;
  /** Every open, tradeable binary market on the venue. */
  listMarkets(opts?: ListOptions): Promise<VMarket[]>;
  /** Every open event (group of markets) on the venue. marketIds only reference markets listMarkets returns. */
  listEvents(opts?: ListOptions): Promise<VEvent[]>;
  /** Order books keyed by VMarket.id. Markets whose book could not be fetched are absent from the map. */
  getBooks(markets: readonly VMarket[], opts?: BookOptions): Promise<Map<string, Book>>;
  /** Markets by VMarket.id in ANY status (open, closed, settled), with `result` filled once settled. For settling
   *  logged deals. Ids the venue does not know are absent from the map; never throws for a missing id. */
  getMarketsById(ids: readonly string[], opts?: BookOptions): Promise<Map<string, VMarket>>;
}

export interface Sweep {
  markets: VMarket[];
  events: VEvent[];
  fetchedAt: number;
}

/** Sweep results kept this long, so listMarkets and listEvents called back to back share one sweep. */
export const SWEEP_TTL_MS = 30_000;

/** Caches one async result for `ttlMs` and de-duplicates concurrent loads. */
export class TtlCache<T> {
  private value: { at: number; v: T } | null = null;
  private inflight: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly clock: Pick<Clock, "now">,
  ) {}

  get(load: () => Promise<T>, refresh = false): Promise<T> {
    const now = this.clock.now();
    if (!refresh && this.value && now - this.value.at < this.ttlMs) return Promise.resolve(this.value.v);
    if (this.inflight) return this.inflight;
    const p = load().then(
      v => {
        this.value = { at: this.clock.now(), v };
        this.inflight = null;
        return v;
      },
      (err: unknown) => {
        this.inflight = null;
        throw err;
      },
    );
    this.inflight = p;
    return p;
  }
}

/** Split a list into chunks of `n`. */
export function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

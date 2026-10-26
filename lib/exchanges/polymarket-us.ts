/* Polymarket US: Polymarket's separate, CFTC-regulated exchange (polymarket.us), with its own API and its own market
 * list. US users see this venue and Kalshi, never "polymarket".
 *
 * UNVERIFIED. The sandbox cannot reach the API and its public market-data endpoints are not known with confidence,
 * so everything here is built to fail soft:
 *   - the host comes from POLYMARKET_US_API_URL (default below) and the paths are the constants below;
 *   - the readers accept Gamma-shaped rows (conditionId / outcomes / clobTokenIds, as Polymarket's international
 *     API sends) and generic exchange-shaped rows (id / ticker / title / status / snake_case or camelCase);
 *   - list calls return [] (and record lastError) when the API is unreachable, unconfigured or answers something
 *     unreadable; book calls leave markets out.
 * Set POLYMARKET_US_ENABLED=0 to switch the venue off without touching code. */
import { polymarketRate } from "@/lib/fees";
import type { Book, FeeModel, Level, Side, VEvent, VMarket } from "@/lib/types";
import { complement, sortAsks, sortBids, readLevel } from "./book";
import { normaliseCategory } from "./categories";
import { baseUrls, qs, realClock, venueHttp, type Clock, type HttpClient, type Priority } from "./http";
import { bool, boolOrNull, epochMs, isObject, list, num, objList, pick, rows, slugify, str, strList, type JsonObject } from "./parse";
import { readGammaEvent, readGammaMarket } from "./polymarket";
import { strikeFromText } from "./strike";
import { SWEEP_TTL_MS, TtlCache, type BookOptions, type ListOptions, type Sweep, type VenueClient } from "./venue";

/** Unverified endpoint paths, relative to POLYMARKET_US_API_URL. */
export const US_ENDPOINTS = {
  markets: "/v1/markets",
  events: "/v1/events",
  /** {id} is replaced by the market id (or slug). */
  market: "/v1/markets/{id}",
  /** {id} is replaced by the market id (or slug). */
  book: "/v1/markets/{id}/book",
} as const;
/** Page size for list endpoints (limit/offset, or cursor when the response returns one). */
export const US_PAGE_LIMIT = 200;
export const US_MAX_PAGES = 100;
/** Web origin for deep links (path pattern unverified: /market/<slug>). */
export const POLYMARKET_US_WEB = "https://polymarket.us";

const LIST_KEYS = ["markets", "events", "data", "results", "items"] as const;

/** Deep link: /market/<marketSlug>, else /event/<eventSlug> (unverified URL patterns). */
export function usUrl(eventSlug: string | null, marketSlug: string | null): string {
  if (marketSlug) return `${POLYMARKET_US_WEB}/market/${marketSlug}`;
  if (eventSlug) return `${POLYMARKET_US_WEB}/event/${eventSlug}`;
  return POLYMARKET_US_WEB;
}

/* ---------- Readers (pure) ---------- */

function marketStatusActive(m: JsonObject): boolean {
  const status = str(pick(m, "status", "state", "marketState"))?.toLowerCase();
  if (status) return ["open", "active", "trading", "live"].includes(status);
  const active = boolOrNull(m.active);
  const closed = boolOrNull(m.closed);
  return active !== false && closed !== true;
}

function usResult(m: JsonObject): Side | "void" | null {
  const r = str(pick(m, "result", "outcome", "resolution", "settlement"))?.toLowerCase();
  if (r === "yes") return "yes";
  if (r === "no") return "no";
  if (r === "void" || r === "voided" || r === "cancelled" || r === "canceled") return "void";
  const status = str(pick(m, "status", "state"))?.toLowerCase();
  return status === "voided" || status === "cancelled" || status === "canceled" ? "void" : null;
}

/** One Polymarket US market → VMarket ("polymarket_us"). Gamma-shaped rows reuse the international reader. */
export function readUsMarket(m: JsonObject, eventCtx: { id: string; title: string | null; slug: string | null } | null = null): VMarket | null {
  if ((str(m.conditionId) ?? str(m.condition_id)) && list(pick(m, "clobTokenIds", "clob_token_ids")).length) {
    const g = readGammaMarket(m, null, "polymarket_us", usUrl);
    if (!g) return null;
    return {
      ...g,
      eventId: eventCtx?.id ?? g.eventId,
      eventTitle: eventCtx?.title && eventCtx.title !== g.title ? eventCtx.title : g.eventTitle,
    };
  }
  const id = str(pick(m, "id", "marketId", "market_id", "ticker", "slug"));
  if (!id) return null;
  const outcomes = strList(m.outcomes).length ? strList(m.outcomes) : objList(m.outcomes).map(o => str(o.name) ?? str(o.title) ?? "").filter(Boolean);
  if (outcomes.length > 2) return null;
  const title = str(pick(m, "question", "title", "name")) ?? id;
  const slug = str(m.slug) ?? slugify(title);
  const event = isObject(m.event) ? m.event : null;
  const eventId = eventCtx?.id ?? str(pick(m, "eventId", "event_id", "eventSlug", "event_slug", "eventTicker", "event_ticker")) ?? (event ? str(pick(event, "id", "slug")) : null) ?? id;
  const eventTitle = eventCtx?.title ?? (event ? str(event.title) : null) ?? str(pick(m, "eventTitle", "event_title"));
  const tags = list(m.tags).map(t => (isObject(t) ? (str(t.label) ?? str(t.slug) ?? str(t.name)) : str(t)));
  const category = normaliseCategory([str(m.category), str(m.subcategory), ...(event ? [str(event.category)] : []), ...tags]);
  const fee: FeeModel = { venue: "polymarket_us", rate: polymarketRate(category) };
  const o0 = outcomes[0];
  const o1 = outcomes[1];
  const yesNo = !o0 || !o1 || (o0.toLowerCase() === "yes" && o1.toLowerCase() === "no");
  const group = str(pick(m, "groupItemTitle", "yesSubTitle", "yes_sub_title", "subtitle"));
  return {
    venue: "polymarket_us",
    id,
    eventId,
    seriesId: null,
    title,
    eventTitle: eventTitle && eventTitle !== title ? eventTitle : null,
    yesLabel: yesNo ? (group ?? "Yes") : (o0 ?? "Yes"),
    noLabel: yesNo ? "No" : (o1 ?? "No"),
    rules: str(pick(m, "description", "rules", "rulesPrimary", "rules_primary")) ?? "",
    resolutionSource: str(pick(m, "resolutionSource", "resolution_source")),
    closeTime: epochMs(pick(m, "endDate", "end_date", "closeTime", "close_time", "expirationTime", "expiration_time")),
    category,
    fee,
    url: usUrl(null, slug),
    yesTokenId: null,
    noTokenId: null,
    strike: yesNo ? ((group ? strikeFromText(group, eventTitle ?? title) : null) ?? strikeFromText(title, eventTitle ?? "")) : null,
    active: marketStatusActive(m),
    result: usResult(m),
    volume24h: num(pick(m, "volume24hr", "volume24h", "volume_24h", "volume24Hr")),
  };
}

/** Levels in any shape ([p,s], {price,size}, {price:{value}}, {px,qty}); cents when any price exceeds 1. */
function usLevels(v: unknown): Level[] {
  const flat = list(v).map(l => {
    if (!isObject(l)) return l;
    const price = isObject(l.price) ? l.price.value : pick(l, "price", "px", "p");
    const size = isObject(l.size) ? l.size.value : pick(l, "size", "quantity", "qty", "shares", "count", "s");
    return [price, size];
  });
  const cents = flat.some(l => Array.isArray(l) && (num(l[0]) ?? 0) > 1);
  return flat.map(l => readLevel(l, cents ? 100 : 1)).filter((l): l is Level => l !== null);
}

/** A Polymarket US book in any of the plausible shapes. Pure.
 *   {yes: {bids, asks}, no: {bids, asks}}        both sides
 *   {yesBids, yesAsks, noBids, noAsks}           both sides, flat
 *   {bids, asks}                                 the YES instrument only; NO mirrored (NO ask = 1 − YES bid)
 *   {yes: [[p,s]], no: [[p,s]]}                  bids only, Kalshi-style; asks derived from the other side */
export function readUsBook(raw: unknown, fetchedAt: number): Book | null {
  const o = isObject(raw) && isObject(raw.book) ? raw.book : isObject(raw) && isObject(raw.orderbook) ? raw.orderbook : raw;
  if (!isObject(o)) return null;
  const hash = str(pick(o, "hash", "sequence", "seq", "version"));
  if (isObject(o.yes) || isObject(o.no)) {
    const y = isObject(o.yes) ? o.yes : {};
    const n = isObject(o.no) ? o.no : {};
    const yesBids = sortBids(usLevels(y.bids));
    const yesAsks = sortAsks(usLevels(y.asks));
    const noBids = sortBids(usLevels(n.bids));
    const noAsks = sortAsks(usLevels(n.asks));
    return {
      yesBids,
      noBids,
      yesAsks: yesAsks.length ? yesAsks : sortAsks(complement(noBids)),
      noAsks: noAsks.length ? noAsks : sortAsks(complement(yesBids)),
      fetchedAt,
      hash,
    };
  }
  if (Array.isArray(o.yes) || Array.isArray(o.no)) {
    const yesBids = sortBids(usLevels(o.yes));
    const noBids = sortBids(usLevels(o.no));
    return { yesBids, noBids, yesAsks: sortAsks(complement(noBids)), noAsks: sortAsks(complement(yesBids)), fetchedAt, hash };
  }
  if (o.yesBids !== undefined || o.yesAsks !== undefined || o.noBids !== undefined || o.noAsks !== undefined) {
    const yesBids = sortBids(usLevels(o.yesBids));
    const noBids = sortBids(usLevels(o.noBids));
    const yesAsks = sortAsks(usLevels(o.yesAsks));
    const noAsks = sortAsks(usLevels(o.noAsks));
    return {
      yesBids,
      noBids,
      yesAsks: yesAsks.length ? yesAsks : sortAsks(complement(noBids)),
      noAsks: noAsks.length ? noAsks : sortAsks(complement(yesBids)),
      fetchedAt,
      hash,
    };
  }
  if (o.bids !== undefined || o.asks !== undefined) {
    const yesBids = sortBids(usLevels(pick(o, "bids", "buys")));
    const yesAsks = sortAsks(usLevels(pick(o, "asks", "sells", "offers")));
    return { yesBids, yesAsks, noBids: sortBids(complement(yesAsks)), noAsks: sortAsks(complement(yesBids)), fetchedAt, hash };
  }
  return null;
}

/** Group markets into events. mutuallyExclusive / exhaustive only when the payload states it; otherwise false. */
export function usEvents(markets: readonly VMarket[], flags: ReadonlyMap<string, { title: string | null; mutuallyExclusive: boolean; exhaustive: boolean }> = new Map()): VEvent[] {
  const by = new Map<string, VMarket[]>();
  for (const m of markets) {
    const l = by.get(m.eventId) ?? [];
    l.push(m);
    by.set(m.eventId, l);
  }
  return [...by].map(([id, ms]) => {
    const f = flags.get(id);
    const closes = ms.map(m => m.closeTime).filter((t): t is number => t !== null);
    return {
      venue: "polymarket_us" as const,
      id,
      title: f?.title ?? ms[0]?.eventTitle ?? ms[0]?.title ?? id,
      category: ms[0]?.category ?? "other",
      marketIds: ms.map(m => m.id),
      mutuallyExclusive: f?.mutuallyExclusive ?? false,
      exhaustive: (f?.mutuallyExclusive ?? false) && (f?.exhaustive ?? false),
      closeTime: closes.length ? Math.max(...closes) : null,
    };
  });
}

/** Events payload → sweep. Gamma-shaped events reuse readGammaEvent (negRisk rules); others are read generically. */
export function buildUsSweep(rawEvents: readonly JsonObject[], rawMarkets: readonly JsonObject[], fetchedAt: number): Sweep {
  const markets: VMarket[] = [];
  const seen = new Set<string>();
  const flags = new Map<string, { title: string | null; mutuallyExclusive: boolean; exhaustive: boolean }>();
  const add = (m: VMarket | null) => {
    if (m && m.active && !seen.has(m.id)) {
      seen.add(m.id);
      markets.push(m);
    }
  };
  for (const e of rawEvents) {
    const gammaShaped = objList(e.markets).some(m => str(m.conditionId) !== null);
    if (gammaShaped) {
      const r = readGammaEvent(e, "polymarket_us", usUrl);
      if (!r || flags.has(r.event.id)) continue;
      for (const m of r.markets) add(m);
      flags.set(r.event.id, { title: r.event.title, mutuallyExclusive: r.event.mutuallyExclusive, exhaustive: r.event.exhaustive });
      continue;
    }
    const id = str(pick(e, "id", "slug", "ticker", "eventId"));
    if (!id || flags.has(id)) continue;
    const title = str(pick(e, "title", "name"));
    for (const m of objList(e.markets)) add(readUsMarket(m, { id, title, slug: str(e.slug) }));
    const me = bool(pick(e, "mutuallyExclusive", "mutually_exclusive", "negRisk"));
    flags.set(id, { title, mutuallyExclusive: me, exhaustive: false });
  }
  for (const m of rawMarkets) add(readUsMarket(m));
  const events = usEvents(markets, flags);
  return { markets, events, fetchedAt };
}

/* ---------- Client ---------- */

export interface PolymarketUsClientOptions {
  http?: HttpClient;
  baseUrl?: string;
  clock?: Clock;
  /** Overrides POLYMARKET_US_ENABLED. */
  enabled?: boolean;
}

export interface PolymarketUsStatus {
  enabled: boolean;
  baseUrl: string;
  /** null until the first sweep. */
  reachable: boolean | null;
  lastError: string | null;
  lastMarketCount: number;
}

export class PolymarketUsClient implements VenueClient {
  readonly venue = "polymarket_us" as const;
  private readonly http: HttpClient;
  readonly baseUrl: string;
  private readonly clock: Clock;
  private readonly enabled: boolean;
  private readonly sweepCache: TtlCache<Sweep>;
  private state: Omit<PolymarketUsStatus, "enabled" | "baseUrl"> = { reachable: null, lastError: null, lastMarketCount: 0 };

  constructor(o: PolymarketUsClientOptions = {}) {
    this.http = o.http ?? venueHttp("polymarket_us");
    this.baseUrl = (o.baseUrl ?? baseUrls().polymarketUs).replace(/\/+$/, "");
    this.clock = o.clock ?? realClock;
    const envFlag = typeof process !== "undefined" ? process.env.POLYMARKET_US_ENABLED : undefined;
    this.enabled = o.enabled ?? (envFlag === undefined || envFlag.trim() !== "0");
    this.sweepCache = new TtlCache<Sweep>(SWEEP_TTL_MS, this.clock);
  }

  status(): PolymarketUsStatus {
    return { enabled: this.enabled && this.baseUrl !== "", baseUrl: this.baseUrl, ...this.state };
  }

  /** limit/offset pages, following a cursor instead when the response carries one. */
  private async paginate(path: string, priority: Priority): Promise<JsonObject[]> {
    const out: JsonObject[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < US_MAX_PAGES; page++) {
      const params = cursor ? { limit: US_PAGE_LIMIT, cursor } : { limit: US_PAGE_LIMIT, offset: page * US_PAGE_LIMIT, active: true, closed: false };
      const raw = await this.http.json(`${this.baseUrl}${path}${qs(params)}`, { priority, maxRetries: 1 });
      const got = rows(raw, LIST_KEYS);
      out.push(...got);
      const next = isObject(raw) ? str(pick(raw, "cursor", "next_cursor", "nextCursor")) : null;
      if (next && next !== cursor && got.length > 0) {
        cursor = next;
        continue;
      }
      if (got.length < US_PAGE_LIMIT) break;
    }
    return out;
  }

  sweep(opts: ListOptions = {}): Promise<Sweep> {
    const empty = (): Sweep => ({ markets: [], events: [], fetchedAt: this.clock.now() });
    if (!this.status().enabled) return Promise.resolve(empty());
    const priority = opts.priority ?? "normal";
    return this.sweepCache.get(async () => {
      try {
        let events: JsonObject[] = [];
        try {
          events = await this.paginate(US_ENDPOINTS.events, priority);
        } catch {
          events = [];
        }
        const hasNested = events.some(e => objList(e.markets).length > 0);
        const markets = hasNested ? [] : await this.paginate(US_ENDPOINTS.markets, priority);
        const sweep = buildUsSweep(events, markets, this.clock.now());
        this.state = { reachable: true, lastError: sweep.markets.length ? null : "no readable markets in the response", lastMarketCount: sweep.markets.length };
        return sweep;
      } catch (err) {
        this.state = { reachable: false, lastError: err instanceof Error ? err.message : String(err), lastMarketCount: 0 };
        return empty();
      }
    }, opts.refresh);
  }

  async listMarkets(opts: ListOptions = {}): Promise<VMarket[]> {
    return (await this.sweep(opts)).markets;
  }

  async listEvents(opts: ListOptions = {}): Promise<VEvent[]> {
    return (await this.sweep(opts)).events;
  }

  async getBook(marketId: string, priority: Priority = "normal"): Promise<Book | null> {
    const raw = await this.http.json(`${this.baseUrl}${US_ENDPOINTS.book.replace("{id}", encodeURIComponent(marketId))}`, { priority, maxRetries: 1 });
    return readUsBook(raw, this.clock.now());
  }

  /** Markets by id in any status, one GET /v1/markets/{id} each (unverified endpoint). Fails soft: unreachable,
   *  unknown or unreadable ids are absent. */
  async getMarketsById(ids: readonly string[], opts: BookOptions = {}): Promise<Map<string, VMarket>> {
    const out = new Map<string, VMarket>();
    if (!this.status().enabled) return out;
    await Promise.all(
      [...new Set(ids)].map(async id => {
        try {
          const raw = await this.http.json(`${this.baseUrl}${US_ENDPOINTS.market.replace("{id}", encodeURIComponent(id))}`, { priority: opts.priority ?? "normal", maxRetries: 1 });
          const row = isObject(raw) && isObject(raw.market) ? raw.market : raw;
          const m = isObject(row) ? readUsMarket(row) : null;
          if (m) out.set(id, m);
        } catch {
          // Absent.
        }
      }),
    );
    return out;
  }

  async getBooks(markets: readonly VMarket[], opts: BookOptions = {}): Promise<Map<string, Book>> {
    const out = new Map<string, Book>();
    if (!this.status().enabled) return out;
    await Promise.all(
      markets
        .filter(m => m.venue === "polymarket_us")
        .map(async m => {
          try {
            const b = await this.getBook(m.id, opts.priority ?? "normal");
            if (b) out.set(m.id, b);
          } catch {
            // Left out.
          }
        }),
    );
    return out;
  }
}

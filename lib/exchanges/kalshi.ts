/* Kalshi's public Trade API v2 (market data needs no auth).
 *
 *   GET /markets?status=open&limit=1000&cursor=…        markets, cursor pagination
 *   GET /events?status=open&limit=200&cursor=…          events (title, category, mutually_exclusive, series)
 *   GET /events/{event_ticker}?with_nested_markets=true one event with its markets
 *   GET /series                                         every series (fee_type, fee_multiplier, category)
 *   GET /series/{series_ticker}                         one series (fallback, cached per series)
 *   GET /markets/{ticker}/orderbook                     one book, BIDS ONLY
 *   GET /markets/orderbooks?tickers=A,B,…               several books (unverified; falls back to one-by-one)
 *
 * The orderbook lists bids for YES and for NO. Buying YES means matching a NO bid, so YES asks are 1 − NO bids
 * (the best, i.e. highest, NO bid gives the cheapest YES ask), and NO asks are 1 − YES bids. Raw responses are read
 * defensively and leave this file only as lib/types.ts shapes. */
import type { Book, FeeModel, Side, VEvent, VMarket } from "@/lib/types";
import { complement, readLevels, sortAsks, sortBids } from "./book";
import { kalshiCategory } from "./categories";
import { baseUrls, qs, venueHttp, HttpError, realClock, type Clock, type HttpClient, type Priority } from "./http";
import { bool, epochMs, isObject, list, num, objList, pick, rows, slugify, str, type JsonObject } from "./parse";
import { kalshiStrike, strikeFromText, subjectFromKalshiSeries } from "./strike";
import { chunk, SWEEP_TTL_MS, TtlCache, type BookOptions, type ListOptions, type Sweep, type VenueClient } from "./venue";

/** GET /markets page size (Kalshi's documented maximum). */
export const MARKETS_PAGE_LIMIT = 1000;
/** GET /events page size (Kalshi's documented maximum). */
export const EVENTS_PAGE_LIMIT = 200;
/** Hard stop for cursor loops (a server that keeps returning a cursor must not loop forever). */
export const MAX_PAGES = 500;
/** Tickers per GET /markets/orderbooks request (unverified endpoint; documented max believed to be 100). */
export const ORDERBOOK_BATCH = 100;
/** Exclude multivariate (combo / parlay) markets from the sweep: they are thousands of illiquid one-offs. */
export const EXCLUDE_MULTIVARIATE = true;
/** Series metadata (fee multiplier) changes rarely: re-read every 6 hours. */
export const SERIES_TTL_MS = 6 * 60 * 60 * 1000;
/** Kalshi's default fee multiplier when a series states none (lib/fees.ts KALSHI_DEFAULT_MULTIPLIER). */
export const DEFAULT_FEE_MULTIPLIER = 1;
/** Web origin for deep links. */
export const KALSHI_WEB = "https://kalshi.com";

/* ---------- Order book ---------- */

/** Levels from one side of a Kalshi orderbook: the dollar field ("yes_dollars": [["0.4500", 100]]) when present,
 *  else the integer-cent field ("yes": [[45, 100]]). A dollar field holding values above 1 is read as cents. */
function kalshiSide(ob: JsonObject, side: Side): ReturnType<typeof readLevels> {
  const dollars = ob[`${side}_dollars`];
  if (Array.isArray(dollars) && dollars.length > 0) {
    const looksLikeCents = dollars.some(l => Array.isArray(l) && (num(l[0]) ?? 0) > 1);
    return readLevels(dollars, looksLikeCents ? 100 : 1);
  }
  const cents = ob[side];
  if (Array.isArray(cents)) {
    const looksLikeDollars = cents.length > 0 && cents.every(l => Array.isArray(l) && (num(l[0]) ?? 0) < 1);
    return readLevels(cents, looksLikeDollars ? 1 : 100);
  }
  return [];
}

/** The orderbook object inside a response: {orderbook_fp: {...}} (newer fixed-point fields) or {orderbook: {...}},
 *  or the bare object. */
function orderbookObject(raw: unknown): JsonObject | null {
  if (!isObject(raw)) return null;
  for (const k of ["orderbook_fp", "orderbook"]) {
    const v = raw[k];
    if (isObject(v)) return v;
  }
  return raw;
}

/** A full Book from Kalshi's bids-only orderbook. Pure. */
export function deriveKalshiBook(raw: unknown, fetchedAt: number): Book {
  const ob = orderbookObject(raw);
  if (!ob) return { yesAsks: [], noAsks: [], yesBids: [], noBids: [], fetchedAt, hash: null };
  const yesBids = sortBids(kalshiSide(ob, "yes"));
  const noBids = sortBids(kalshiSide(ob, "no"));
  return {
    // Best (highest) NO bid → cheapest YES ask; sortAsks re-orders after the complement.
    yesAsks: sortAsks(complement(noBids)),
    noAsks: sortAsks(complement(yesBids)),
    yesBids,
    noBids,
    fetchedAt,
    // Kalshi's REST orderbook carries no hash.
    hash: null,
  };
}

/* ---------- Series ---------- */

export interface KalshiSeries {
  ticker: string;
  title: string | null;
  category: string | null;
  tags: string[];
  /** "quadratic", "quadratic_with_maker_fees", "flat", or null. */
  feeType: string | null;
  feeMultiplier: number;
  settlementSources: Array<{ name: string | null; url: string | null }>;
}

export function readKalshiSeries(raw: unknown): KalshiSeries | null {
  const s = isObject(raw) && isObject(raw.series) ? raw.series : raw;
  if (!isObject(s)) return null;
  const ticker = str(s.ticker) ?? str(s.series_ticker);
  if (!ticker) return null;
  const mult = num(s.fee_multiplier);
  return {
    ticker,
    title: str(s.title),
    category: str(s.category),
    tags: list(s.tags)
      .map(t => (isObject(t) ? (str(t.label) ?? str(t.name)) : str(t)))
      .filter((x): x is string => x !== null),
    feeType: str(s.fee_type),
    feeMultiplier: mult !== null && mult >= 0 ? mult : DEFAULT_FEE_MULTIPLIER,
    settlementSources: objList(s.settlement_sources).map(x => ({ name: str(x.name), url: str(x.url) })),
  };
}

/* ---------- Events and markets ---------- */

export interface KalshiEventInfo {
  ticker: string;
  seriesTicker: string | null;
  title: string | null;
  subTitle: string | null;
  category: string | null;
  mutuallyExclusive: boolean;
  strikeDate: number | null;
  /** Nested markets when the response included them (with_nested_markets=true). */
  markets: JsonObject[];
}

export function readKalshiEventInfo(raw: unknown): KalshiEventInfo | null {
  if (!isObject(raw)) return null;
  const ticker = str(raw.event_ticker) ?? str(raw.ticker);
  if (!ticker) return null;
  return {
    ticker,
    seriesTicker: str(raw.series_ticker),
    title: str(raw.title),
    subTitle: str(raw.sub_title) ?? str(raw.subtitle),
    category: str(raw.category),
    mutuallyExclusive: bool(raw.mutually_exclusive),
    strikeDate: epochMs(raw.strike_date),
    markets: objList(raw.markets),
  };
}

/** The series ticker: stated on the market or event, else the event ticker's first dash-separated part
 *  (KXFEDDECISION-25DEC → KXFEDDECISION), which is Kalshi's naming convention. */
export function seriesTickerOf(market: JsonObject, event: KalshiEventInfo | null): string | null {
  const stated = str(market.series_ticker) ?? event?.seriesTicker ?? null;
  if (stated) return stated;
  const et = str(market.event_ticker) ?? event?.ticker ?? null;
  return et ? (et.split("-")[0] ?? null) : null;
}

/** Deep link. Kalshi's web URLs look like /markets/<series>/<series-title-slug>/<event-ticker>, all lower case;
 *  Kalshi redirects a wrong or missing slug segment. Best effort: unverified. */
export function kalshiUrl(seriesTicker: string | null, title: string | null, eventTicker: string): string {
  const ev = eventTicker.toLowerCase();
  if (!seriesTicker) return `${KALSHI_WEB}/markets/${ev}`;
  const slug = title ? slugify(title) : "";
  return `${KALSHI_WEB}/markets/${seriesTicker.toLowerCase()}/${slug || "market"}/${ev}`;
}

function result(v: unknown): Side | "void" | null {
  const r = str(v)?.toLowerCase();
  if (r === "yes") return "yes";
  if (r === "no") return "no";
  if (r === "void" || r === "voided" || r === "cancelled" || r === "canceled") return "void";
  return null;
}

/** Statuses Kalshi uses for markets that are trading. /markets?status=open returns "active" ("open" in older docs). */
const TRADING_STATUSES = new Set(["active", "open"]);

export interface KalshiMarketContext {
  event?: KalshiEventInfo | null;
  series?: KalshiSeries | null;
}

/** One Kalshi market → VMarket. Null for non-binary markets or rows without a ticker. Pure. */
export function readKalshiMarket(m: JsonObject, ctx: KalshiMarketContext = {}): VMarket | null {
  const ticker = str(m.ticker);
  const eventTicker = str(m.event_ticker) ?? ctx.event?.ticker ?? null;
  if (!ticker || !eventTicker) return null;
  const marketType = str(m.market_type)?.toLowerCase();
  if (marketType && marketType !== "binary") return null;
  const event = ctx.event ?? null;
  const series = ctx.series ?? null;
  const seriesTicker = seriesTickerOf(m, event) ?? series?.ticker ?? null;

  const yesSub = str(m.yes_sub_title);
  const noSub = str(m.no_sub_title);
  const rules = [str(m.rules_primary), str(m.rules_secondary)].filter((x): x is string => x !== null).join("\n\n");
  const sources = (series?.settlementSources ?? [])
    .map(s => (s.name && s.url ? `${s.name} (${s.url})` : (s.name ?? s.url)))
    .filter((x): x is string => x !== null);

  const subject = subjectFromKalshiSeries(seriesTicker);
  const strike =
    kalshiStrike(m.strike_type, m.floor_strike, m.cap_strike, subject) ??
    (yesSub ? strikeFromText(yesSub, event?.title ?? str(m.title) ?? "") : null);

  const status = str(m.status)?.toLowerCase();
  const fee: FeeModel = { venue: "kalshi", multiplier: series?.feeMultiplier ?? DEFAULT_FEE_MULTIPLIER };
  const title = str(m.title) ?? event?.title ?? ticker;
  const eventTitle = event?.title && event.title !== title ? event.title : null;

  return {
    venue: "kalshi",
    id: ticker,
    eventId: eventTicker,
    seriesId: seriesTicker,
    title,
    eventTitle,
    yesLabel: yesSub ?? "Yes",
    noLabel: noSub && noSub !== yesSub ? noSub : "No",
    rules,
    resolutionSource: sources.length ? sources.join("; ") : null,
    // Expected settlement first (capital is tied up until then); close_time is often a far-off "closes early" cap.
    closeTime: epochMs(m.expected_expiration_time) ?? epochMs(m.close_time) ?? epochMs(m.expiration_time),
    category: kalshiCategory(event?.category, series?.category, str(m.category), ...(series?.tags ?? [])),
    fee,
    url: kalshiUrl(seriesTicker, series?.title ?? event?.title ?? null, eventTicker),
    yesTokenId: null,
    noTokenId: null,
    strike,
    active: status === undefined || TRADING_STATUSES.has(status),
    result: result(m.result),
    volume24h: num(pick(m, "volume_24h_fp", "volume_24h")),
  };
}

/** Kalshi multivariate (combo) markets: flagged by an MVE collection ticker or the KXMVE ticker prefix. */
export function isMultivariate(m: JsonObject): boolean {
  return str(m.mve_collection_ticker) !== null || /^KXMVE/i.test(str(m.ticker) ?? "") || /^KXMVE/i.test(str(m.event_ticker) ?? "");
}

/** VEvent for an event and the markets of it we kept. exhaustive is false: Kalshi's mutually_exclusive says at
 *  most one market resolves YES, but nothing in the API says the listed strikes cover every outcome. */
export function toKalshiEvent(info: KalshiEventInfo, markets: readonly VMarket[], series: KalshiSeries | null): VEvent {
  const closes = markets.map(m => m.closeTime).filter((t): t is number => t !== null);
  return {
    venue: "kalshi",
    id: info.ticker,
    title: info.title ?? markets[0]?.eventTitle ?? markets[0]?.title ?? info.ticker,
    category: kalshiCategory(info.category, series?.category, ...(series?.tags ?? [])),
    marketIds: markets.map(m => m.id),
    mutuallyExclusive: info.mutuallyExclusive,
    exhaustive: false,
    closeTime: closes.length ? Math.max(...closes) : info.strikeDate,
  };
}

/** Assemble a sweep from raw pages. Pure. */
export function buildKalshiSweep(
  rawMarkets: readonly JsonObject[],
  eventInfos: ReadonlyMap<string, KalshiEventInfo>,
  series: ReadonlyMap<string, KalshiSeries>,
  fetchedAt: number,
): Sweep {
  const markets: VMarket[] = [];
  const byEvent = new Map<string, VMarket[]>();
  const seen = new Set<string>();
  for (const raw of rawMarkets) {
    if (EXCLUDE_MULTIVARIATE && isMultivariate(raw)) continue;
    const et = str(raw.event_ticker);
    const info = et ? (eventInfos.get(et) ?? null) : null;
    const st = seriesTickerOf(raw, info);
    const m = readKalshiMarket(raw, { event: info, series: st ? (series.get(st) ?? null) : null });
    if (!m || !m.active || seen.has(m.id)) continue;
    seen.add(m.id);
    markets.push(m);
    const list = byEvent.get(m.eventId) ?? [];
    list.push(m);
    byEvent.set(m.eventId, list);
  }
  const events: VEvent[] = [];
  for (const [eventId, ms] of byEvent) {
    const info: KalshiEventInfo = eventInfos.get(eventId) ?? {
      ticker: eventId,
      seriesTicker: ms[0]?.seriesId ?? null,
      title: ms[0]?.eventTitle ?? null,
      subTitle: null,
      category: null,
      mutuallyExclusive: false,
      strikeDate: null,
      markets: [],
    };
    const st = info.seriesTicker ?? ms[0]?.seriesId ?? null;
    events.push(toKalshiEvent(info, ms, st ? (series.get(st) ?? null) : null));
  }
  return { markets, events, fetchedAt };
}

/* ---------- Client ---------- */

export interface KalshiClientOptions {
  http?: HttpClient;
  baseUrl?: string;
  clock?: Clock;
}

export class KalshiClient implements VenueClient {
  readonly venue = "kalshi" as const;
  private readonly http: HttpClient;
  private readonly base: string;
  private readonly clock: Clock;
  private readonly sweepCache: TtlCache<Sweep>;
  private readonly seriesCache = new Map<string, { at: number; s: KalshiSeries | null }>();
  private seriesListAt = 0;
  /** null until tried; false after the batch orderbook endpoint answered 404/400. */
  private batchOrderbooks: boolean | null = null;

  constructor(o: KalshiClientOptions = {}) {
    this.http = o.http ?? venueHttp("kalshi");
    this.base = (o.baseUrl ?? baseUrls().kalshi).replace(/\/+$/, "");
    this.clock = o.clock ?? realClock;
    this.sweepCache = new TtlCache<Sweep>(SWEEP_TTL_MS, this.clock);
  }

  /** Follow Kalshi's cursor until it is empty (or repeats, or MAX_PAGES). */
  private async paginate(path: string, params: Record<string, string | number | boolean | undefined>, key: string, priority: Priority): Promise<JsonObject[]> {
    const out: JsonObject[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const raw = await this.http.json(`${this.base}${path}${qs({ ...params, cursor })}`, { priority });
      out.push(...rows(raw, [key]));
      const next = isObject(raw) ? str(raw.cursor) : null;
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
    return out;
  }

  /** Raw open markets (GET /markets?status=open, limit 1000, cursor pagination). */
  listOpenMarketsRaw(priority: Priority = "normal"): Promise<JsonObject[]> {
    return this.paginate("/markets", { status: "open", limit: MARKETS_PAGE_LIMIT, mve_filter: EXCLUDE_MULTIVARIATE ? "exclude" : undefined }, "markets", priority);
  }

  /** Open events without nested markets (GET /events?status=open, limit 200). */
  async listOpenEventInfos(priority: Priority = "normal"): Promise<Map<string, KalshiEventInfo>> {
    const raw = await this.paginate("/events", { status: "open", limit: EVENTS_PAGE_LIMIT }, "events", priority);
    const out = new Map<string, KalshiEventInfo>();
    for (const r of raw) {
      const e = readKalshiEventInfo(r);
      if (e) out.set(e.ticker, e);
    }
    return out;
  }

  /** One event with its markets (GET /events/{ticker}?with_nested_markets=true). */
  async getEvent(eventTicker: string, priority: Priority = "normal"): Promise<{ event: VEvent; markets: VMarket[] } | null> {
    const raw = await this.http.json(`${this.base}/events/${encodeURIComponent(eventTicker)}${qs({ with_nested_markets: true })}`, { priority });
    if (!isObject(raw)) return null;
    const info = readKalshiEventInfo(isObject(raw.event) ? raw.event : raw);
    if (!info) return null;
    // Nested under event.markets (with_nested_markets) or, in older responses, a sibling top-level markets array.
    const rawMarkets = info.markets.length ? info.markets : objList(raw.markets);
    const st = info.seriesTicker ?? (rawMarkets[0] ? seriesTickerOf(rawMarkets[0], info) : null);
    const series = st ? await this.getSeries(st, priority) : null;
    const markets = rawMarkets.map(m => readKalshiMarket(m, { event: info, series })).filter((m): m is VMarket => m !== null);
    return { event: toKalshiEvent(info, markets.filter(m => m.active), series), markets };
  }

  /** One series (GET /series/{ticker}), cached for SERIES_TTL_MS. */
  async getSeries(seriesTicker: string, priority: Priority = "normal"): Promise<KalshiSeries | null> {
    const hit = this.seriesCache.get(seriesTicker);
    const now = this.clock.now();
    if (hit && now - hit.at < SERIES_TTL_MS) return hit.s;
    const s = readKalshiSeries(await this.http.json(`${this.base}/series/${encodeURIComponent(seriesTicker)}`, { priority }));
    this.seriesCache.set(seriesTicker, { at: now, s });
    return s;
  }

  /** Every series in one request (GET /series), refreshing the per-series cache. False if the list failed. */
  private async loadSeriesList(priority: Priority): Promise<boolean> {
    const now = this.clock.now();
    if (now - this.seriesListAt < SERIES_TTL_MS) return true;
    try {
      const raw = await this.http.json(`${this.base}/series`, { priority });
      const list = rows(raw, ["series"]).map(readKalshiSeries).filter((s): s is KalshiSeries => s !== null);
      if (list.length === 0) return false;
      for (const s of list) this.seriesCache.set(s.ticker, { at: now, s });
      this.seriesListAt = now;
      return true;
    } catch {
      return false;
    }
  }

  /** Series metadata for these tickers: the bulk list when it works, else one request per uncached series. */
  async getSeriesMap(tickers: Iterable<string>, priority: Priority = "normal"): Promise<Map<string, KalshiSeries>> {
    await this.loadSeriesList(priority);
    const out = new Map<string, KalshiSeries>();
    await Promise.all(
      [...new Set(tickers)].map(async t => {
        try {
          const s = await this.getSeries(t, priority);
          if (s) out.set(t, s);
        } catch {
          // Unknown series: the market keeps the default fee multiplier.
        }
      }),
    );
    return out;
  }

  /** Full sweep: open markets + open events + series, normalised. */
  sweep(opts: ListOptions = {}): Promise<Sweep> {
    const priority = opts.priority ?? "normal";
    return this.sweepCache.get(async () => {
      const [rawMarkets, events] = await Promise.all([this.listOpenMarketsRaw(priority), this.listOpenEventInfos(priority)]);
      const tickers = new Set<string>();
      for (const m of rawMarkets) {
        const et = str(m.event_ticker);
        const st = seriesTickerOf(m, et ? (events.get(et) ?? null) : null);
        if (st) tickers.add(st);
      }
      const series = await this.getSeriesMap(tickers, priority);
      return buildKalshiSweep(rawMarkets, events, series, this.clock.now());
    }, opts.refresh);
  }

  /** Normalised open markets (the VenueClient sweep). */
  async listOpenMarkets(opts: ListOptions = {}): Promise<VMarket[]> {
    return (await this.sweep(opts)).markets;
  }

  async listMarkets(opts: ListOptions = {}): Promise<VMarket[]> {
    return (await this.sweep(opts)).markets;
  }

  async listEvents(opts: ListOptions = {}): Promise<VEvent[]> {
    return (await this.sweep(opts)).events;
  }

  /** One book (GET /markets/{ticker}/orderbook). Null when the market does not exist. */
  async getOrderbook(ticker: string, priority: Priority = "normal"): Promise<Book | null> {
    const raw = await this.http.json(`${this.base}/markets/${encodeURIComponent(ticker)}/orderbook`, { priority });
    return raw === null ? null : deriveKalshiBook(raw, this.clock.now());
  }

  /** Several books: GET /markets/orderbooks in batches of ORDERBOOK_BATCH when Kalshi supports it, else one by one.
   *  Tickers whose book fails are left out. */
  async getOrderbooks(tickers: readonly string[], priority: Priority = "normal"): Promise<Map<string, Book>> {
    const out = new Map<string, Book>();
    let remaining = [...new Set(tickers)];
    if (this.batchOrderbooks !== false && remaining.length > 1) {
      const missed: string[] = [];
      for (const group of chunk(remaining, ORDERBOOK_BATCH)) {
        if (this.batchOrderbooks === false) {
          missed.push(...group);
          continue;
        }
        try {
          const raw = await this.http.json(`${this.base}/markets/orderbooks${qs({ tickers: group.join(",") })}`, { priority });
          const list = rows(raw, ["orderbooks"]);
          if (raw === null || (list.length === 0 && !(isObject(raw) && Array.isArray(raw.orderbooks)))) {
            this.batchOrderbooks = false;
            missed.push(...group);
            continue;
          }
          this.batchOrderbooks = true;
          const now = this.clock.now();
          for (const r of list) {
            const t = str(r.ticker) ?? str(r.market_ticker);
            if (t) out.set(t, deriveKalshiBook(r, now));
          }
          for (const t of group) if (!out.has(t)) missed.push(t);
        } catch (err) {
          if (err instanceof HttpError && (err.status === 400 || err.status === 404 || err.status === 405)) this.batchOrderbooks = false;
          missed.push(...group);
        }
      }
      remaining = missed;
    }
    await Promise.all(
      remaining.map(async t => {
        try {
          const b = await this.getOrderbook(t, priority);
          if (b) out.set(t, b);
        } catch {
          // Left out: the caller treats a missing book as "no liquidity known".
        }
      }),
    );
    return out;
  }

  async getBooks(markets: readonly VMarket[], opts: BookOptions = {}): Promise<Map<string, Book>> {
    const tickers = markets.filter(m => m.venue === "kalshi").map(m => m.id);
    return this.getOrderbooks(tickers, opts.priority ?? "normal");
  }
}

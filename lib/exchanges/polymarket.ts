/* Polymarket (international) public APIs, no key:
 *
 *   Gamma  GET  /events?active=true&closed=false&limit=…&offset=…   events with nested markets (the sweep)
 *          GET  /markets?active=true&closed=false&limit=…&offset=…  markets (helper)
 *   CLOB   POST /books   [{token_id}] (≤ 500)                        books for many tokens
 *          GET  /book?token_id=…                                     one book (fallback)
 *          GET  /midpoint?token_id=…, GET /price?token_id=…&side=…   price helpers
 *          WSS  /ws/market  {assets_ids, type:"market"}              "book" / "price_change" pushes
 *   Data   GET  /trades?filterType=CASH&filterAmount=…&takerOnly=true   large trades (whales)
 *          GET  /positions?user=…, GET /v2/activity?user=…           a wallet's public positions and history
 *
 * Every Polymarket market is binary at the CLOB level: two outcome tokens. The YES book comes from the first
 * outcome's token, the NO book from the second's (the NO token's asks are NO asks). Raw responses are read
 * defensively and leave this file only as lib/types.ts shapes (plus the typed wallet rows below). */
import { polymarketRate } from "@/lib/fees";
import type { Book, FeeModel, Level, Side, VEvent, Venue, VMarket, WhaleTrade } from "@/lib/types";
import { bookDigest, complement, readLevels, sortAsks, sortBids } from "./book";
import { normaliseCategory, type Category } from "./categories";
import { baseUrls, qs, realClock, venueHttp, type Clock, type HttpClient, type Priority } from "./http";
import { bool, boolOrNull, epochMs, isObject, list, num, objList, pick, rows, str, strList, type JsonObject } from "./parse";
import { strikeFromText } from "./strike";
import { chunk, SWEEP_TTL_MS, TtlCache, type BookOptions, type ListOptions, type Sweep, type VenueClient } from "./venue";

/** Gamma /events page size (offset pagination). Events carry their markets, so pages are kept moderate. */
export const GAMMA_EVENTS_PAGE_LIMIT = 100;
/** Hard stop for offset loops. */
export const GAMMA_MAX_PAGES = 300;
/** CLOB POST /books: at most this many token ids per request (documented). */
export const CLOB_BOOKS_BATCH = 500;
/** Whale threshold: trades of at least this many dollars. */
export const WHALE_MIN_CASH = 10_000;
/** Data API page size. */
export const DATA_PAGE_LIMIT = 500;
/** Data API wallet pagination stop. */
export const DATA_MAX_PAGES = 20;
/** Websocket keep-alive: Polymarket expects a text "PING" about every 10 seconds. */
export const WS_PING_INTERVAL_MS = 10_000;
/** Reconnect backoff: 1s, 2s, 4s … capped (deterministic). */
export const WS_RECONNECT_BASE_MS = 1_000;
export const WS_RECONNECT_CAP_MS = 30_000;
/** After this many consecutive failed connections, watchBooks switches to polling. */
export const WS_FAILURES_BEFORE_POLLING = 3;
/** Polling fallback interval. */
export const POLL_INTERVAL_MS = 5_000;
/** Web origin for deep links. */
export const POLYMARKET_WEB = "https://polymarket.com";

/* ---------- Gamma ---------- */

export interface GammaEventContext {
  id: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  resolutionSource: string | null;
  endDate: number | null;
  category: Category;
  negRisk: boolean;
  negRiskAugmented: boolean;
}

/** Labels (tag labels and slugs, category fields) a market or event carries, for category normalisation. */
function categoryLabels(o: JsonObject | null | undefined): string[] {
  if (!o) return [];
  const out: string[] = [];
  for (const t of list(o.tags)) {
    if (isObject(t)) {
      const l = str(t.label) ?? str(t.name);
      const s = str(t.slug);
      if (l) out.push(l);
      if (s) out.push(s);
    } else {
      const s = str(t);
      if (s) out.push(s);
    }
  }
  for (const k of ["category", "subcategory"]) {
    const s = str(o[k]);
    if (s) out.push(s);
  }
  return out;
}

export function gammaCategory(event: JsonObject | null, market?: JsonObject | null): Category {
  return normaliseCategory([...categoryLabels(event), ...categoryLabels(market)]);
}

export function readGammaEventContext(e: JsonObject): GammaEventContext | null {
  const id = str(e.id) ?? str(e.slug);
  if (!id) return null;
  const markets = objList(e.markets);
  return {
    id,
    slug: str(e.slug),
    title: str(e.title),
    description: str(e.description),
    resolutionSource: str(e.resolutionSource),
    endDate: epochMs(pick(e, "endDate", "endDateIso")),
    category: gammaCategory(e),
    negRisk: bool(e.negRisk) || bool(e.enableNegRisk) || markets.some(m => bool(m.negRisk)),
    // Augmented neg-risk: Polymarket may add outcomes later (and lists placeholder / "Other" markets).
    negRiskAugmented: bool(e.negRiskAugmented) || markets.some(m => bool(m.negRiskAugmented) || bool(m.negRiskOther)),
  };
}

const isYes = (s: string) => s.trim().toLowerCase() === "yes";
const isNo = (s: string) => s.trim().toLowerCase() === "no";

export function polymarketUrl(eventSlug: string | null, marketSlug: string | null): string {
  if (eventSlug && marketSlug) return `${POLYMARKET_WEB}/event/${eventSlug}/${marketSlug}`;
  if (eventSlug) return `${POLYMARKET_WEB}/event/${eventSlug}`;
  if (marketSlug) return `${POLYMARKET_WEB}/market/${marketSlug}`;
  return POLYMARKET_WEB;
}

/** Settled result from outcomePrices once closed: [1,0] YES, [0,1] NO, [0.5,0.5] void (50-50 refund). */
function gammaResult(m: JsonObject): Side | "void" | null {
  if (!bool(m.closed)) return null;
  const prices = list(m.outcomePrices).map(num);
  const [a, b] = prices;
  if (a == null || b == null) return null;
  if (a >= 0.99 && b <= 0.01) return "yes";
  if (b >= 0.99 && a <= 0.01) return "no";
  if (Math.abs(a - 0.5) < 0.01 && Math.abs(b - 0.5) < 0.01) return "void";
  return null;
}

/** The event a /markets row is embedded in (markets carry events: [{…}]). */
function embeddedEvent(m: JsonObject): JsonObject | null {
  return objList(m.events)[0] ?? null;
}

/** One Gamma market → VMarket. Null unless it is a binary CLOB market with two token ids. Pure. `venue` lets the
 *  Polymarket US client reuse this reader when its payload is Gamma-shaped. */
/** Deep-link builder (eventSlug, marketSlug) → URL; Polymarket US passes its own. */
export type UrlFor = (eventSlug: string | null, marketSlug: string | null) => string;

export function readGammaMarket(m: JsonObject, ctx: GammaEventContext | null, venue: Venue = "polymarket", urlFor: UrlFor = polymarketUrl): VMarket | null {
  const conditionId = str(m.conditionId) ?? str(m.condition_id);
  if (!conditionId) return null;
  const outcomes = strList(m.outcomes);
  const tokens = strList(pick(m, "clobTokenIds", "clob_token_ids"));
  const yesTokenId = tokens[0] ?? null;
  const noTokenId = tokens[1] ?? null;
  if (outcomes.length !== 0 && outcomes.length !== 2) return null;
  if (tokens.length !== 0 && tokens.length !== 2) return null;

  const ev = ctx ?? (embeddedEvent(m) ? readGammaEventContext(embeddedEvent(m) as JsonObject) : null);
  const o0 = outcomes[0] ?? "Yes";
  const o1 = outcomes[1] ?? "No";
  const yesNo = isYes(o0) && isNo(o1);
  const group = str(m.groupItemTitle);
  const question = str(m.question) ?? str(m.title) ?? group ?? conditionId;
  const category: Category = ctx ? normaliseCategory([ctx.category, ...categoryLabels(m)]) : gammaCategory(embeddedEvent(m), m);
  const fee: FeeModel = { venue: venue === "polymarket_us" ? "polymarket_us" : "polymarket", rate: polymarketRate(category) };
  const acceptingOrders = boolOrNull(m.acceptingOrders);
  const enableOrderBook = boolOrNull(m.enableOrderBook);
  const marketActive = boolOrNull(m.active);

  return {
    venue,
    id: conditionId,
    eventId: ev?.id ?? str(m.id) ?? conditionId,
    seriesId: null,
    title: question,
    eventTitle: ev?.title && ev.title !== question ? ev.title : null,
    // Yes/No markets: the YES contract pays on the group item ("Trump", "↑ 120,000") when the market is part of a
    // multi-market event. Other binaries (["Lakers","Celtics"]): YES is the first outcome, NO the second.
    yesLabel: yesNo ? (group ?? "Yes") : o0,
    noLabel: yesNo ? "No" : o1,
    rules: str(m.description) ?? ev?.description ?? "",
    resolutionSource: str(m.resolutionSource) ?? ev?.resolutionSource ?? null,
    closeTime: epochMs(pick(m, "endDate", "endDateIso")) ?? ev?.endDate ?? null,
    category,
    fee,
    url: urlFor(ev?.slug ?? null, str(m.slug)),
    yesTokenId,
    noTokenId,
    strike: yesNo ? strikeFromText(group ?? question, ev?.title ?? question) : null,
    active:
      marketActive !== false &&
      !bool(m.closed) &&
      !bool(m.archived) &&
      acceptingOrders !== false &&
      enableOrderBook !== false &&
      yesTokenId !== null &&
      noTokenId !== null,
    result: gammaResult(m),
    volume24h: num(pick(m, "volume24hr", "volume24hrClob", "volume_24hr")),
  };
}

/** One Gamma event → VEvent + all its parsed markets (active or not). Pure.
 *  mutuallyExclusive: negRisk (winner-take-all). exhaustive: negRisk, NOT augmented (no outcomes can be added),
 *  at least two tradeable markets, and every market of the event is either in marketIds or already resolved NO,
 *  so exactly one listed market can still resolve YES. */
export function readGammaEvent(e: unknown, venue: Venue = "polymarket", urlFor: UrlFor = polymarketUrl): { event: VEvent; markets: VMarket[] } | null {
  if (!isObject(e)) return null;
  const ctx = readGammaEventContext(e);
  if (!ctx) return null;
  const raw = objList(e.markets);
  const markets: VMarket[] = [];
  let unaccounted = 0;
  for (const r of raw) {
    const m = readGammaMarket(r, ctx, venue, urlFor);
    if (!m) {
      unaccounted++;
      continue;
    }
    markets.push(m);
    if (!m.active && m.result !== "no") unaccounted++;
  }
  const active = markets.filter(m => m.active);
  const closes = active.map(m => m.closeTime).filter((t): t is number => t !== null);
  return {
    event: {
      venue,
      id: ctx.id,
      title: ctx.title ?? active[0]?.title ?? ctx.id,
      category: ctx.category,
      marketIds: active.map(m => m.id),
      mutuallyExclusive: ctx.negRisk,
      exhaustive: ctx.negRisk && !ctx.negRiskAugmented && active.length >= 2 && unaccounted === 0,
      closeTime: closes.length ? Math.max(...closes) : ctx.endDate,
    },
    markets,
  };
}

/** Assemble a sweep from raw Gamma event pages (de-duplicated: offset pages can overlap). Pure. */
export function buildGammaSweep(rawEvents: readonly unknown[], fetchedAt: number, venue: Venue = "polymarket"): Sweep {
  const markets: VMarket[] = [];
  const events: VEvent[] = [];
  const seenEvents = new Set<string>();
  const seenMarkets = new Set<string>();
  for (const raw of rawEvents) {
    const r = readGammaEvent(raw, venue);
    if (!r || seenEvents.has(r.event.id)) continue;
    seenEvents.add(r.event.id);
    const kept = r.markets.filter(m => m.active && !seenMarkets.has(m.id));
    for (const m of kept) seenMarkets.add(m.id);
    markets.push(...kept);
    if (kept.length > 0) events.push({ ...r.event, marketIds: r.event.marketIds.filter(id => kept.some(m => m.id === id)) });
  }
  return { markets, events, fetchedAt };
}

/* ---------- CLOB books ---------- */

/** One outcome token's book as the CLOB sends it. */
export interface TokenBook {
  tokenId: string;
  conditionId: string | null;
  /** Highest first. */
  bids: Level[];
  /** Cheapest first. */
  asks: Level[];
  hash: string | null;
  /** Server timestamp (ms), when sent. */
  timestamp: number | null;
  tickSize: number | null;
  minOrderSize: number | null;
}

export function readClobBook(raw: unknown): TokenBook | null {
  if (!isObject(raw)) return null;
  const tokenId = str(raw.asset_id) ?? str(raw.token_id) ?? str(raw.assetId);
  if (!tokenId) return null;
  return {
    tokenId,
    conditionId: str(raw.market),
    // The CLOB lists bids ascending and asks descending (best last); sort defensively, best first.
    bids: sortBids(readLevels(raw.bids)),
    asks: sortAsks(readLevels(raw.asks)),
    hash: str(raw.hash),
    timestamp: epochMs(raw.timestamp),
    tickSize: num(raw.tick_size),
    minOrderSize: num(raw.min_order_size),
  };
}

/** A market's Book from its YES-token and NO-token books. When one side is missing it is mirrored from the other
 *  (the CLOB matches YES and NO against each other, so a YES bid at p is a NO ask at 1 − p). Null when both are
 *  missing. Pure. */
export function combineTokenBooks(yes: TokenBook | null, no: TokenBook | null, fetchedAt: number): Book | null {
  if (!yes && !no) return null;
  const yesBids = yes ? yes.bids : sortBids(complement(no?.asks ?? []));
  const yesAsks = yes ? yes.asks : sortAsks(complement(no?.bids ?? []));
  const noBids = no ? no.bids : sortBids(complement(yes?.asks ?? []));
  const noAsks = no ? no.asks : sortAsks(complement(yes?.bids ?? []));
  const hash = yes?.hash || no?.hash ? `${yes?.hash ?? ""}:${no?.hash ?? ""}` : null;
  return { yesAsks, noAsks, yesBids, noBids, fetchedAt, hash };
}

/* ---------- Data API ---------- */

/** A display name only when the profile shows one; never the wallet address itself. */
export function displayName(r: JsonObject): string | null {
  const usable = (s: string | null) => (s && !/^0x[0-9a-f]{6,}/i.test(s) ? s : null);
  const name = str(r.name);
  const pseudonym = str(r.pseudonym);
  if (r.displayUsernamePublic !== false && usable(name)) return usable(name);
  return usable(pseudonym) ?? usable(name);
}

function tradeSide(v: unknown): "BUY" | "SELL" | null {
  const s = str(v)?.toUpperCase();
  return s === "BUY" || s === "SELL" ? s : null;
}

/** Data API /trades rows → WhaleTrade[] (rows without wallet, side, size, price or time are dropped). Pure. */
export function readWhaleTrades(raw: unknown, minCash = 0): WhaleTrade[] {
  const out: WhaleTrade[] = [];
  for (const t of rows(raw)) {
    const wallet = str(t.proxyWallet) ?? str(t.wallet);
    const side = tradeSide(t.side);
    const contracts = num(t.size);
    const price = num(t.price);
    const timestamp = epochMs(t.timestamp);
    const marketId = str(t.conditionId) ?? str(t.market);
    if (!wallet || !side || contracts === null || price === null || timestamp === null || !marketId) continue;
    const cash = contracts * price;
    if (cash < minCash) continue;
    out.push({
      venue: "polymarket",
      wallet,
      name: displayName(t),
      marketId,
      marketTitle: str(t.title) ?? marketId,
      outcome: str(t.outcome) ?? (num(t.outcomeIndex) === 1 ? "No" : "Yes"),
      side,
      contracts,
      price,
      cash,
      timestamp,
      txHash: str(t.transactionHash),
      url: polymarketUrl(str(t.eventSlug), str(t.slug)),
    });
  }
  return out;
}

/** A wallet's open position (Data API /positions). */
export interface PolymarketPosition {
  wallet: string;
  conditionId: string;
  tokenId: string | null;
  title: string;
  outcome: string | null;
  outcomeIndex: number | null;
  /** Contracts held. */
  size: number;
  avgPrice: number | null;
  initialValue: number | null;
  currentValue: number | null;
  cashPnl: number | null;
  percentPnl: number | null;
  realizedPnl: number | null;
  curPrice: number | null;
  redeemable: boolean;
  mergeable: boolean;
  negativeRisk: boolean;
  endDate: number | null;
  url: string;
}

export function readPositions(raw: unknown): PolymarketPosition[] {
  const out: PolymarketPosition[] = [];
  for (const p of rows(raw)) {
    const wallet = str(p.proxyWallet) ?? str(p.user);
    const conditionId = str(p.conditionId);
    const size = num(p.size);
    if (!wallet || !conditionId || size === null) continue;
    out.push({
      wallet,
      conditionId,
      tokenId: str(p.asset),
      title: str(p.title) ?? conditionId,
      outcome: str(p.outcome),
      outcomeIndex: num(p.outcomeIndex),
      size,
      avgPrice: num(p.avgPrice),
      initialValue: num(p.initialValue),
      currentValue: num(p.currentValue),
      cashPnl: num(p.cashPnl),
      percentPnl: num(p.percentPnl),
      realizedPnl: num(p.realizedPnl),
      curPrice: num(p.curPrice),
      redeemable: bool(p.redeemable),
      mergeable: bool(p.mergeable),
      negativeRisk: bool(p.negativeRisk),
      endDate: epochMs(p.endDate),
      url: polymarketUrl(str(p.eventSlug), str(p.slug)),
    });
  }
  return out;
}

/** One row of a wallet's history (Data API /v2/activity): TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, … */
export interface PolymarketActivity {
  wallet: string;
  timestamp: number;
  type: string;
  conditionId: string | null;
  tokenId: string | null;
  side: "BUY" | "SELL" | null;
  /** Contracts. */
  size: number | null;
  /** Dollars. */
  usdcSize: number | null;
  price: number | null;
  outcome: string | null;
  outcomeIndex: number | null;
  title: string | null;
  txHash: string | null;
  url: string;
}

export function readActivity(raw: unknown): PolymarketActivity[] {
  const out: PolymarketActivity[] = [];
  for (const a of rows(raw)) {
    const wallet = str(a.proxyWallet) ?? str(a.user);
    const timestamp = epochMs(a.timestamp);
    if (!wallet || timestamp === null) continue;
    out.push({
      wallet,
      timestamp,
      type: str(a.type)?.toUpperCase() ?? "UNKNOWN",
      conditionId: str(a.conditionId),
      tokenId: str(a.asset),
      side: tradeSide(a.side),
      size: num(a.size),
      usdcSize: num(a.usdcSize),
      price: num(a.price),
      outcome: str(a.outcome),
      outcomeIndex: num(a.outcomeIndex),
      title: str(a.title),
      txHash: str(a.transactionHash),
      url: polymarketUrl(str(a.eventSlug), str(a.slug)),
    });
  }
  return out;
}

/* ---------- Client ---------- */

export interface PolymarketClientOptions {
  gamma?: HttpClient;
  clob?: HttpClient;
  data?: HttpClient;
  gammaUrl?: string;
  clobUrl?: string;
  dataUrl?: string;
  clock?: Clock;
}

export class PolymarketClient implements VenueClient {
  readonly venue = "polymarket" as const;
  private readonly gamma: HttpClient;
  private readonly clob: HttpClient;
  private readonly data: HttpClient;
  readonly gammaUrl: string;
  readonly clobUrl: string;
  readonly dataUrl: string;
  private readonly clock: Clock;
  private readonly sweepCache: TtlCache<Sweep>;

  constructor(o: PolymarketClientOptions = {}) {
    const urls = baseUrls();
    this.gamma = o.gamma ?? venueHttp("polymarket_gamma");
    this.clob = o.clob ?? venueHttp("polymarket_clob");
    this.data = o.data ?? venueHttp("polymarket_data");
    this.gammaUrl = (o.gammaUrl ?? urls.gamma).replace(/\/+$/, "");
    this.clobUrl = (o.clobUrl ?? urls.clob).replace(/\/+$/, "");
    this.dataUrl = (o.dataUrl ?? urls.data).replace(/\/+$/, "");
    this.clock = o.clock ?? realClock;
    this.sweepCache = new TtlCache<Sweep>(SWEEP_TTL_MS, this.clock);
  }

  /* Gamma */

  /** Raw open events with nested markets: GET /events?active=true&closed=false, limit/offset pagination, ordered
   *  by id so pages are stable while new events appear. */
  async listEventsRaw(priority: Priority = "normal"): Promise<JsonObject[]> {
    const out: JsonObject[] = [];
    for (let page = 0; page < GAMMA_MAX_PAGES; page++) {
      const params = { active: true, closed: false, archived: false, limit: GAMMA_EVENTS_PAGE_LIMIT, offset: page * GAMMA_EVENTS_PAGE_LIMIT, order: "id", ascending: true };
      const got = rows(await this.gamma.json(`${this.gammaUrl}/events${qs(params)}`, { priority }));
      out.push(...got);
      if (got.length < GAMMA_EVENTS_PAGE_LIMIT) break;
    }
    return out;
  }

  /** Raw open markets: GET /markets?active=true&closed=false (each row embeds its event under events[]). */
  async listMarketsRaw(priority: Priority = "normal", pageLimit = 500): Promise<JsonObject[]> {
    const out: JsonObject[] = [];
    for (let page = 0; page < GAMMA_MAX_PAGES; page++) {
      const params = { active: true, closed: false, archived: false, limit: pageLimit, offset: page * pageLimit, order: "id", ascending: true };
      const got = rows(await this.gamma.json(`${this.gammaUrl}/markets${qs(params)}`, { priority }));
      out.push(...got);
      if (got.length < pageLimit) break;
    }
    return out;
  }

  /** One event by slug (GET /events/slug/{slug}). */
  async getEventBySlug(slug: string, priority: Priority = "normal"): Promise<{ event: VEvent; markets: VMarket[] } | null> {
    return readGammaEvent(await this.gamma.json(`${this.gammaUrl}/events/slug/${encodeURIComponent(slug)}`, { priority }));
  }

  sweep(opts: ListOptions = {}): Promise<Sweep> {
    return this.sweepCache.get(async () => buildGammaSweep(await this.listEventsRaw(opts.priority ?? "normal"), this.clock.now()), opts.refresh);
  }

  async listMarkets(opts: ListOptions = {}): Promise<VMarket[]> {
    return (await this.sweep(opts)).markets;
  }

  async listEvents(opts: ListOptions = {}): Promise<VEvent[]> {
    return (await this.sweep(opts)).events;
  }

  /* CLOB */

  /** Books for many tokens: POST /books in batches of CLOB_BOOKS_BATCH; a failed batch falls back to GET /book
   *  per token. Tokens without a book are absent. */
  async getTokenBooks(tokenIds: readonly string[], priority: Priority = "normal"): Promise<Map<string, TokenBook>> {
    const out = new Map<string, TokenBook>();
    const ids = [...new Set(tokenIds)];
    await Promise.all(
      chunk(ids, CLOB_BOOKS_BATCH).map(async group => {
        try {
          const raw = await this.clob.json(`${this.clobUrl}/books`, { method: "POST", body: group.map(token_id => ({ token_id })), priority });
          for (const r of rows(raw)) {
            const b = readClobBook(r);
            if (b) out.set(b.tokenId, b);
          }
        } catch {
          await Promise.all(
            group.map(async t => {
              try {
                const b = await this.getTokenBook(t, priority);
                if (b) out.set(t, b);
              } catch {
                // Left out.
              }
            }),
          );
        }
      }),
    );
    return out;
  }

  /** One token's book (GET /book?token_id=). Null when the CLOB has none (404). */
  async getTokenBook(tokenId: string, priority: Priority = "normal"): Promise<TokenBook | null> {
    return readClobBook(await this.clob.json(`${this.clobUrl}/book${qs({ token_id: tokenId })}`, { priority }));
  }

  /** Midpoint (GET /midpoint?token_id=) → {mid: "0.455"}. */
  async getMidpoint(tokenId: string, priority: Priority = "normal"): Promise<number | null> {
    const raw = await this.clob.json(`${this.clobUrl}/midpoint${qs({ token_id: tokenId })}`, { priority });
    return isObject(raw) ? num(raw.mid ?? raw.midpoint) : null;
  }

  /** Best price for a side as the CLOB defines it (GET /price?token_id=&side=BUY|SELL) → {price: "0.45"}. */
  async getPrice(tokenId: string, side: "BUY" | "SELL", priority: Priority = "normal"): Promise<number | null> {
    const raw = await this.clob.json(`${this.clobUrl}/price${qs({ token_id: tokenId, side })}`, { priority });
    return isObject(raw) ? num(raw.price) : null;
  }

  async getBooks(markets: readonly VMarket[], opts: BookOptions = {}): Promise<Map<string, Book>> {
    const ms = markets.filter(m => m.yesTokenId || m.noTokenId);
    const tokens = ms.flatMap(m => [m.yesTokenId, m.noTokenId]).filter((t): t is string => t !== null);
    const books = await this.getTokenBooks(tokens, opts.priority ?? "normal");
    const now = this.clock.now();
    const out = new Map<string, Book>();
    for (const m of ms) {
      const b = combineTokenBooks(m.yesTokenId ? (books.get(m.yesTokenId) ?? null) : null, m.noTokenId ? (books.get(m.noTokenId) ?? null) : null, now);
      if (b) out.set(m.id, b);
    }
    return out;
  }

  /* Data API */

  /** Large trades across every market (taker side only, newest first). */
  async getWhaleTrades(opts: { minCash?: number; limit?: number; offset?: number; priority?: Priority } = {}): Promise<WhaleTrade[]> {
    const minCash = opts.minCash ?? WHALE_MIN_CASH;
    const params = { filterType: "CASH", filterAmount: minCash, limit: opts.limit ?? DATA_PAGE_LIMIT, offset: opts.offset, takerOnly: true };
    return readWhaleTrades(await this.data.json(`${this.dataUrl}/trades${qs(params)}`, { priority: opts.priority }), minCash);
  }

  /** A wallet's open positions (public). Paginates up to DATA_MAX_PAGES. */
  async getPositions(user: string, opts: { sizeThreshold?: number; priority?: Priority } = {}): Promise<PolymarketPosition[]> {
    const out: PolymarketPosition[] = [];
    for (let page = 0; page < DATA_MAX_PAGES; page++) {
      const params = { user, limit: DATA_PAGE_LIMIT, offset: page * DATA_PAGE_LIMIT, sizeThreshold: opts.sizeThreshold ?? 0 };
      const raw = await this.data.json(`${this.dataUrl}/positions${qs(params)}`, { priority: opts.priority });
      const got = readPositions(raw);
      out.push(...got);
      if (rows(raw).length < DATA_PAGE_LIMIT) break;
    }
    return out;
  }

  /** A wallet's history, newest first (GET /v2/activity, falling back to /activity if /v2 is gone). */
  async getActivity(user: string, opts: { type?: string; start?: number; end?: number; maxPages?: number; priority?: Priority } = {}): Promise<PolymarketActivity[]> {
    const out: PolymarketActivity[] = [];
    let path = "/v2/activity";
    const maxPages = opts.maxPages ?? DATA_MAX_PAGES;
    for (let page = 0; page < maxPages; page++) {
      const params = {
        user,
        limit: DATA_PAGE_LIMIT,
        offset: page * DATA_PAGE_LIMIT,
        type: opts.type,
        start: opts.start !== undefined ? Math.floor(opts.start / 1000) : undefined,
        end: opts.end !== undefined ? Math.floor(opts.end / 1000) : undefined,
        sortBy: "TIMESTAMP",
        sortDirection: "DESC",
      };
      let raw = await this.data.json(`${this.dataUrl}${path}${qs(params)}`, { priority: opts.priority });
      if (raw === null && path === "/v2/activity" && page === 0) {
        path = "/activity";
        raw = await this.data.json(`${this.dataUrl}${path}${qs(params)}`, { priority: opts.priority });
      }
      const got = readActivity(raw);
      out.push(...got);
      if (rows(raw).length < DATA_PAGE_LIMIT) break;
    }
    return out;
  }
}

/* ---------- Websocket market channel ---------- */

/** The subset of the WebSocket API used here (Node 22's global WebSocket satisfies it). */
export interface WsLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type WsCtor = new (url: string) => WsLike;

const WS_OPEN = 1;

export interface MarketStreamOptions {
  url?: string;
  WebSocketImpl?: WsCtor;
  clock?: Clock;
  /** Called with the token's whole book after every snapshot or change. */
  onBook: (tokenId: string, book: TokenBook) => void;
  /** "unavailable": no WebSocket implementation in this runtime (no reconnect is attempted). */
  onStatus?: (status: "open" | "closed" | "error" | "unavailable", consecutiveFailures: number) => void;
  pingIntervalMs?: number;
}

type MutableBook = { conditionId: string | null; bids: Map<number, number>; asks: Map<number, number>; hash: string | null; timestamp: number | null };

/** Polymarket CLOB market-channel client: subscribes to tokens, keeps each token's book from "book" snapshots and
 *  "price_change" deltas, emits the full book on every change, pings, and reconnects with backoff. */
export class PolymarketMarketStream {
  private ws: WsLike | null = null;
  private readonly tokens = new Set<string>();
  private readonly books = new Map<string, MutableBook>();
  private stopped = true;
  private failures = 0;
  private opened = false;
  private ping: ReturnType<typeof setInterval> | null = null;
  private readonly url: string;
  private readonly clock: Clock;

  constructor(private readonly o: MarketStreamOptions) {
    this.url = o.url ?? baseUrls().polymarketWs;
    this.clock = o.clock ?? realClock;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  subscribe(tokenIds: readonly string[]): void {
    const fresh = tokenIds.filter(t => !this.tokens.has(t));
    for (const t of fresh) this.tokens.add(t);
    if (fresh.length && this.ws?.readyState === WS_OPEN) this.ws.send(JSON.stringify({ assets_ids: fresh, operation: "subscribe" }));
  }

  unsubscribe(tokenIds: readonly string[]): void {
    const gone = tokenIds.filter(t => this.tokens.delete(t));
    for (const t of gone) this.books.delete(t);
    if (gone.length && this.ws?.readyState === WS_OPEN) this.ws.send(JSON.stringify({ assets_ids: gone, operation: "unsubscribe" }));
  }

  /** The current book for a token, if a snapshot has arrived. */
  getBook(tokenId: string): TokenBook | null {
    const b = this.books.get(tokenId);
    return b ? this.snapshot(tokenId, b) : null;
  }

  private connect(): void {
    const Impl: WsCtor | undefined = this.o.WebSocketImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (!Impl) {
      this.failures++;
      this.o.onStatus?.("unavailable", this.failures);
      return;
    }
    let ws: WsLike;
    try {
      ws = new Impl(this.url);
    } catch {
      this.failures++;
      this.o.onStatus?.("error", this.failures);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.opened = false;
    ws.onopen = () => {
      this.opened = true;
      this.failures = 0;
      ws.send(JSON.stringify({ assets_ids: [...this.tokens], type: "market" }));
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => {
        if (ws.readyState === WS_OPEN) ws.send("PING");
      }, this.o.pingIntervalMs ?? WS_PING_INTERVAL_MS);
      this.o.onStatus?.("open", 0);
    };
    ws.onmessage = ev => this.handleMessage(ev.data);
    ws.onerror = () => this.o.onStatus?.("error", this.failures);
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      if (this.ws === ws) this.ws = null;
      if (!this.opened) this.failures++;
      this.o.onStatus?.("closed", this.failures);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(WS_RECONNECT_BASE_MS * 2 ** Math.max(0, this.failures - 1), WS_RECONNECT_CAP_MS);
    void this.clock.sleep(delay).then(() => {
      if (!this.stopped && !this.ws) this.connect();
    });
  }

  /** Apply one websocket message (a JSON object, an array of them, or "PONG"). Public for tests. */
  handleMessage(data: unknown): void {
    const text = typeof data === "string" ? data : data instanceof Uint8Array ? new TextDecoder().decode(data) : null;
    if (text === null || text === "PONG" || text.trim() === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    for (const msg of Array.isArray(parsed) ? parsed : [parsed]) if (isObject(msg)) this.apply(msg);
  }

  private apply(msg: JsonObject): void {
    const type = str(msg.event_type) ?? str(msg.type);
    if (type === "book") {
      const tokenId = str(msg.asset_id);
      if (!tokenId || !this.tokens.has(tokenId)) return;
      const b: MutableBook = { conditionId: str(msg.market), bids: new Map(), asks: new Map(), hash: str(msg.hash), timestamp: epochMs(msg.timestamp) };
      for (const l of readLevels(pick(msg, "bids", "buys"))) b.bids.set(l.price, l.size);
      for (const l of readLevels(pick(msg, "asks", "sells"))) b.asks.set(l.price, l.size);
      this.books.set(tokenId, b);
      this.o.onBook(tokenId, this.snapshot(tokenId, b));
      return;
    }
    if (type === "price_change") {
      const ts = epochMs(msg.timestamp);
      // Current format: {market, price_changes: [{asset_id, price, size, side, hash}]}.
      // Older format: {asset_id, market, changes: [{price, size, side}], hash}.
      const changes: JsonObject[] = objList(msg.price_changes).length
        ? objList(msg.price_changes)
        : objList(msg.changes).map(c => ({ ...c, asset_id: msg.asset_id, hash: msg.hash }));
      const touched = new Set<string>();
      for (const c of changes) {
        const tokenId = str(c.asset_id);
        const b = tokenId ? this.books.get(tokenId) : undefined;
        if (!tokenId || !b) continue; // no snapshot yet: wait for the "book" message
        const price = num(c.price);
        const size = num(c.size);
        const side = str(c.side)?.toUpperCase();
        if (price === null || size === null || (side !== "BUY" && side !== "SELL")) continue;
        const levels = side === "BUY" ? b.bids : b.asks;
        const p = Number(price.toFixed(6));
        if (size <= 0) levels.delete(p);
        else levels.set(p, size);
        b.hash = str(c.hash) ?? b.hash;
        b.timestamp = ts ?? b.timestamp;
        touched.add(tokenId);
      }
      for (const t of touched) {
        const b = this.books.get(t);
        if (b) this.o.onBook(t, this.snapshot(t, b));
      }
    }
    // tick_size_change, last_trade_price, best_bid_ask: not needed for books.
  }

  private snapshot(tokenId: string, b: MutableBook): TokenBook {
    const toLevels = (m: Map<number, number>) => [...m].filter(([p, s]) => p > 0 && p < 1 && s > 0).map(([price, size]) => ({ price, size }));
    return {
      tokenId,
      conditionId: b.conditionId,
      bids: sortBids(toLevels(b.bids)),
      asks: sortAsks(toLevels(b.asks)),
      hash: b.hash,
      timestamp: b.timestamp,
      tickSize: null,
      minOrderSize: null,
    };
  }
}

/* ---------- Polling fallback and the combined watcher ---------- */

export interface PollOptions {
  client: Pick<PolymarketClient, "getTokenBooks">;
  intervalMs?: number;
  clock?: Clock;
  priority?: Priority;
}

/** The hash a change is detected by: the CLOB's hash when sent, else a digest of the levels. */
const changeKey = (b: TokenBook) => b.hash ?? bookDigest({ yesAsks: b.asks, yesBids: b.bids, noAsks: [], noBids: [] });

/** One polling round: fetch, compare with `last`, call onChange for changed tokens. Exported for tests. */
export async function pollOnce(
  tokenIds: readonly string[],
  last: Map<string, string>,
  onChange: (tokenId: string, book: TokenBook) => void,
  o: PollOptions,
): Promise<number> {
  const books = await o.client.getTokenBooks(tokenIds, o.priority ?? "normal");
  let changed = 0;
  for (const [t, b] of books) {
    const k = changeKey(b);
    if (last.get(t) === k) continue;
    last.set(t, k);
    changed++;
    onChange(t, b);
  }
  return changed;
}

/** Poll books every intervalMs and call onChange only when a token's book hash changes. Returns stop(). */
export function pollBooks(tokenIds: readonly string[], onChange: (tokenId: string, book: TokenBook) => void, o: PollOptions): () => void {
  const clock = o.clock ?? realClock;
  const last = new Map<string, string>();
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        await pollOnce(tokenIds, last, onChange, o);
      } catch {
        // Try again next round.
      }
      if (stopped) break;
      await clock.sleep(o.intervalMs ?? POLL_INTERVAL_MS);
    }
  })();
  return () => {
    stopped = true;
  };
}

export interface WatchOptions extends PollOptions {
  WebSocketImpl?: WsCtor;
  url?: string;
  /** Skip the websocket entirely. */
  pollOnly?: boolean;
}

/** Live book updates: the websocket market channel when it connects, falling back to hash-change polling after
 *  WS_FAILURES_BEFORE_POLLING consecutive failed connections. Returns stop(). */
export function watchBooks(tokenIds: readonly string[], onChange: (tokenId: string, book: TokenBook) => void, o: WatchOptions): () => void {
  let stopPoll: (() => void) | null = null;
  const startPolling = () => {
    if (!stopPoll) stopPoll = pollBooks(tokenIds, onChange, o);
  };
  if (o.pollOnly) {
    startPolling();
    return () => stopPoll?.();
  }
  const stream = new PolymarketMarketStream({
    url: o.url,
    WebSocketImpl: o.WebSocketImpl,
    clock: o.clock,
    onBook: onChange,
    onStatus: (status, failures) => {
      if (status === "unavailable" || (status !== "open" && failures >= WS_FAILURES_BEFORE_POLLING)) {
        stream.stop();
        startPolling();
      }
    },
  });
  stream.subscribe(tokenIds);
  stream.start();
  return () => {
    stream.stop();
    stopPoll?.();
  };
}

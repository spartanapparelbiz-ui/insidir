import { describe, expect, it } from "vitest";
import { polymarketRate } from "@/lib/fees";
import {
  buildGammaSweep,
  CLOB_BOOKS_BATCH,
  combineTokenBooks,
  PolymarketClient,
  PolymarketMarketStream,
  pollOnce,
  readActivity,
  readClobBook,
  readGammaMarket,
  readPositions,
  readWhaleTrades,
  watchBooks,
  type TokenBook,
  type WsLike,
} from "@/lib/exchanges/polymarket";
import { fixture, testHttp, VirtualClock } from "./fixtures/exchanges/harness";

const T = 1_700_000_000_000;

describe("Gamma events → VMarket / VEvent", () => {
  const sweep = buildGammaSweep(fixture("gamma-events.json") as unknown[], T);
  const byId = new Map(sweep.markets.map(m => [m.id, m]));

  it("parses JSON-string outcomes / outcomePrices / clobTokenIds and arrays alike", () => {
    const a = byId.get("0xaaa1")!;
    const b = byId.get("0xaaa2")!;
    expect([a.yesTokenId, a.noTokenId]).toEqual(["111", "112"]);
    expect([b.yesTokenId, b.noTokenId]).toEqual(["121", "122"]);
    expect(a).toMatchObject({
      venue: "polymarket",
      eventId: "1001",
      seriesId: null,
      title: "Fed decreases interest rates by 25 bps after December 2025 meeting?",
      eventTitle: "Fed decision in December?",
      yesLabel: "25 bps decrease",
      noLabel: "No",
      rules: "This market will resolve to Yes if the Fed cuts by 25 bps.",
      resolutionSource: "https://www.federalreserve.gov",
      closeTime: Date.parse("2025-12-10T00:00:00Z"),
      category: "economics",
      fee: { venue: "polymarket", rate: polymarketRate("economics") },
      url: "https://polymarket.com/event/fed-decision-in-december/fed-decreases-interest-rates-by-25-bps-after-december-2025-meeting",
      active: true,
      result: null,
      volume24h: 15000.5,
    });
    // b has no description of its own: the event's rules are used.
    expect(b.rules).toBe("Event rules.");
  });

  it("keeps only tradeable markets and de-duplicates events across overlapping pages", () => {
    expect(sweep.markets.map(m => m.id).sort()).toEqual(["0xaaa1", "0xaaa2", "0xbbb1", "0xccc1", "0xccc2", "0xccc3", "0xddd1"].sort());
    expect(sweep.events.map(e => e.id)).toEqual(["1001", "2002", "3003", "4004"]);
  });

  it("labels non-Yes/No binaries by their outcomes", () => {
    expect(byId.get("0xbbb1")).toMatchObject({ yesLabel: "Lakers", noLabel: "Celtics", category: "sports", yesTokenId: "211", noTokenId: "212", strike: null });
    expect(byId.get("0xbbb1")!.fee).toEqual({ venue: "polymarket", rate: polymarketRate("sports") });
  });

  it("sets negRisk flags: exhaustive only when no outcome can be added and every market is accounted for", () => {
    const ev = new Map(sweep.events.map(e => [e.id, e]));
    // negRisk, not augmented, the third market already resolved NO → exactly one listed market can win.
    expect(ev.get("1001")).toMatchObject({ mutuallyExclusive: true, exhaustive: true, marketIds: ["0xaaa1", "0xaaa2"], category: "economics" });
    expect(ev.get("2002")).toMatchObject({ mutuallyExclusive: false, exhaustive: false });
    // negRiskAugmented: outcomes may be added.
    expect(ev.get("3003")).toMatchObject({ mutuallyExclusive: true, exhaustive: false, category: "politics" });
    // One market not accepting orders and unresolved: buying every listed YES does not cover it.
    expect(ev.get("4004")).toMatchObject({ mutuallyExclusive: true, exhaustive: false, marketIds: ["0xddd1"], category: "crypto" });
  });

  it("reads strikes from the question when the group title is a bare number", () => {
    expect(byId.get("0xddd1")!.strike).toEqual({ kind: "above", value: 100000, upper: null, subject: "btc" });
    const m = readGammaMarket({ conditionId: "0x1", question: "Bitcoin above ___ on Oct 31?", groupItemTitle: "↑ 110,000", outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]' }, null);
    expect(m!.strike).toEqual({ kind: "above", value: 110000, upper: null, subject: "btc" });
  });

  it("reads results of closed markets and rejects non-binary rows", () => {
    expect(readGammaMarket({ conditionId: "0x1", closed: true, outcomes: '["Yes","No"]', outcomePrices: '["1","0"]', clobTokenIds: '["1","2"]' }, null)!.result).toBe("yes");
    expect(readGammaMarket({ conditionId: "0x1", closed: true, outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]', clobTokenIds: '["1","2"]' }, null)!.result).toBe("void");
    expect(readGammaMarket({ conditionId: "0x1", outcomes: '["A","B","C"]', clobTokenIds: '["1","2","3"]' }, null)).toBeNull();
    expect(readGammaMarket({ question: "no condition id" }, null)).toBeNull();
  });
});

describe("CLOB books", () => {
  const raw = fixture("clob-books.json") as unknown[];

  it("sorts each token's book best first and keeps the hash", () => {
    const b = readClobBook(raw[0])!;
    expect(b.bids.map(l => l.price)).toEqual([0.61, 0.6, 0.58]);
    expect(b.asks.map(l => l.price)).toEqual([0.63, 0.64, 0.66]);
    expect(b).toMatchObject({ tokenId: "111", conditionId: "0xaaa1", hash: "h-yes-111", tickSize: 0.01, minOrderSize: 5, timestamp: 1730000000000 });
  });

  it("YES book from the YES token, NO book from the NO token", () => {
    const yes = readClobBook(raw[0]);
    const no = readClobBook(raw[1]);
    const book = combineTokenBooks(yes, no, T)!;
    expect(book.yesAsks[0]).toEqual({ price: 0.63, size: 40 });
    expect(book.yesBids[0]).toEqual({ price: 0.61, size: 25 });
    expect(book.noAsks[0]).toEqual({ price: 0.39, size: 25 });
    expect(book.noBids[0]).toEqual({ price: 0.37, size: 40 });
    expect(book.hash).toBe("h-yes-111:h-no-112");
    expect(book.fetchedAt).toBe(T);
  });

  it("mirrors a missing NO book from the YES book", () => {
    const book = combineTokenBooks(readClobBook(raw[2]), null, T)!;
    expect(book.noAsks).toEqual([{ price: 0.56, size: 1000 }]);
    expect(book.noBids).toEqual([{ price: 0.54, size: 900 }]);
    expect(combineTokenBooks(null, null, T)).toBeNull();
  });

  it("getBooks batches POST /books (≤ 500 tokens) and maps tokens back to markets", async () => {
    const { http, calls } = testHttp((url, method, body) => {
      if (!url.endsWith("/books") || method !== "POST" || !Array.isArray(body)) return undefined;
      const ids = body.map(x => (x as { token_id: string }).token_id);
      return { body: (raw as Array<{ asset_id: string }>).filter(b => ids.includes(b.asset_id)) };
    });
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, clobUrl: "https://clob.test" });
    const markets = buildGammaSweep(fixture("gamma-events.json") as unknown[], T).markets;
    // Pad with 300 synthetic markets so 600+ tokens need two batches.
    const many = [...markets, ...Array.from({ length: 300 }, (_, i) => ({ ...markets[0]!, id: `x${i}`, yesTokenId: `y${i}`, noTokenId: `n${i}` }))];
    const books = await client.getBooks(many, { priority: "hot" });
    const posts = calls.filter(c => c.method === "POST");
    expect(posts.length).toBe(Math.ceil((many.length * 2) / CLOB_BOOKS_BATCH));
    expect(posts.every(c => (c.body as unknown[]).length <= CLOB_BOOKS_BATCH)).toBe(true);
    expect(books.get("0xaaa1")!.yesAsks[0]).toEqual({ price: 0.63, size: 40 });
    expect(books.get("0xbbb1")!.noAsks[0]).toEqual({ price: 0.56, size: 1000 });
    expect(books.has("0xccc1")).toBe(false);
  });

  it("falls back to GET /book per token when the batch fails", async () => {
    const { http, calls } = testHttp((url, method) => {
      if (method === "POST") return { status: 400 };
      const id = new URL(url).searchParams.get("token_id");
      return id === "111" ? { body: raw[0] } : undefined;
    });
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, clobUrl: "https://clob.test" });
    const books = await client.getTokenBooks(["111", "999"]);
    expect([...books.keys()]).toEqual(["111"]);
    expect(calls.filter(c => c.method === "GET")).toHaveLength(2);
  });

  it("midpoint and price helpers read numeric strings", async () => {
    const { http } = testHttp(url => (url.includes("/midpoint") ? { body: { mid: "0.455" } } : url.includes("/price") ? { body: { price: "0.46" } } : undefined));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, clobUrl: "https://clob.test" });
    expect(await client.getMidpoint("1")).toBe(0.455);
    expect(await client.getPrice("1", "BUY")).toBe(0.46);
  });
});

describe("Gamma pagination", () => {
  it("pages /events/keyset by after_cursor until there is no next cursor (offset paging stops at 2,000)", async () => {
    const page = (n: number, start: number) => Array.from({ length: n }, (_, i) => ({ id: String(start + i), markets: [] }));
    const { http, calls } = testHttp(url => {
      const cur = new URL(url).searchParams.get("after_cursor");
      return { body: cur === null ? { events: page(100, 0), next_cursor: "c1" } : cur === "c1" ? { events: page(100, 100), next_cursor: "c2" } : { events: page(3, 200) } };
    });
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, gammaUrl: "https://gamma.test" });
    const raw = await client.listEventsRaw();
    expect(raw).toHaveLength(203);
    expect(calls).toHaveLength(3);
    const first = new URL(calls[0]!.url);
    expect(first.pathname).toBe("/events/keyset");
    expect([first.searchParams.get("active"), first.searchParams.get("closed"), first.searchParams.get("limit"), first.searchParams.get("offset")]).toEqual(["true", "false", "100", null]);
    expect(new URL(calls[2]!.url).searchParams.get("after_cursor")).toBe("c2");
  });

  it("stops on an empty page or a repeated cursor", async () => {
    const { http, calls } = testHttp(() => ({ body: { events: [{ id: "1", markets: [] }], next_cursor: "same" } }));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, gammaUrl: "https://gamma.test" });
    expect(await client.listEventsRaw()).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});

describe("Data API", () => {
  it("normalises whale trades", () => {
    const trades = readWhaleTrades(fixture("data-trades.json"), 10_000);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toEqual({
      venue: "polymarket",
      wallet: "0x56687bf447db6ffa42ffe2204a05edaa20f55839",
      name: "whale42",
      marketId: "0xaaa1",
      marketTitle: "Fed decreases interest rates by 25 bps after December 2025 meeting?",
      outcome: "Yes",
      side: "BUY",
      contracts: 25000,
      price: 0.62,
      cash: 15500,
      timestamp: 1730000000000,
      txHash: "0xtx1",
      url: "https://polymarket.com/event/fed-decision-in-december/fed-decreases-interest-rates-by-25-bps-after-december-2025-meeting",
    });
    // Numeric strings, lower-case side, and a name that is just the wallet address (not shown).
    expect(trades[1]).toMatchObject({ side: "SELL", contracts: 40000, price: 0.45, cash: 18000, name: null, outcome: "Lakers", timestamp: 1730000100000, txHash: null });
  });

  it("requests global taker-only trades filtered by cash", async () => {
    const { http, calls } = testHttp(() => ({ body: fixture("data-trades.json") }));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, dataUrl: "https://data.test" });
    const trades = await client.getWhaleTrades({ limit: 100 });
    expect(trades).toHaveLength(2);
    const q = new URL(calls[0]!.url).searchParams;
    expect([q.get("filterType"), q.get("filterAmount"), q.get("takerOnly"), q.get("limit")]).toEqual(["CASH", "10000", "true", "100"]);
  });

  it("reads positions and activity rows (bare or wrapped)", () => {
    const pos = readPositions([{ proxyWallet: "0xw", conditionId: "0xc", asset: "111", size: "12.5", avgPrice: "0.4", currentValue: 6, cashPnl: "1.0", redeemable: true, title: "T", eventSlug: "e", slug: "m", endDate: "2025-12-01" }]);
    expect(pos[0]).toMatchObject({ wallet: "0xw", size: 12.5, avgPrice: 0.4, cashPnl: 1, redeemable: true, url: "https://polymarket.com/event/e/m", endDate: Date.parse("2025-12-01") });
    const act = readActivity({ data: [{ proxyWallet: "0xw", timestamp: 1730000000, type: "trade", side: "BUY", size: "10", usdcSize: "4", price: "0.4", conditionId: "0xc" }, { timestamp: 1 }] });
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({ type: "TRADE", side: "BUY", size: 10, usdcSize: 4, price: 0.4, timestamp: 1730000000000 });
  });

  it("falls back from /v2/activity to /activity", async () => {
    const { http, calls } = testHttp(url => (url.includes("/v2/activity") ? { status: 404 } : { body: [{ proxyWallet: "0xw", timestamp: 1, type: "REDEEM" }] }));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, dataUrl: "https://data.test" });
    const rows = await client.getActivity("0xw");
    expect(rows.map(r => r.type)).toEqual(["REDEEM"]);
    expect(calls.map(c => new URL(c.url).pathname)).toEqual(["/v2/activity", "/activity"]);
  });
});

/* ---------- Websocket ---------- */

class FakeWs implements WsLike {
  static instances: FakeWs[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  fail() {
    this.readyState = 3;
    this.onclose?.({});
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("PolymarketMarketStream", () => {
  it("subscribes, applies book snapshots and price_change deltas (both formats), emits full books", () => {
    FakeWs.instances = [];
    const seen: Array<{ token: string; book: TokenBook }> = [];
    const s = new PolymarketMarketStream({ url: "wss://ws.test", WebSocketImpl: FakeWs, clock: new VirtualClock(), onBook: (token, book) => seen.push({ token, book }), pingIntervalMs: 1e9 });
    s.subscribe(["111", "112"]);
    s.start();
    const ws = FakeWs.instances[0]!;
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ assets_ids: ["111", "112"], type: "market" });

    // A delta before any snapshot is ignored.
    ws.push({ event_type: "price_change", market: "0xaaa1", price_changes: [{ asset_id: "111", price: "0.5", size: "1", side: "BUY" }] });
    expect(seen).toHaveLength(0);

    ws.push([{ event_type: "book", asset_id: "111", market: "0xaaa1", bids: [{ price: "0.58", size: "100" }, { price: "0.60", size: "50" }], asks: [{ price: "0.64", size: "80" }, { price: "0.63", size: "40" }], hash: "h1", timestamp: "1730000000000" }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.book.bids.map(l => l.price)).toEqual([0.6, 0.58]);
    expect(seen[0]!.book.asks.map(l => l.price)).toEqual([0.63, 0.64]);

    // Current format: price_changes with asset ids; size 0 removes the level.
    ws.push({ event_type: "price_change", market: "0xaaa1", timestamp: "1730000001000", price_changes: [{ asset_id: "111", price: "0.63", size: "0", side: "SELL", hash: "h2" }, { asset_id: "111", price: "0.61", size: "10", side: "BUY", hash: "h2" }] });
    const latest = s.getBook("111")!;
    expect(latest.asks).toEqual([{ price: 0.64, size: 80 }]);
    expect(latest.bids[0]).toEqual({ price: 0.61, size: 10 });
    expect(latest.hash).toBe("h2");

    // Older format: asset_id at the top, changes[].
    ws.push({ event_type: "price_change", asset_id: "111", market: "0xaaa1", hash: "h3", changes: [{ price: "0.64", size: "5", side: "SELL" }] });
    expect(s.getBook("111")!.asks).toEqual([{ price: 0.64, size: 5 }]);
    expect(seen).toHaveLength(3);

    // Subscribing later sends an incremental subscribe.
    s.subscribe(["211"]);
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ assets_ids: ["211"], operation: "subscribe" });
    // PONG and junk are ignored.
    s.handleMessage("PONG");
    s.handleMessage("{not json");
    s.stop();
  });

  it("reconnects with backoff and resubscribes", async () => {
    FakeWs.instances = [];
    const clock = new VirtualClock();
    const s = new PolymarketMarketStream({ url: "wss://ws.test", WebSocketImpl: FakeWs, clock, onBook: () => undefined, pingIntervalMs: 1e9 });
    s.subscribe(["111"]);
    s.start();
    FakeWs.instances[0]!.fail();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWs.instances).toHaveLength(2);
    expect(clock.sleeps).toEqual([1000]);
    FakeWs.instances[1]!.fail();
    await Promise.resolve();
    await Promise.resolve();
    expect(clock.sleeps).toEqual([1000, 2000]);
    FakeWs.instances[2]!.open();
    expect(JSON.parse(FakeWs.instances[2]!.sent[0]!)).toEqual({ assets_ids: ["111"], type: "market" });
    expect(s.consecutiveFailures).toBe(0);
    s.stop();
  });

  it("watchBooks falls back to polling after repeated connection failures", async () => {
    FakeWs.instances = [];
    const clock = new VirtualClock();
    let polls = 0;
    const client = {
      getTokenBooks: async () => {
        polls++;
        return new Map<string, TokenBook>();
      },
    };
    const stop = watchBooks(["111"], () => undefined, { client, clock, WebSocketImpl: FakeWs, url: "wss://ws.test", intervalMs: 1e12 });
    for (let i = 0; i < 3; i++) {
      FakeWs.instances[i]!.fail();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.resolve();
    expect(polls).toBeGreaterThanOrEqual(1);
    stop();
  });
});

describe("polling", () => {
  it("reports a token only when its hash changes", async () => {
    let hash = "a";
    const client = {
      getTokenBooks: async () => new Map<string, TokenBook>([["111", { tokenId: "111", conditionId: null, bids: [], asks: [], hash, timestamp: null, tickSize: null, minOrderSize: null }]]),
    };
    const last = new Map<string, string>();
    const changed: string[] = [];
    const on = (t: string) => changed.push(t);
    expect(await pollOnce(["111"], last, on, { client })).toBe(1);
    expect(await pollOnce(["111"], last, on, { client })).toBe(0);
    hash = "b";
    expect(await pollOnce(["111"], last, on, { client })).toBe(1);
    expect(changed).toEqual(["111", "111"]);
  });

  it("falls back to a level digest when the venue sends no hash", async () => {
    let size = 1;
    const client = {
      getTokenBooks: async () => new Map<string, TokenBook>([["1", { tokenId: "1", conditionId: null, bids: [{ price: 0.4, size }], asks: [], hash: null, timestamp: null, tickSize: null, minOrderSize: null }]]),
    };
    const last = new Map<string, string>();
    expect(await pollOnce(["1"], last, () => undefined, { client })).toBe(1);
    expect(await pollOnce(["1"], last, () => undefined, { client })).toBe(0);
    size = 2;
    expect(await pollOnce(["1"], last, () => undefined, { client })).toBe(1);
  });
});

describe("PolymarketClient.getMarketsById (settlement)", () => {
  it("queries Gamma by condition_ids with closed=true and closed=false, reads final results", async () => {
    const { http, calls } = testHttp(url => {
      const u = new URL(url);
      if (u.pathname !== "/markets") return undefined;
      const ids = u.searchParams.getAll("condition_ids");
      const src = u.searchParams.get("closed") === "true" ? "gamma-markets-byid-closed.json" : "gamma-markets-byid-open.json";
      return { body: (fixture(src) as Array<{ conditionId: string }>).filter(m => ids.includes(m.conditionId)) };
    });
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, gammaUrl: "https://gamma.test" });
    const ids = ["0xyes", "0xno", "0xvoid", "0xpending", "0xopen", "0xmissing"];
    const got = await client.getMarketsById(ids);
    expect([...got.keys()].sort()).toEqual(["0xno", "0xopen", "0xpending", "0xvoid", "0xyes"]);
    expect(got.get("0xyes")).toMatchObject({ result: "yes", active: false, eventId: "9", category: "politics", url: "https://polymarket.com/event/ev-nine/settled-yes" });
    expect(got.get("0xno")!.result).toBe("no");
    expect(got.get("0xvoid")!.result).toBe("void");
    // Closed but UMA resolution only proposed: not settled yet.
    expect(got.get("0xpending")!.result).toBeNull();
    expect(got.get("0xopen")).toMatchObject({ result: null, active: true });
    expect(calls).toHaveLength(2);
  });

  it("batches ids (≤ 50 per request)", async () => {
    const { http, calls } = testHttp(() => ({ body: [] }));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, gammaUrl: "https://gamma.test" });
    await client.getMarketsById(Array.from({ length: 120 }, (_, i) => `0x${i}`));
    expect(calls).toHaveLength(6);
    expect(calls.every(c => new URL(c.url).searchParams.getAll("condition_ids").length <= 50)).toBe(true);
  });
});

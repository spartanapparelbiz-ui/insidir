import { describe, expect, it } from "vitest";
import { deriveKalshiBook, KalshiClient, kalshiUrl, readKalshiMarket, MARKETS_PAGE_LIMIT } from "@/lib/exchanges/kalshi";
import { fixture, testHttp } from "./fixtures/exchanges/harness";
import type { Book } from "@/lib/types";

const T = 1_700_000_000_000;

/** Book every fixture shape should produce: YES bids 45/42/40, NO bids 53/50. */
const EXPECTED: Omit<Book, "fetchedAt" | "hash"> = {
  yesBids: [
    { price: 0.45, size: 10 },
    { price: 0.42, size: 50 },
    { price: 0.4, size: 100 },
  ],
  noBids: [
    { price: 0.53, size: 20 },
    { price: 0.5, size: 30 },
  ],
  // YES asks = 1 − NO bids: the best NO bid (0.53) is the cheapest YES ask (0.47).
  yesAsks: [
    { price: 0.47, size: 20 },
    { price: 0.5, size: 30 },
  ],
  // NO asks = 1 − YES bids: the best YES bid (0.45) is the cheapest NO ask (0.55).
  noAsks: [
    { price: 0.55, size: 10 },
    { price: 0.58, size: 50 },
    { price: 0.6, size: 100 },
  ],
};

describe("Kalshi orderbook → Book", () => {
  it("derives asks from the dollar fields (orderbook_fp, fixed-point strings)", () => {
    const b = deriveKalshiBook(fixture("kalshi-orderbook-dollars.json"), T);
    expect(b).toEqual({ ...EXPECTED, fetchedAt: T, hash: null });
  });

  it("derives the same book from the legacy integer-cent fields", () => {
    expect(deriveKalshiBook(fixture("kalshi-orderbook-cents.json"), T)).toEqual({ ...EXPECTED, fetchedAt: T, hash: null });
  });

  it("sorts asks cheapest first and bids highest first whatever order the venue sends", () => {
    const b = deriveKalshiBook({ orderbook: { yes_dollars: [["0.30", 1], ["0.60", 2], ["0.10", 3]], no_dollars: [["0.20", 4], ["0.35", 5]] } }, T);
    expect(b.yesBids.map(l => l.price)).toEqual([0.6, 0.3, 0.1]);
    expect(b.noBids.map(l => l.price)).toEqual([0.35, 0.2]);
    expect(b.yesAsks.map(l => l.price)).toEqual([0.65, 0.8]);
    expect(b.noAsks.map(l => l.price)).toEqual([0.4, 0.7, 0.9]);
    // No crossed book: best YES ask ≥ best YES bid.
    expect(b.yesAsks[0]!.price).toBeGreaterThanOrEqual(b.yesBids[0]!.price);
  });

  it("prefers the dollar fields over cents, and handles null / empty sides", () => {
    const b = deriveKalshiBook(fixture("kalshi-orderbook-both.json"), T);
    expect(b.yesBids).toEqual([
      { price: 0.45, size: 10 },
      { price: 0.4, size: 100 },
    ]);
    expect(b.noBids).toEqual([]);
    expect(b.yesAsks).toEqual([]);
    expect(b.noAsks.map(l => l.price)).toEqual([0.55, 0.6]);
  });

  it("returns an empty book for junk", () => {
    expect(deriveKalshiBook(null, T)).toEqual({ yesAsks: [], noAsks: [], yesBids: [], noBids: [], fetchedAt: T, hash: null });
    expect(deriveKalshiBook({ orderbook: { yes: "x", no: [[0, 5], [100, 5], ["a", 1]] } }, T).noBids).toEqual([]);
  });
});

function kalshiRoutes(url: string) {
  const u = new URL(url);
  if (u.pathname.endsWith("/markets") && u.searchParams.get("cursor") === "CURSOR2") return { body: fixture("kalshi-markets-page2.json") };
  if (u.pathname.endsWith("/markets")) return { body: fixture("kalshi-markets-page1.json") };
  if (u.pathname.endsWith("/events")) return { body: fixture("kalshi-events.json") };
  if (u.pathname.endsWith("/series")) return { body: fixture("kalshi-series.json") };
  return undefined;
}

describe("KalshiClient sweep", () => {
  it("follows the cursor, normalises markets, skips combos and non-binary markets", async () => {
    const { http, calls } = testHttp(kalshiRoutes);
    const client = new KalshiClient({ http, baseUrl: "https://k.test/trade-api/v2" });
    const markets = await client.listMarkets();
    const marketCalls = calls.filter(c => new URL(c.url).pathname.endsWith("/markets"));
    expect(marketCalls).toHaveLength(2);
    expect(new URL(marketCalls[0]!.url).searchParams.get("limit")).toBe(String(MARKETS_PAGE_LIMIT));
    expect(new URL(marketCalls[0]!.url).searchParams.get("status")).toBe("open");
    expect(new URL(marketCalls[1]!.url).searchParams.get("cursor")).toBe("CURSOR2");

    expect(markets.map(m => m.id)).toEqual(["KXBTCD-25OCT31-T100000", "KXBTCD-25OCT31-T105000", "KXFEDDECISION-25DEC-C25", "KXFEDDECISION-25DEC-H0"]);
    const btc = markets[0]!;
    expect(btc).toMatchObject({
      venue: "kalshi",
      eventId: "KXBTCD-25OCT31",
      seriesId: "KXBTCD",
      title: "Bitcoin price on Oct 31, 2025?",
      eventTitle: "Bitcoin price on Oct 31, 2025",
      yesLabel: "$100,000 or above",
      noLabel: "No",
      rules: "If the price of Bitcoin is above $100,000 at 5pm ET, the market resolves to Yes.\n\nSource: CF Benchmarks BRTI.",
      resolutionSource: "CF Benchmarks (https://www.cfbenchmarks.com)",
      closeTime: Date.parse("2025-10-31T21:05:00Z"),
      category: "crypto",
      fee: { venue: "kalshi", multiplier: 1 },
      strike: { kind: "above", value: 100000, upper: null, subject: "btc" },
      active: true,
      result: null,
      volume24h: 1234,
      yesTokenId: null,
    });
    expect(btc.url).toBe("https://kalshi.com/markets/kxbtcd/bitcoin-price-above-below/kxbtcd-25oct31");
    expect(markets[1]!.strike).toEqual({ kind: "above", value: 105000, upper: null, subject: "btc" });
    expect(markets[1]!.closeTime).toBe(Date.parse("2025-10-31T21:00:00Z"));
    expect(markets[1]!.volume24h).toBe(55);

    const fed = markets[2]!;
    expect(fed).toMatchObject({ category: "economics", fee: { venue: "kalshi", multiplier: 0.5 }, rules: "Resolves Yes if the FOMC cuts by 25bps.", yesLabel: "Cut 25bps", noLabel: "No" });
    expect(markets[3]!.result).toBe("no");
  });

  it("builds events: mutually_exclusive from Kalshi, never exhaustive", async () => {
    const { http, calls } = testHttp(kalshiRoutes);
    const client = new KalshiClient({ http, baseUrl: "https://k.test/trade-api/v2" });
    const events = await client.listEvents();
    await client.listMarkets(); // served from the sweep cache
    expect(calls.filter(c => new URL(c.url).pathname.endsWith("/markets"))).toHaveLength(2);
    const fed = events.find(e => e.id === "KXFEDDECISION-25DEC")!;
    expect(fed).toMatchObject({ venue: "kalshi", mutuallyExclusive: true, exhaustive: false, category: "economics", title: "Fed decision in December 2025" });
    expect(fed.marketIds).toEqual(["KXFEDDECISION-25DEC-C25", "KXFEDDECISION-25DEC-H0"]);
    expect(events.find(e => e.id === "KXBTCD-25OCT31")!.mutuallyExclusive).toBe(false);
  });

  it("caches series per ticker", async () => {
    const { http, calls } = testHttp(url => (url.includes("/series/KXA") ? { body: { series: { ticker: "KXA", fee_multiplier: 2 } } } : undefined));
    const client = new KalshiClient({ http, baseUrl: "https://k.test" });
    expect((await client.getSeries("KXA"))!.feeMultiplier).toBe(2);
    await client.getSeries("KXA");
    expect(calls).toHaveLength(1);
  });

  it("getEvent reads nested markets", async () => {
    const { http } = testHttp(url =>
      url.includes("/events/KXE-1")
        ? {
            body: {
              event: { event_ticker: "KXE-1", series_ticker: "KXE", title: "E", mutually_exclusive: true, markets: [{ ticker: "KXE-1-A", event_ticker: "KXE-1", title: "A?", status: "active" }] },
            },
          }
        : undefined,
    );
    const client = new KalshiClient({ http, baseUrl: "https://k.test" });
    const r = await client.getEvent("KXE-1");
    expect(r!.markets.map(m => m.id)).toEqual(["KXE-1-A"]);
    expect(r!.event).toMatchObject({ mutuallyExclusive: true, exhaustive: false, marketIds: ["KXE-1-A"] });
    expect(r!.markets[0]!.fee).toEqual({ venue: "kalshi", multiplier: 1 });
  });
});

describe("KalshiClient books", () => {
  it("uses the batch endpoint when it answers", async () => {
    const { http, calls } = testHttp(url =>
      url.includes("/markets/orderbooks")
        ? { body: { orderbooks: [{ ticker: "A", orderbook_fp: { yes_dollars: [["0.40", 5]], no_dollars: [["0.55", 7]] } }, { ticker: "B", orderbook_fp: { yes_dollars: [], no_dollars: [] } }] } }
        : undefined,
    );
    const client = new KalshiClient({ http, baseUrl: "https://k.test" });
    const books = await client.getOrderbooks(["A", "B"], "hot");
    expect(calls).toHaveLength(1);
    expect(books.get("A")!.yesAsks).toEqual([{ price: 0.45, size: 7 }]);
    expect(books.get("B")!.yesAsks).toEqual([]);
  });

  it("falls back to one request per ticker when the batch endpoint is missing, and remembers", async () => {
    const { http, calls } = testHttp(url => {
      if (url.includes("/markets/orderbooks")) return { status: 404 };
      const m = /\/markets\/([^/]+)\/orderbook$/.exec(new URL(url).pathname);
      return m ? { body: { orderbook: { yes: [[30, 1]], no: [[60, 2]] } } } : undefined;
    });
    const client = new KalshiClient({ http, baseUrl: "https://k.test" });
    const books = await client.getOrderbooks(["A", "B", "C"]);
    expect([...books.keys()].sort()).toEqual(["A", "B", "C"]);
    expect(books.get("A")!.yesAsks).toEqual([{ price: 0.4, size: 2 }]);
    const before = calls.length;
    await client.getOrderbooks(["A", "B"]);
    expect(calls.slice(before).every(c => !c.url.includes("/markets/orderbooks"))).toBe(true);
  });
});

describe("readKalshiMarket details", () => {
  it("reads between strikes, void results and a missing status", () => {
    const m = readKalshiMarket({ ticker: "KXHIGHNY-25OCT26-B60.5", event_ticker: "KXHIGHNY-25OCT26", strike_type: "between", floor_strike: 60, cap_strike: 61, result: "void", title: "High temp in NYC" });
    expect(m).toMatchObject({ strike: { kind: "between", value: 60, upper: 61, subject: "nyc-high-temp" }, result: "void", active: true, seriesId: "KXHIGHNY" });
    expect(readKalshiMarket({ ticker: "X", event_ticker: "E", strike_type: "less", cap_strike: 3 })!.strike).toEqual({ kind: "below", value: 3, upper: null, subject: "e" });
    expect(readKalshiMarket({ event_ticker: "E" })).toBeNull();
  });

  it("builds deep links", () => {
    expect(kalshiUrl("KXFED", "Fed rate", "KXFED-25DEC")).toBe("https://kalshi.com/markets/kxfed/fed-rate/kxfed-25dec");
    expect(kalshiUrl(null, null, "ABC")).toBe("https://kalshi.com/markets/abc");
  });
});

describe("KalshiClient.getMarketsById (settlement)", () => {
  it("batches GET /markets?tickers=, falls back per ticker, fills results, leaves unknown ids out", async () => {
    const { http, calls } = testHttp(url => {
      const u = new URL(url);
      if (u.pathname.endsWith("/markets") && u.searchParams.get("tickers")) return { body: fixture("kalshi-markets-byid.json") };
      if (u.pathname.endsWith("/markets/KXVOID-1")) return { body: fixture("kalshi-market-void.json") };
      if (u.pathname.endsWith("/series")) return { body: fixture("kalshi-series.json") };
      return undefined;
    });
    const client = new KalshiClient({ http, baseUrl: "https://k.test" });
    const ids = ["KXFEDDECISION-25DEC-C25", "KXFEDDECISION-25DEC-H0", "KXBTCD-25OCT31-T100000", "KXVOID-1", "KXUNKNOWN-1"];
    const got = await client.getMarketsById(ids);
    expect([...got.keys()].sort()).toEqual(ids.filter(i => i !== "KXUNKNOWN-1").sort());
    expect(got.get("KXFEDDECISION-25DEC-C25")).toMatchObject({ result: "yes", active: false, fee: { venue: "kalshi", multiplier: 0.5 } });
    expect(got.get("KXFEDDECISION-25DEC-H0")!.result).toBe("no");
    expect(got.get("KXVOID-1")!.result).toBe("void");
    expect(got.get("KXBTCD-25OCT31-T100000")).toMatchObject({ result: null, active: true });
    const batch = calls.find(c => new URL(c.url).searchParams.get("tickers"))!;
    expect(new URL(batch.url).searchParams.get("status")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { polymarketRate } from "@/lib/fees";
import { buildUsSweep, PolymarketUsClient, readUsBook, readUsMarket } from "@/lib/exchanges/polymarket-us";
import { HttpClient, TokenBucket } from "@/lib/exchanges/http";
import { fixture, testHttp, VirtualClock, FAST } from "./fixtures/exchanges/harness";

const T = 1_700_000_000_000;

describe("Polymarket US readers", () => {
  it("reads generic exchange-shaped markets", () => {
    const m = readUsMarket({ id: "m-1", slug: "fed-cut-dec", title: "Fed cuts in December?", status: "open", category: "Economics", eventId: "ev-1", eventTitle: "Fed December", endDate: "2025-12-10T00:00:00Z", description: "Rules." });
    expect(m).toMatchObject({
      venue: "polymarket_us",
      id: "m-1",
      eventId: "ev-1",
      eventTitle: "Fed December",
      yesLabel: "Yes",
      noLabel: "No",
      rules: "Rules.",
      category: "economics",
      fee: { venue: "polymarket_us", rate: polymarketRate("economics") },
      url: "https://polymarket.us/market/fed-cut-dec",
      active: true,
      closeTime: Date.parse("2025-12-10T00:00:00Z"),
    });
    expect(readUsMarket({ id: "x", status: "settled", result: "yes" })).toMatchObject({ active: false, result: "yes" });
    expect(readUsMarket({ title: "no id" })).toBeNull();
  });

  it("reuses the Gamma reader for Gamma-shaped rows, with US deep links", () => {
    const m = readUsMarket({ conditionId: "0x1", question: "Lakers vs. Celtics", slug: "lal-bos", outcomes: '["Lakers","Celtics"]', clobTokenIds: '["1","2"]', active: true });
    expect(m).toMatchObject({ venue: "polymarket_us", yesLabel: "Lakers", noLabel: "Celtics", url: "https://polymarket.us/market/lal-bos", yesTokenId: "1" });
    expect(m!.fee.venue).toBe("polymarket_us");
  });

  it("reads Gamma-shaped events with negRisk rules", () => {
    const sweep = buildUsSweep(fixture("gamma-events.json") as Array<Record<string, unknown>>, [], T);
    expect(sweep.markets.every(m => m.venue === "polymarket_us" && m.url.startsWith("https://polymarket.us/"))).toBe(true);
    expect(sweep.events.find(e => e.id === "1001")).toMatchObject({ venue: "polymarket_us", mutuallyExclusive: true, exhaustive: true });
  });

  it("reads books in every supported shape", () => {
    const both = readUsBook({ yes: { bids: [{ price: 0.4, size: 5 }], asks: [{ price: 0.45, size: 3 }] }, no: { bids: [{ price: 0.5, size: 2 }], asks: [{ price: 0.6, size: 5 }] } }, T)!;
    expect(both).toMatchObject({ yesAsks: [{ price: 0.45, size: 3 }], noAsks: [{ price: 0.6, size: 5 }] });

    const yesOnly = readUsBook({ bids: [[0.4, 10], [0.42, 1]], asks: [[0.47, 2]], hash: "abc" }, T)!;
    expect(yesOnly.yesBids.map(l => l.price)).toEqual([0.42, 0.4]);
    expect(yesOnly.noAsks).toEqual([
      { price: 0.58, size: 1 },
      { price: 0.6, size: 10 },
    ]);
    expect(yesOnly.noBids).toEqual([{ price: 0.53, size: 2 }]);
    expect(yesOnly.hash).toBe("abc");

    const bidsOnly = readUsBook({ orderbook: { yes: [[45, 10]], no: [[50, 3]] } }, T)!;
    expect(bidsOnly.yesAsks).toEqual([{ price: 0.5, size: 3 }]);
    expect(bidsOnly.noAsks).toEqual([{ price: 0.55, size: 10 }]);

    const flat = readUsBook({ book: { yesBids: [{ price: { value: "0.30" }, quantity: "4" }], yesAsks: [], noBids: [], noAsks: [] } }, T)!;
    expect(flat.yesBids).toEqual([{ price: 0.3, size: 4 }]);
    expect(flat.noAsks).toEqual([{ price: 0.7, size: 4 }]);

    expect(readUsBook("nope", T)).toBeNull();
  });
});

describe("PolymarketUsClient", () => {
  it("returns [] when the API is unreachable and records the error", async () => {
    const clock = new VirtualClock();
    const http = new HttpClient({
      bucket: new TokenBucket("us", FAST, clock),
      clock,
      fetchImpl: () => Promise.reject(new Error("getaddrinfo ENOTFOUND api.polymarket.us")),
    });
    const client = new PolymarketUsClient({ http, baseUrl: "https://api.polymarket.us", clock, enabled: true });
    expect(await client.listMarkets()).toEqual([]);
    expect(await client.listEvents()).toEqual([]);
    expect(client.status()).toMatchObject({ reachable: false, lastMarketCount: 0 });
    expect(client.status().lastError).toMatch(/ENOTFOUND/);
  });

  it("returns [] without any request when disabled", async () => {
    const { http, calls } = testHttp(() => ({ body: [] }));
    const client = new PolymarketUsClient({ http, enabled: false });
    expect(await client.listMarkets()).toEqual([]);
    expect(await client.getBooks([])).toEqual(new Map());
    expect(calls).toHaveLength(0);
  });

  it("falls back from events to markets and groups markets into events", async () => {
    const { http } = testHttp(url => {
      const p = new URL(url).pathname;
      if (p === "/v1/events") return { status: 404 };
      if (p === "/v1/markets") return { body: { markets: [{ id: "a", title: "A?", eventId: "e", status: "open" }, { id: "b", title: "B?", eventId: "e", status: "open" }, { id: "c", title: "C?", status: "closed" }] } };
      if (p === "/v1/markets/a/book") return { body: { bids: [[0.4, 1]], asks: [[0.5, 1]] } };
      return undefined;
    });
    const client = new PolymarketUsClient({ http, baseUrl: "https://us.test", enabled: true });
    const markets = await client.listMarkets();
    expect(markets.map(m => m.id)).toEqual(["a", "b"]);
    const events = await client.listEvents();
    expect(events).toEqual([expect.objectContaining({ id: "e", marketIds: ["a", "b"], mutuallyExclusive: false, exhaustive: false })]);
    const books = await client.getBooks(markets);
    expect([...books.keys()]).toEqual(["a"]);
    expect(client.status().reachable).toBe(true);
  });
});

describe("PolymarketUsClient.getMarketsById", () => {
  it("reads markets in any status and fails soft for unknown ids", async () => {
    const { http } = testHttp(url => {
      const p = new URL(url).pathname;
      if (p === "/v1/markets/a") return { body: { market: { id: "a", title: "A?", status: "settled", result: "no" } } };
      if (p === "/v1/markets/b") return { body: { id: "b", title: "B?", status: "voided" } };
      if (p === "/v1/markets/c") return { body: { id: "c", title: "C?", status: "open" } };
      if (p === "/v1/markets/boom") return { status: 500 };
      return undefined;
    });
    const client = new PolymarketUsClient({ http, baseUrl: "https://us.test", enabled: true });
    const got = await client.getMarketsById(["a", "b", "c", "boom", "missing"]);
    expect([...got.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(got.get("a")).toMatchObject({ result: "no", active: false });
    expect(got.get("b")!.result).toBe("void");
    expect(got.get("c")).toMatchObject({ result: null, active: true });
  });
});

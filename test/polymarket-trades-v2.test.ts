/* Polymarket retired GET /trades (HTTP 410 Gone): the big-trade poller, the whale job and the wallet-trade reads use
 * GET /v2/trades, which pages by cursor and answers snake_case rows inside { data, pagination }. The client maps each
 * row back to the v1 field names every parser already reads, so a v2 page parses exactly like a v1 list did. */
import { describe, expect, it } from "vitest";
import { PolymarketClient, tradesCursor, v1Trade } from "@/lib/exchanges/polymarket";
import { MovesPoller } from "@/lib/moves/poll";
import { readPolymarketFills } from "@/lib/moves/sources";
import { fixture, testHttp } from "./fixtures/exchanges/harness";

const W = (c: string) => "0x" + c.repeat(40).slice(0, 40);
const row = (o: { wallet: string; usd: number; at: number; market: string; tx: string }) => ({
  proxy_wallet: o.wallet, side: "BUY", token_id: "1", condition_id: o.market, size: o.usd / 0.5, price: 0.5, timestamp: Math.floor(o.at / 1000),
  title: "Will the Chiefs win?", slug: "nfl-kc-buf", event_slug: "nfl-kc-buf", outcome: "Yes", outcome_index: 0, name: "", pseudonym: "x", transaction_hash: o.tx,
});

describe("Polymarket /v2/trades", () => {
  it("calls /v2/trades (never the retired /trades), by cursor, and reads the real v2 shape", async () => {
    const { http, calls } = testHttp(() => ({ body: fixture("data-trades-v2.json") }));
    const client = new PolymarketClient({ gamma: http, clob: http, data: http, dataUrl: "https://data.test" });
    const page = await client.getTradesPage({ filterAmount: 500, cursor: "abc" });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/v2/trades");
    expect([u.searchParams.get("filterType"), u.searchParams.get("filterAmount"), u.searchParams.get("takerOnly"), u.searchParams.get("cursor"), u.searchParams.get("offset")]).toEqual(["CASH", "500", "true", "abc", null]);
    const fills = readPolymarketFills(page);
    expect(fills.length).toBe((fixture("data-trades-v2.json") as { data: unknown[] }).data.length);
    expect(fills[0]).toMatchObject({ source: "polymarket", side: "BUY" });
    expect(fills[0]!.wallet).toMatch(/^0x[0-9a-f]{40}$/);
    expect(fills[0]!.marketId).toMatch(/^0x[0-9a-fA-F]{40,}$/);
    expect(tradesCursor(page)).toEqual(expect.any(String));

    await client.getWhaleTrades({ limit: 20 });
    expect(new URL(calls[1]!.url).pathname).toBe("/v2/trades");
  });

  it("maps v2 names to v1 names", () => {
    expect(v1Trade({ proxy_wallet: "w", condition_id: "c", outcome_index: 1, transaction_hash: "t", event_slug: "e", token_id: "9" }))
      .toEqual({ proxyWallet: "w", conditionId: "c", outcomeIndex: 1, transactionHash: "t", eventSlug: "e", tokenId: "9", asset: "9" });
    expect(tradesCursor({ data: [], pagination: { has_more: false, next_cursor: "x" } })).toBeNull();
  });

  it("the moves poller pages by cursor and still finds a big bet", async () => {
    const now = Date.now();
    const seen: Array<[number, string | null]> = [];
    const pages = [
      { data: [...Array.from({ length: 499 }, (_, i) => row({ wallet: W(String(i % 9)), usd: 600, at: now - 60_000, market: "0xm" + i, tx: `0x${i}`.padEnd(66, "a") })),
        row({ wallet: W("b"), usd: 12_000, at: now - 60_000, market: "0xbig", tx: "0x".padEnd(66, "b") })], pagination: { has_more: true, next_cursor: "p2" } },
      { data: [row({ wallet: W("c"), usd: 600, at: now - 2 * 3_600_000, market: "0xold", tx: "0x".padEnd(66, "c") })], pagination: { has_more: false } },
    ];
    const poller = new MovesPoller({
      polyTradesPage: async (page, cursor) => { seen.push([page, cursor]); return { data: pages[page]!.data.map(v1Trade), pagination: pages[page]!.pagination }; },
      polyWalletTrades: async () => [], kalshiTradesPage: async () => ({ trades: [] }),
    });
    const moves = await poller.pollPolymarket(now, new Map());
    expect(seen).toEqual([[0, null], [1, "p2"]]);
    expect(moves.map(m => [m.wallet, m.marketId, m.amount])).toEqual([[W("b"), "0xbig", 12_000]]);
  });
});

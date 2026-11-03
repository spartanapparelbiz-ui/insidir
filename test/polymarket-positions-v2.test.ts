/* Polymarket retired the v1 wallet endpoints (HTTP 410 Gone): /closed-positions (the worker's moves:records and the
 * proven-wallet backfill), /positions, /activity and /v1/leaderboard. Wallet records now come from
 * GET /v2/positions?status=CLOSED, open positions from /v2/positions?status=OPEN, the leaderboard from /v2/leaderboard,
 * activity from /v2/activity only. All page by cursor (v2 rejects offset) and answer snake_case rows inside
 * { data, pagination }; the client maps position rows back to the v1 names every parser reads (v1Position). */
import { describe, expect, it } from "vitest";
import { PolymarketClient, readPositions, tradesCursor, v1Position } from "@/lib/exchanges/polymarket";
import { readWalletPnl } from "@/lib/moves/proven-backfill";
import { leaderboardCursor, readClosedPositions, readLeaderboard, readUserPnl } from "@/lib/moves/sources";
import { readClosedRows } from "@/lib/profiles/trader";
import { fixture, testHttp } from "./fixtures/exchanges/harness";

const client = (body: (url: string) => unknown) => {
  const { http, calls } = testHttp(url => ({ body: body(url) }));
  return { c: new PolymarketClient({ gamma: http, clob: http, data: http, dataUrl: "https://data.test" }), calls };
};

describe("Polymarket wallet endpoints on v2 (the v1 ones answer 410)", () => {
  it("closed positions: /v2/positions?status=CLOSED by cursor, biggest profit first, never /closed-positions or an offset", async () => {
    const { c, calls } = client(() => fixture("data-positions-closed-v2.json"));
    const page = await c.getClosedPositionsPage("0xW", { limit: 50, cursor: "abc", market: "0xc" });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/v2/positions");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ user: "0xW", status: "CLOSED", sortBy: "REALIZED_PNL", sortDirection: "DESC", limit: "50", cursor: "abc", condition: "0xc" });
    expect(u.searchParams.has("offset")).toBe(false);
    // The real v2 rows parse with both readers, the record's and the profile's.
    const n = (fixture("data-positions-closed-v2.json") as { data: unknown[] }).data.length;
    const rec = readClosedPositions(page), prof = readClosedRows(page);
    expect(rec).toHaveLength(n);
    expect(prof).toHaveLength(n);
    expect(rec[0]!.marketId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rec[0]!.realizedPnl).toBeGreaterThan(1_000_000);
    expect(prof[0]).toMatchObject({ outcome: "Yes", outcomeIndex: 0 });
    expect(prof[0]!.moneyIn).toBeGreaterThan(0);
    expect(tradesCursor(page)).toEqual(expect.any(String));
  });

  it("v1Position maps v2's names: size, initial value, cash P&L, price, total bought, time", () => {
    const r = v1Position({ proxy_wallet: "0xw", condition_id: "0xc", token_id: "7", current_size: 10, avg_price: 0.4, total_cost_usdc: 4, current_value: 6, unrealized_pnl: 2, realized_pnl: 1, current_price: 0.6, total_size: 12, last_event_at: 1700000000, outcome_index: 1, event_slug: "e", slug: "m" });
    expect(r).toMatchObject({ proxyWallet: "0xw", conditionId: "0xc", asset: "7", size: 10, avgPrice: 0.4, initialValue: 4, currentValue: 6, cashPnl: 2, realizedPnl: 1, curPrice: 0.6, totalBought: 12, timestamp: 1700000000, outcomeIndex: 1 });
  });

  it("open positions: /v2/positions?status=OPEN by cursor until the last page; the real rows read as positions", async () => {
    const { c, calls } = client(url => {
      const cur = new URL(url).searchParams.get("cursor");
      const f = fixture("data-positions-v2.json") as { data: unknown[] };
      return { data: f.data, pagination: { has_more: !cur, next_cursor: cur ? null : "p2" } };
    });
    const got = await c.getPositions("0xW", { sizeThreshold: 1 });
    expect(calls.map(x => new URL(x.url).pathname)).toEqual(["/v2/positions", "/v2/positions"]);
    expect(calls.map(x => new URL(x.url).searchParams.get("status"))).toEqual(["OPEN", "OPEN"]);
    expect(new URL(calls[1]!.url).searchParams.get("cursor")).toBe("p2");
    expect(calls.some(x => new URL(x.url).searchParams.has("offset"))).toBe(false);
    const n = (fixture("data-positions-v2.json") as { data: unknown[] }).data.length;
    expect(got).toHaveLength(2 * n);
    expect(got[0]!.wallet).toMatch(/^0x[0-9a-f]{40}$/);
    expect(got[0]!.size).toBeGreaterThan(0);
    expect(got[0]!.initialValue).not.toBeNull();
    expect(readPositions({ data: [] })).toEqual([]);
  });

  it("leaderboard: /v2/leaderboard pages and the user lookup read wallet and pnl", async () => {
    const { c, calls } = client(url => (new URL(url).searchParams.get("user") ? fixture("data-leaderboard-user-v2.json") : fixture("data-leaderboard-v2.json")));
    const page = await c.getLeaderboardPage({ timePeriod: "ALL", cursor: "z" });
    expect(new URL(calls[0]!.url).pathname).toBe("/v2/leaderboard");
    expect(new URL(calls[0]!.url).searchParams.get("cursor")).toBe("z");
    const board = readLeaderboard(page);
    expect(board.length).toBe((fixture("data-leaderboard-v2.json") as { data: unknown[] }).data.length);
    expect(board[0]!.wallet).toMatch(/^0x[0-9a-f]{40}$/);
    expect(leaderboardCursor(page)).toEqual(expect.any(String));
    const me = await c.getLeaderboardUser("0x56687bf447db6ffa42ffe2204a05edaa20f55839");
    expect(new URL(calls[1]!.url).pathname).toBe("/v2/leaderboard");
    expect(readUserPnl(me, "0x56687bf447db6ffa42ffe2204a05edaa20f55839")).toBeGreaterThan(1_000_000);
    expect(readUserPnl(me, "0x0000000000000000000000000000000000000001")).toBeNull();
  });

  it("the record path (moves:records' reader) walks cursors to the end and counts each closed market once", async () => {
    const W = "0x56687bf447db6ffa42ffe2204a05edaa20f55839";
    const f = fixture("data-positions-closed-v2.json") as { data: Array<Record<string, unknown>> };
    const { c, calls } = client(url => {
      const p = new URL(url);
      if (p.pathname === "/v2/leaderboard") return fixture("data-leaderboard-user-v2.json");
      const cur = p.searchParams.get("cursor");
      return cur ? { data: f.data.slice(1), pagination: { has_more: false, next_cursor: null } } : { data: f.data, pagination: { has_more: true, next_cursor: "n" } };
    });
    const r = await readWalletPnl(c, W);
    expect(calls.map(x => new URL(x.url).pathname)).toEqual(["/v2/positions", "/v2/positions", "/v2/leaderboard"]);
    expect(r!.v).toMatchObject({ closed: new Set(f.data.map(x => x.condition_id)).size, closedAtLeast: false });
    expect(r!.v.pnl).toBeGreaterThan(1_000_000);
  });

  it("no client call reaches a retired v1 wallet endpoint", async () => {
    const { c, calls } = client(() => ({ data: [], pagination: { has_more: false, next_cursor: null } }));
    await c.getClosedPositionsPage("0xw");
    await c.getPositions("0xw");
    await c.getActivity("0xw");
    await c.getLeaderboardPage({ timePeriod: "ALL" });
    await c.getLeaderboardUser("0xw");
    const paths = calls.map(x => new URL(x.url).pathname);
    expect(paths.every(p => p.startsWith("/v2/"))).toBe(true);
  });
});

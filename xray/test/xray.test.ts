/* The X-ray orchestrator end to end with fetch mocked to the documented Polymarket response shapes.
 * Every wallet, name and number here is SYNTHETIC test data. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redact } from "@/lib/access";
import { resetCache } from "@/lib/cache";
import { readEvent } from "@/lib/polymarket";
import { resolveTarget } from "@/lib/resolve";
import { buildXray } from "@/lib/xray";

const NOW = 1_800_000_000;
const H = 3600;

// Gamma: an event with one open market; outcomes and prices as JSON-encoded strings, as Gamma sends them.
const MARKET = {
  id: "501", slug: "will-example-win", question: "Will Example win?", groupItemTitle: "", conditionId: "0xcond",
  outcomes: '["Yes","No"]', outcomePrices: '["0.22","0.78"]', clobTokenIds: '["tok-yes","tok-no"]',
  closed: false, volume: "1250000.5", endDate: "2026-11-05T00:00:00Z", image: "https://example.invalid/i.png",
};
const EVENT = { id: "9", slug: "example-election", title: "Example election", markets: [MARKET, { ...MARKET, slug: "old-one", conditionId: "0xold", closed: true, outcomePrices: '["0","1"]' }] };

const sharpHistory = Array.from({ length: 15 }, (_, i) => ({ conditionId: "0xc" + i, title: "Past market " + i, realizedPnl: i < 12 ? 900 : -200 }));
const dullHistory = Array.from({ length: 15 }, (_, i) => ({ conditionId: "0xd" + i, title: "Past market " + i, realizedPnl: i < 4 ? 50 : -80 }));

const HOLDERS = [
  { token: "tok-yes", holders: [
    { proxyWallet: "0xdull1", name: "dull", pseudonym: "Grey-Owl", displayUsernamePublic: true, amount: 400000, outcomeIndex: 0 },
    { proxyWallet: "0xsharp3", name: "0xsharp3-1700000000", pseudonym: "Quiet-Heron", displayUsernamePublic: false, amount: 10000, outcomeIndex: 0 },
  ] },
  { token: "tok-no", holders: [
    { proxyWallet: "0xsharp1", name: "alpha", pseudonym: "Calm-Fox", displayUsernamePublic: true, amount: 50000, outcomeIndex: 1 },
    { proxyWallet: "0xsharp2", name: "", pseudonym: "Brisk-Otter", displayUsernamePublic: true, amount: 30000, outcomeIndex: 1 },
    { proxyWallet: "0xbroken", name: "broken", pseudonym: "X", displayUsernamePublic: true, amount: 1000, outcomeIndex: 1 },
  ] },
];

const fill = (o: Record<string, unknown>) => ({ proxyWallet: "0xbig", side: "BUY", size: 50000, price: 0.1, timestamp: NOW - 5 * H, outcome: "Yes", outcomeIndex: 0,
  name: "", pseudonym: "Fresh-Lynx", transactionHash: "0xtx", ...o });
// Big fills (filterAmount=5000): a brand-new wallet buying the long shot in two fills, and an old whale.
const BIG = [
  fill({ proxyWallet: "0xnewbie", size: 60000, price: 0.08, timestamp: NOW - 5 * H }),
  fill({ proxyWallet: "0xnewbie", size: 40000, price: 0.1, timestamp: NOW - 4 * H }),
  fill({ proxyWallet: "0xwhale", size: 30000, price: 0.77, outcome: "No", outcomeIndex: 1, timestamp: NOW - 30 * H }),
];
// The last 24h: $42K net into NO.
const FLOW = [
  fill({ proxyWallet: "0xf1", side: "BUY", size: 60000, price: 0.8, outcome: "No", outcomeIndex: 1, timestamp: NOW - 2 * H }),
  fill({ proxyWallet: "0xf2", side: "SELL", size: 7500, price: 0.8, outcome: "No", outcomeIndex: 1, timestamp: NOW - 3 * H }),
  fill({ proxyWallet: "0xf3", side: "BUY", size: 5000, price: 0.2, outcome: "Yes", outcomeIndex: 0, timestamp: NOW - 1 * H }),
];

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let calls: string[] = [];
function api(url: string): Response {
  const u = new URL(url);
  const p = u.searchParams;
  if (u.hostname === "gamma-api.polymarket.com") {
    if (u.pathname === "/events/slug/example-election") return json(EVENT);
    if (u.pathname === "/markets/slug/will-example-win") return json(MARKET);
    return json({ error: "not found" }, 404);
  }
  if (u.pathname === "/holders") return json(HOLDERS);
  if (u.pathname === "/trades") return json(p.get("filterType") === "CASH" ? BIG : FLOW);
  if (u.pathname === "/closed-positions") {
    const w = p.get("user");
    if (w === "0xbroken") return json({ error: "boom" }, 500);
    return json(w?.startsWith("0xsharp") ? sharpHistory : dullHistory);
  }
  if (u.pathname === "/v2/activity") {
    const w = p.get("user");
    const first = w === "0xnewbie" ? NOW - 5 * H - 120 : NOW - 400 * 24 * H;
    return json({ data: [{ timestamp: first, type: "TRADE" }], pagination: { hasMore: true } });
  }
  if (u.pathname === "/v2/user-stats") return json({ data: p.get("user") === "0xnewbie" ? { trades: 1 } : { trades: 240 } });
  return json({ error: "unexpected " + u.pathname }, 404);
}

beforeEach(() => {
  resetCache();
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return api(url);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the X-ray orchestrator", () => {
  it("reads Gamma's JSON-encoded fields and resolves an event with one open market to that market", async () => {
    const ev = readEvent(EVENT);
    expect(ev?.markets[0]?.outcomes).toEqual(["Yes", "No"]);
    expect(ev?.markets[0]?.prices).toEqual([0.22, 0.78]);
    expect(ev?.markets[0]?.volume).toBe(1250000.5);
    expect(ev?.markets[1]?.resolvedOutcome).toBe("No");
    const r = await resolveTarget({ kind: "event", slug: "example-election", market: null });
    expect(r?.type).toBe("market");
    expect(r?.type === "market" && r.market.slug).toBe("will-example-win");
  });

  it("builds the whole X-ray, still renders when a wallet call fails, and says so", async () => {
    const r = await resolveTarget({ kind: "event", slug: "example-election", market: "will-example-win" });
    if (r?.type !== "market") throw new Error("expected a market");
    const x = await buildXray(r.market, NOW);

    // Sharp money: 0xsharp1 50,000 × 0.78 + 0xsharp2 30,000 × 0.78 on NO; 0xsharp3 10,000 × 0.22 on YES.
    expect(x.sharp.call).toBe(true);
    expect(x.sharp.headline).toBe("Sharp money: 97% NO");
    expect(x.sharp.detail).toBe("3 wallets with proven records hold $64.6K");
    expect(x.sharp.wallets?.map(w => w.name)).toEqual(["alpha", "Brisk-Otter", "Quiet-Heron"]);
    expect(x.sharp.split[1]).toBeCloseTo(62_400 / 64_600);

    // Insider patterns: the new wallet's two fills, one flag, strong.
    expect(x.insider.count).toBe(1);
    expect(x.insider.level).toBe("strong");
    const f = x.insider.flags?.[0];
    expect(f?.wallet).toBe("0xnewbie");
    expect(f?.cash).toBeCloseTo(8_800);
    expect(f?.reasons).toEqual(["First trade 2m before this bet", "Has only traded 1 market", "Bought at 9¢, a long shot"]);
    expect(x.insider.headline).toBe("1 insider pattern in the last 7 days, 1 on a long shot");

    // 24h flow.
    expect(x.flow.headline).toBe("$42K net into NO in the last 24h");

    // One wallet's record couldn't be fetched: partial data, still rendered.
    expect(x.failedWallets).toBe(1);

    // Every request carried the window, the CASH filter and the market.
    expect(calls.some(c => c.includes("/trades?market=0xcond&takerOnly=true") && c.includes("filterType=CASH&filterAmount=5000") && c.includes(`start=${NOW - 7 * 24 * H}`))).toBe(true);
    expect(calls.some(c => c.includes("/trades?") && c.includes(`start=${NOW - 24 * H}`) && c.includes("limit=3000"))).toBe(true);
  });

  it("redaction removes every wallet-level detail and keeps the headlines", async () => {
    const r = await resolveTarget({ kind: "market", slug: "will-example-win" });
    if (r?.type !== "market") throw new Error("expected a market");
    const x = redact(await buildXray(r.market, NOW));
    expect(x.locked).toBe(true);
    expect(x.sharp.headline).toBe("Sharp money: 97% NO");
    expect([x.sharp.detail, x.sharp.wallets, x.insider.flags, x.flow.net]).toEqual([null, null, null, null]);
    expect(x.insider.count).toBe(1);
    expect(JSON.stringify(x)).not.toMatch(/0xsharp|0xnewbie|alpha|Brisk-Otter/);
  });

  it("retries once on 429 after Retry-After, then succeeds", async () => {
    let first = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (first && url.includes("/markets/slug/")) { first = false; return json({ error: "slow down" }, 429, { "Retry-After": "0" }); }
      return api(url);
    }));
    const r = await resolveTarget({ kind: "market", slug: "will-example-win" });
    expect(r?.type).toBe("market");
  });

  it("a resolved market keeps its verdict by shares, and its windows end when it closed", async () => {
    const r = await resolveTarget({ kind: "market", slug: "will-example-win" });
    if (r?.type !== "market") throw new Error("expected a market");
    const closedAt = new Date((NOW - 1.5 * H) * 1000).toISOString();
    const resolved = { ...r.market, closed: true, prices: [0, 1], resolvedOutcome: "No", endDate: closedAt };
    const x = await buildXray(resolved, NOW);
    expect(x.windowEnd).toBe(NOW - 1.5 * H);
    expect(x.sharp.byShares).toBe(true);
    expect(x.sharp.headline).toBe("Sharp money: 89% NO"); // 80,000 of 90,000 proven shares
    expect(x.flow.headline).toBe("$42K net into NO in its last 24h"); // the YES buy an hour ago came after it closed
    expect(x.flow.net?.[0]).toBe(0);
    expect(x.insider.headline).toBe("1 insider pattern in its last 7 days, 1 on a long shot");
  });

  it("no holders and no trades: no call, quiet, nothing flagged", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const u = new URL(url);
      if (u.pathname === "/holders" || u.pathname === "/trades") return json([]);
      return api(url);
    }));
    const r = await resolveTarget({ kind: "market", slug: "will-example-win" });
    if (r?.type !== "market") throw new Error("expected a market");
    const x = await buildXray(r.market, NOW);
    expect(x.sharp.headline).toBe("Not enough proven wallets here yet");
    expect(x.insider.headline).toBe("No insider patterns in the last 7 days");
    expect(x.flow.headline).toBe("Quiet in the last 24h");
    expect(x.failedWallets).toBe(0);
  });
});

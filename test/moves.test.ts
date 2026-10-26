/* docs/V2.md §3–§5, §8, §12: move detection, merging, noise filters, records (the 20-market rule), copy, gating per
 * plan and location rules. */
import { describe, expect, it } from "vitest";
import { classify, leagueOf } from "@/lib/moves/classify";
import { agoText, BANNED_WORDS, dollars, moveSentence, payoutLine, recordLine } from "@/lib/moves/copy";
import { extendMove, kalshiMoves, MERGE_WINDOW_MS, noisyWallet, polymarketMoves, type MarketInfo } from "@/lib/moves/detect";
import { canFollow, movePlan } from "@/lib/moves/gate";
import { isIntlPolymarket, marketLink } from "@/lib/moves/links";
import { MovesPoller } from "@/lib/moves/poll";
import { hasRecord, isTopTrader, recordFrom, shortWallet, walletLabel } from "@/lib/moves/records";
import { readClosedPositions, readKalshiFills, readPolymarketFills } from "@/lib/moves/sources";
import type { Fill, Move } from "@/lib/moves/types";
import type { VMarket } from "@/lib/types";

const T0 = Date.UTC(2026, 9, 26, 15, 0, 0);
const MIN = 60_000;
const W = "0xabc0000000000000000000000000000000000001";

const fill = (o: Partial<Fill> = {}): Fill => ({
  source: "polymarket", id: `f${Math.random()}`, marketId: "C1", eventTitle: "Chiefs vs. Bills", marketTitle: "Chiefs vs. Bills",
  outcome: "Chiefs", outcomeSide: "yes", side: "BUY", contracts: 10_000, price: 0.62, wallet: W, walletName: null, at: T0, url: "https://polymarket.com/event/x", ...o,
});
const info = new Map<string, MarketInfo>([["C1", { category: "sports", labels: ["NFL"], url: "https://polymarket.com/event/x" }]]);

describe("Polymarket moves", () => {
  it("merges a wallet's buys in one market and outcome while each is within 10 minutes of the last", () => {
    const ms = polymarketMoves([fill({ at: T0, contracts: 10_000 }), fill({ at: T0 + 9 * MIN, contracts: 5_000 }), fill({ at: T0 + 17 * MIN, contracts: 2_000 })], info);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.amount).toBeCloseTo((17_000) * 0.62, 2);
    expect(ms[0]!.fills).toBe(3);
    expect(ms[0]!.at).toBe(T0);
  });
  it("starts a new move after a gap over 10 minutes", () => {
    const ms = polymarketMoves([fill({ at: T0, contracts: 20_000 }), fill({ at: T0 + MERGE_WINDOW_MS + 1, contracts: 20_000 })], info);
    expect(ms).toHaveLength(2);
  });
  it("needs $10,000 in total; sells don't count; the other outcome is a separate move", () => {
    expect(polymarketMoves([fill({ contracts: 15_000 })], info)).toHaveLength(0); // $9,300
    expect(polymarketMoves([fill({ side: "SELL", contracts: 50_000 })], info)).toHaveLength(0);
    const ms = polymarketMoves([fill({ contracts: 20_000 }), fill({ outcomeSide: "no", outcome: "Bills", contracts: 30_000, price: 0.38 })], info);
    expect(ms.map(m => m.outcome).sort()).toEqual(["Bills", "Chiefs"]);
  });
  it("skips prices above 97¢ or below 3¢", () => {
    expect(polymarketMoves([fill({ price: 0.98, contracts: 100_000 })], info)).toHaveLength(0);
    expect(polymarketMoves([fill({ price: 0.02, contracts: 1_000_000 })], info)).toHaveLength(0);
  });
  it("classifies sports moves with a league", () => {
    const m = polymarketMoves([fill({ contracts: 20_000 })], info)[0]!;
    expect(m.tab).toBe("sports");
    expect(m.league).toBe("NFL");
  });
  it("extends a stored move with later fills inside the window", () => {
    const m = polymarketMoves([fill({ contracts: 20_000 })], info)[0]!;
    const x = extendMove(m, [fill({ at: T0 + 5 * MIN, contracts: 10_000, price: 0.65 }), fill({ at: T0 + 30 * MIN, contracts: 10_000 })]);
    expect(x.fills).toBe(2);
    expect(x.amount).toBeCloseTo(20_000 * 0.62 + 10_000 * 0.65, 2);
    expect(x.lastAt).toBe(T0 + 5 * MIN);
  });
});

describe("noise wallets", () => {
  it("market makers: buys on both sides of one market within an hour", () => {
    const t = [{ marketId: "C1", outcomeSide: "yes" as const, side: "BUY" as const, at: T0 }, { marketId: "C1", outcomeSide: "no" as const, side: "BUY" as const, at: T0 + 50 * MIN }];
    expect(noisyWallet(t, "C1", T0 + 60 * MIN)).toBe(true);
    expect(noisyWallet([t[0]!, { ...t[1]!, at: T0 + 70 * MIN }], "C1", T0 + 80 * MIN)).toBe(false);
  });
  it("bots: more than 300 trades in a day", () => {
    const t = Array.from({ length: 301 }, (_, i) => ({ marketId: `M${i}`, outcomeSide: "yes" as const, side: "BUY" as const, at: T0 - i * 1000 }));
    expect(noisyWallet(t, "C1", T0)).toBe(true);
    expect(noisyWallet(t.slice(0, 300), "C1", T0)).toBe(false);
  });
});

describe("Kalshi moves", () => {
  const market = { id: "KXNFLGAME-26NOV09KCBUF-KC", venue: "kalshi", title: "Chiefs vs. Bills winner?", eventTitle: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills",
    url: "https://kalshi.com/markets/kxnflgame", category: "sports", seriesId: "KXNFLGAME", eventId: "KXNFLGAME-26NOV09KCBUF" } as unknown as VMarket;
  const raw = { trades: [
    { trade_id: "t1", ticker: market.id, count: 10_000, yes_price: 55, no_price: 45, taker_side: "yes", created_time: "2026-10-26T15:00:00Z" },
    { trade_id: "t2", ticker: market.id, count: 5_000, yes_price: 55, no_price: 45, taker_side: "no", created_time: "2026-10-26T15:00:01Z" },
    { trade_id: "t3", ticker: "UNKNOWN", count: 100_000, yes_price: 50, no_price: 50, taker_side: "yes", created_time: "2026-10-26T15:00:02Z" },
    { trade_id: "t4", ticker: market.id, count_fp: "8000.00", yes_price_dollars: "0.9800", no_price_dollars: "0.0200", taker_side: "yes", created_time: "2026-10-26T15:00:03Z" },
  ] };
  const fills = readKalshiFills(raw, new Map([[market.id, market]]));
  it("reads trades (cents or dollar fields), skipping markets we don't know", () => {
    expect(fills.map(f => f.id)).toEqual(["t1", "t2", "t4"]);
    expect(fills[0]).toMatchObject({ outcome: "Chiefs", outcomeSide: "yes", price: 0.55, contracts: 10_000, wallet: null });
    expect(fills[1]).toMatchObject({ outcome: "Bills", outcomeSide: "no", price: 0.45 });
    expect(fills[2]!.price).toBe(0.98);
  });
  it("a move is one trade of $5,000 or more, priced between 3¢ and 97¢", () => {
    const ms = kalshiMoves(fills, new Map([[market.id, { category: "sports", labels: ["KXNFLGAME"], url: market.url }]]));
    expect(ms.map(m => m.id)).toEqual(["ks:t1"]); // t2 is $2,250; t4 is at 98¢
    expect(ms[0]).toMatchObject({ amount: 5_500, wallet: null, tab: "sports", league: "NFL" });
  });
});

describe("Polymarket Data API rows", () => {
  it("reads trades with wallet, outcome side and name", () => {
    const f = readPolymarketFills([{ proxyWallet: "0xABC", side: "BUY", conditionId: "C1", size: 1000, price: 0.4, timestamp: 1792998000, title: "Fed rate cut in December?",
      outcome: "No", outcomeIndex: 1, pseudonym: "Quiet-Fox", transactionHash: "0x1", eventSlug: "fed", slug: "fed-dec" }]);
    expect(f[0]).toMatchObject({ wallet: "0xabc", outcome: "No", outcomeSide: "no", walletName: "Quiet-Fox", at: 1792998000_000, url: "https://polymarket.com/event/fed/fed-dec" });
  });
  it("reads closed positions", () => {
    expect(readClosedPositions([{ conditionId: "C1", realizedPnl: 120.5 }, { conditionId: "C2" }])).toEqual([{ marketId: "C1", realizedPnl: 120.5 }]);
  });
});

describe("trader records", () => {
  const positions = (won: number, lost: number) => [
    ...Array.from({ length: won }, (_, i) => ({ marketId: `W${i}`, realizedPnl: 1000 + i })),
    ...Array.from({ length: lost }, (_, i) => ({ marketId: `L${i}`, realizedPnl: -500 })),
  ];
  it("counts markets won and lost, profit and biggest win; one result per market", () => {
    const r = recordFrom(W, null, [...positions(3, 2), { marketId: "W0", realizedPnl: -200 }], T0);
    expect(r).toMatchObject({ resolved: 5, won: 3, lost: 2, biggestWin: 1002 });
    expect(r.profit).toBeCloseTo(1000 - 200 + 1001 + 1002 - 1000, 2);
  });
  it("shows a record only with 20+ resolved markets; top trader also needs positive profit", () => {
    expect(hasRecord(recordFrom(W, null, positions(15, 4), T0))).toBe(false);
    const ok = recordFrom(W, null, positions(15, 5), T0);
    expect(hasRecord(ok)).toBe(true);
    expect(isTopTrader(ok)).toBe(true);
    expect(isTopTrader(recordFrom(W, null, [...positions(5, 15)], T0))).toBe(false);
    expect(recordLine(recordFrom(W, null, positions(19, 0), T0))).toBeNull();
  });
  it("names: the public name or a short address, never anything else", () => {
    expect(shortWallet(W)).toBe("0xab…01");
    expect(walletLabel(W, "Quiet-Fox")).toBe("Quiet-Fox");
    expect(walletLabel(W, "0xabc000000")).toBe("0xab…01");
    expect(walletLabel(W, null)).toBe("0xab…01");
  });
});

describe("plain-English copy", () => {
  const base = polymarketMoves([fill({ contracts: 664_516, price: 0.62 })], info)[0]!;
  const top = recordFrom(W, null, Array.from({ length: 63 }, (_, i) => ({ marketId: `M${i}`, realizedPnl: i < 41 ? 50_000 : -40_000 })), T0);
  it("top trader, wallet and Kalshi sentences", () => {
    expect(moveSentence({ ...base, amount: 412_000 }, top)).toBe("A top trader just put $412,000 on Chiefs to win.");
    const fed: Move = { ...base, tab: "markets", outcome: "Yes", marketTitle: "Fed rate cut in December?", amount: 85_000 };
    expect(moveSentence(fed, null)).toBe('A wallet just put $85,000 on "Yes" in "Fed rate cut in December?".');
    expect(moveSentence({ ...base, source: "kalshi", outcome: "Lakers", amount: 48_000 }, null)).toBe("Someone just put $48,000 on Lakers to win.");
  });
  it("payout in dollars per $100, record line, time", () => {
    expect(payoutLine({ outcome: "Chiefs", avgPrice: 0.62, tab: "sports" })).toBe("Pays $161 on every $100 if Chiefs win.");
    expect(payoutLine({ outcome: "Yes", avgPrice: 0.25, tab: "markets" })).toBe("Pays $400 on every $100 if the answer is Yes.");
    expect(recordLine(top)).toBe("Won 41 of 63 · +$1.2M all-time");
    expect(agoText(T0 - 2 * MIN, T0)).toBe("2 min ago");
    expect(dollars(1_234_567)).toBe("$1.2M");
  });
  it("never uses the banned words", () => {
    const lines = [moveSentence(base, top), payoutLine(base)!, recordLine(top)!, moveSentence({ ...base, source: "kalshi" }, null)];
    for (const l of lines) for (const b of BANNED_WORDS) expect(l, l).not.toMatch(b);
  });
});

describe("classification", () => {
  it("leagues from tags, series and titles", () => {
    expect(leagueOf(["KXNBAGAME"])).toBe("NBA");
    expect(leagueOf(["Premier League", "Arsenal vs Spurs"])).toBe("soccer");
    expect(leagueOf(["UFC 310"])).toBe("UFC");
    expect(leagueOf(["Who wins?"])).toBe("other");
    expect(classify("politics", [])).toEqual({ tab: "markets", league: null });
    expect(classify("crypto", [])).toEqual({ tab: "crypto", league: null });
  });
});

describe("gating per plan", () => {
  it("free: 30 minutes late, no records, no follows, no alerts", () => {
    expect(movePlan("free")).toMatchObject({ delayMs: 30 * MIN, records: false, maxFollows: 0, alerts: false });
    expect(canFollow("free", 0)).toBe(false);
  });
  it("Insidir: live, records, 50 follows, alerts, daily email; Pro adds custom rules, unlimited follows, Price gaps", () => {
    expect(movePlan("insidir")).toMatchObject({ delayMs: 0, records: true, maxFollows: 50, alerts: true, dailyEmail: true, customRules: false, priceGaps: false });
    expect(canFollow("insidir", 49)).toBe(true);
    expect(canFollow("insidir", 50)).toBe(false);
    expect(canFollow("pro", 10_000)).toBe(true);
    expect(movePlan("pro")).toMatchObject({ customRules: true, priceGaps: true });
  });
});

describe("location rules", () => {
  const pm = { source: "polymarket" as const, url: "https://polymarket.com/event/x" };
  it("a US (or unknown) viewer never gets an international Polymarket link", () => {
    for (const region of ["us", null] as const) {
      expect(marketLink(pm, region, null)).toBeNull();
      const k = marketLink(pm, region, "https://kalshi.com/markets/kx");
      expect(k).toEqual({ href: "https://kalshi.com/markets/kx", label: "See it on Kalshi" });
      expect(isIntlPolymarket(k!.href)).toBe(false);
    }
  });
  it("outside the US: the source market; Kalshi moves link to Kalshi everywhere", () => {
    expect(marketLink(pm, "non_us", null)).toEqual({ href: pm.url, label: "See it on Polymarket" });
    expect(marketLink({ source: "kalshi", url: "https://kalshi.com/m" }, "us", null)?.href).toBe("https://kalshi.com/m");
    expect(isIntlPolymarket("https://polymarket.us/market/x")).toBe(false);
    expect(isIntlPolymarket("https://polymarket.com/event/x")).toBe(true);
  });
});

describe("the poller", () => {
  it("merges fills across polls, skips noisy wallets, and reads Kalshi pages once", async () => {
    const page = (rows: unknown[]) => rows;
    let polls = 0;
    const poller = new MovesPoller({
      polyTradesPage: async () => page(polls++ === 0
        ? [{ proxyWallet: W, side: "BUY", conditionId: "C1", size: 10_000, price: 0.6, timestamp: T0 / 1000, outcome: "Chiefs", outcomeIndex: 0, transactionHash: "0x1" },
           { proxyWallet: "0xmm", side: "BUY", conditionId: "C1", size: 40_000, price: 0.6, timestamp: T0 / 1000, outcome: "Chiefs", outcomeIndex: 0, transactionHash: "0x2" }]
        : [{ proxyWallet: W, side: "BUY", conditionId: "C1", size: 10_000, price: 0.6, timestamp: T0 / 1000 + 300, outcome: "Chiefs", outcomeIndex: 0, transactionHash: "0x3" }]),
      polyWalletTrades: async w => (w === "0xmm" ? [{ marketId: "C1", outcomeSide: "yes", side: "BUY", at: T0 }, { marketId: "C1", outcomeSide: "no", side: "BUY", at: T0 + 1000 }] : []),
      kalshiTradesPage: async () => ({ trades: [], cursor: "" }),
    });
    const first = await poller.pollPolymarket(T0 + 60_000, info);
    expect(first).toHaveLength(0); // $6,000 so far; the market maker is skipped
    const second = await poller.pollPolymarket(T0 + 360_000, info);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ wallet: W, amount: 12_000, fills: 2 });
    expect(await poller.pollKalshi(T0, new Map(), info)).toEqual([]);
  });
});

/* docs/INSIDIR-V2.md §3–§5, §8, §12: move detection, merging, noise filters, records (the 20-market rule), copy, gating per
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
      outcome: "No", outcomeIndex: 1, name: "kch123", pseudonym: "Quiet-Fox", transactionHash: "0x1", eventSlug: "fed", slug: "fed-dec" }]);
    expect(f[0]).toMatchObject({ wallet: "0xabc", outcome: "No", outcomeSide: "no", walletName: "kch123", at: 1792998000_000, url: "https://polymarket.com/event/fed/fed-dec" });
    // The public username only: an auto-made pseudonym, a hidden username or an address is no name.
    const row = { proxyWallet: "0xABC", side: "BUY", conditionId: "C1", size: 1000, price: 0.4, timestamp: 1792998000, title: "T", outcomeIndex: 0 };
    expect(readPolymarketFills([{ ...row, pseudonym: "Quiet-Fox" }])[0]!.walletName).toBeNull();
    expect(readPolymarketFills([{ ...row, name: "kch123", displayUsernamePublic: false }])[0]!.walletName).toBeNull();
    expect(readPolymarketFills([{ ...row, name: "0xabc1234567" }])[0]!.walletName).toBeNull();
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
  it("name the trader: username, short address, brand-new wallet, Kalshi's someone", () => {
    expect(moveSentence({ ...base, amount: 412_000 }, top)).toBe("0xab…01, a top trader, just put $412,000 on Chiefs to win.");
    expect(moveSentence({ ...base, amount: 412_000, walletName: "kch123" }, top)).toBe("kch123, a top trader, just put $412,000 on Chiefs to win.");
    // Free viewers get no record, so nobody is called a top trader; the name is for everyone.
    expect(moveSentence({ ...base, amount: 412_000, walletName: "kch123" }, null)).toBe("kch123 just put $412,000 on Chiefs to win.");
    expect(moveSentence({ ...base, amount: 200_000, newWallet: true }, null)).toBe("A brand-new wallet just put $200,000 on Chiefs to win.");
    const fed: Move = { ...base, tab: "markets", outcome: "Yes", marketTitle: "Fed rate cut in December?", amount: 85_000 };
    expect(moveSentence(fed, null)).toBe('0xab…01 just put $85,000 on "Yes" in "Fed rate cut in December?".');
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

/* ---------- V2 step 3: alerts, the daily email, share cards and posts ---------- */
import { alertJobs, alertMessage, dailyDue, dailyEmail, hourInNewYork, reasonFor, ruleMatches, type AlertUser as MoveAlertU } from "@/lib/moves/alerts";
import { moveCardText } from "@/lib/move-card";
import { postCaption, postsAllowed } from "@/lib/moves/posts";
import { liveEmail } from "@/lib/moves/waitlist";
import { BANNED_WORDS as BANNED } from "@/lib/moves/copy";
import { parseSettings } from "@/app/api/settings/validate";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";

describe("move alerts", () => {
  const base: Move = {
    id: "pm:0xaa:mkt1:yes:1", source: "polymarket", marketId: "mkt1", eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs",
    outcomeSide: "yes", amount: 60_000, avgPrice: 0.62, wallet: "0xaa", walletName: null, at: 1_000_000, lastAt: 1_000_000, fills: 3, tab: "sports",
    league: "NFL", category: "sports", url: null, result: null, settledAt: null,
  };
  const user = (o: Partial<MoveAlertU> = {}): MoveAlertU => ({
    id: "u1", plan: "insidir", email: "a@b.co", push: true, emailOn: true, quietStart: null, quietEnd: null, timeZone: null,
    traders: new Set(), markets: new Set(), rules: [], ...o,
  });
  it("sends followed traders' moves on both channels; nothing for Free", () => {
    expect(alertJobs([user({ traders: new Set(["0xaa"]) })], [base], 2_000_000).map(j => `${j.channel}:${j.reason}`)).toEqual(["push:trader", "email:trader"]);
    expect(alertJobs([user({ plan: "free", traders: new Set(["0xaa"]) })], [base], 2_000_000)).toEqual([]);
  });
  it("followed markets alert only from $50,000", () => {
    expect(reasonFor(user({ markets: new Set(["mkt1"]) }), base)).toBe("market");
    expect(reasonFor(user({ markets: new Set(["mkt1"]) }), { ...base, amount: 49_999 })).toBeNull();
  });
  it("custom rules are Pro only and match tab, league and size", () => {
    const rules = [{ tab: "sports" as const, league: "NFL" as const, min: 50_000 }];
    expect(reasonFor(user({ rules }), base)).toBeNull();
    expect(reasonFor(user({ plan: "pro", rules }), base)).toBe("rule");
    expect(ruleMatches(rules[0]!, { ...base, league: "NBA" })).toBe(false);
    expect(ruleMatches({ tab: null, league: null, min: 100_000 }, base)).toBe(false);
  });
  it("quiet hours hold every alert back", () => {
    expect(alertJobs([user({ traders: new Set(["0xaa"]), quietStart: "00:00", quietEnd: "23:59", timeZone: "UTC" })], [base], Date.UTC(2026, 9, 26, 12))).toEqual([]);
  });
  it("the message says what happened, links to the market, uses no banned words", () => {
    const msg = alertMessage(base, null, "trader", "https://insidir.com", base.at);
    expect(msg.body).toBe("0xaa just put $60,000 on Chiefs to win. Pays $161 on every $100 if Chiefs win.");
    expect(msg.url).toBe("https://insidir.com/market/mkt1?from=alert");
    for (const re of BANNED) expect(`${msg.title} ${msg.body}`).not.toMatch(re);
  });
  it("the daily email goes out at 8am ET or later, once a day, to paid members who want it", () => {
    const at8 = Date.UTC(2026, 9, 26, 12, 5); // 8:05am EDT
    expect(hourInNewYork(at8)).toBe(8);
    const u = { plan: "insidir" as const, email: "a@b.co", emailDigest: true, lastDigestAt: null };
    expect(dailyDue(u, at8)).toBe(true);
    expect(dailyDue(u, at8 - 3_600_000)).toBe(false);
    expect(dailyDue({ ...u, lastDigestAt: at8 - 3_600_000 }, at8)).toBe(false);
    expect(dailyDue({ ...u, plan: "free" }, at8)).toBe(false);
    expect(dailyDue({ ...u, emailDigest: false }, at8)).toBe(false);
  });
  it("the daily email lists the top moves and how top-trader moves settled", () => {
    const e = dailyEmail([base], [{ ...base, result: "won" }, { ...base, id: "x", result: "lost" }], new Map(), "https://insidir.com");
    const text = e.lines.map(l => l.text).join("\n");
    expect(e.subject).toBe("$60,000 on Chiefs to win, and more");
    expect(text).toContain("0xaa put $60,000 on Chiefs to win.");
    expect(text).toContain("How yesterday's top-trader moves settled: 1 won, 1 lost.");
    for (const re of BANNED) expect(`${e.subject}\n${text}`).not.toMatch(re);
    expect(dailyEmail([], [], new Map(), "x").lines[0]!.text).toBe("No moves of $10,000 or more in the last 24 hours.");
  });
  it("share card text and post captions never advise", () => {
    const t = moveCardText({ ...base, result: "won" }, null);
    expect(t.amount).toBe("$60,000");
    expect(t.on).toBe("on Chiefs to win");
    expect(t.result).toBe("It won.");
    const cap = postCaption(base, null);
    expect(cap.split("\n")[0]).toBe("0xaa put $60,000 on Chiefs to win. Pays $161 on every $100 if Chiefs win.");
    expect(cap).toContain("Not financial advice.");
    for (const re of BANNED) { expect(cap).not.toMatch(re); expect(Object.values(t).join(" ")).not.toMatch(re); }
  });
  it("/admin/posts opens only for allowlisted emails", () => {
    const env = { POSTS_ADMIN_EMAILS: "Owner@Example.com, other@x.co" };
    expect(postsAllowed("owner@example.com", env)).toBe(true);
    expect(postsAllowed("someone@else.com", env)).toBe(false);
    expect(postsAllowed(null, env)).toBe(false);
    expect(postsAllowed("owner@example.com", {})).toBe(false);
  });
  it("the waitlist email says '[Feature] is live on Insidir.'", () => {
    expect(liveEmail("alerts_push", "https://insidir.com").subject).toBe("Phone alerts is live on Insidir.");
  });
  it("settings accept Pro rules, cleaned, at most 10, $10k minimum", () => {
    const ok = parseSettings({ moveRules: [{ tab: "sports", league: "NFL", min: 100_000 }, { tab: "weird", league: "XYZ", min: 20_000 }] }, DEFAULT_SETTINGS, null, false);
    expect(ok.errors).toEqual([]);
    expect(ok.settings.moveRules).toEqual([{ tab: "sports", league: "NFL", min: 100_000 }, { tab: null, league: null, min: 20_000 }]);
    expect(parseSettings({ moveRules: [{ min: 5 }] }, DEFAULT_SETTINGS, null, false).errors.length).toBe(1);
  });
});

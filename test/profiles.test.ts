/* Who is behind a move and their profile (docs/INSIDIR-V2.md §6): names as filed or as public, profile stats from real
 * resolved positions and SEC filings, and the "why this matters" rules, each one tested on its own. */
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "@/lib/moves/copy";
import { MovesPoller } from "@/lib/moves/poll";
import { publicUsername, readLeaderboard } from "@/lib/moves/sources";
import type { Move, StockDetail } from "@/lib/moves/types";
import { profitPath } from "@/lib/profiles/chart";
import { insiderWho, parseProfileId, personName, profileHref, roleOf } from "@/lib/profiles/name";
import { insiderTotals, quarterChanges, topHoldings, tradesByFiling } from "@/lib/profiles/sec";
import { byMarket, categoryOf, readClosedRows, showStats, traderStats, windowStats, type MarketResult } from "@/lib/profiles/trader";
import { etDay, whyLine, type WhyFacts } from "@/lib/profiles/why";
import { form4List, tradeRows } from "@/lib/stocks/history";
import type { Ownership } from "@/lib/stocks/form4";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26, 18, 0, 0); // Oct 26 2026, 2pm ET
const W = "0xabc0000000000000000000000000000000000001";

describe("names", () => {
  it("SEC filers as filed: LAST FIRST MIDDLE in any case, commas, suffixes, entities", () => {
    expect(personName("HUANG JEN HSUN")).toBe("Jen Hsun Huang");
    expect(personName("Cook Timothy D")).toBe("Timothy D. Cook");
    expect(personName("MCDONALD RONALD A JR")).toBe("Ronald A. McDonald Jr.");
    expect(personName("O'BRIEN MARY-KATE")).toBe("Mary-Kate O'Brien");
    expect(personName("Smith, John A.")).toBe("John A. Smith");
    expect(personName("BERKSHIRE HATHAWAY INC")).toBe("BERKSHIRE HATHAWAY");
    expect(personName("Elliott Investment Management L.P.")).toBe("Elliott Investment Management");
  });
  it("the role without its article, and the card's who", () => {
    expect(roleOf("The CEO")).toBe("CEO");
    expect(roleOf("A director")).toBe("a director");
    expect(roleOf("An executive")).toBe("an executive");
    expect(roleOf("A 10% owner")).toBe("a 10% owner");
    expect(insiderWho("HUANG JEN HSUN", "The CEO", "Nvidia")).toBe("Jen Hsun Huang, CEO of Nvidia");
  });
  it("profile ids: a wallet, an insider, a fund; nothing else", () => {
    expect(profileHref({ kind: "trader", wallet: W.toUpperCase().replace("0X", "0x") })).toBe(`/p/${W}`);
    expect(profileHref({ kind: "insider", cik: "0001045810" })).toBe("/p/insider-1045810");
    expect(profileHref({ kind: "fund", cik: "0001067983" })).toBe("/p/fund-1067983");
    expect(parseProfileId(W)).toEqual({ kind: "trader", wallet: W });
    expect(parseProfileId("insider-1045810")).toEqual({ kind: "insider", cik: "1045810" });
    expect(parseProfileId("fund-0001067983")).toEqual({ kind: "fund", cik: "1067983" });
    for (const bad of ["0x12", "insider-", "insider-0", "fund-abc", "someone", "kalshi-1"]) expect(parseProfileId(bad)).toBeNull();
  });
  it("Polymarket: the public username only, never a pseudonym or a hidden name", () => {
    expect(publicUsername({ name: "kch123" })).toBe("kch123");
    expect(publicUsername({ userName: "kch123" })).toBe("kch123");
    expect(publicUsername({ pseudonym: "Quiet-Fox" })).toBeNull();
    expect(publicUsername({ name: "kch123", displayUsernamePublic: false })).toBeNull();
    expect(readLeaderboard([{ proxyWallet: W.toUpperCase().replace("0X", "0x"), userName: "kch123", pnl: 1 }, { proxyWallet: "nope" }])).toEqual([{ wallet: W, name: "kch123" }]);
  });
});

/* ---------- Polymarket trader stats ---------- */

const mk = (i: number, pnl: number, o: Partial<MarketResult> = {}): MarketResult =>
  ({ marketId: `M${i}`, title: `Market ${i}`, category: "NBA", tab: "sports", moneyIn: 1000, pnl, resolvedAt: NOW - (100 - i) * DAY, ...o });

describe("trader stats", () => {
  it("reads closed positions: money in = shares bought × average price", () => {
    const rows = readClosedRows([{ conditionId: "C1", outcomeIndex: 1, outcome: "No", title: "Lakers vs Celtics", eventSlug: "nba-lal-bos", avgPrice: 0.4, totalBought: 2500, realizedPnl: 1500, timestamp: 1792998000 },
      { conditionId: "C2" }]);
    expect(rows).toEqual([{ marketId: "C1", outcomeIndex: 1, title: "Lakers vs Celtics", outcome: "No", eventSlug: "nba-lal-bos", slug: null, moneyIn: 1000, pnl: 1500, resolvedAt: 1792998000_000 }]);
  });
  it("categories from the market's words, or the feed's own tab", () => {
    expect(categoryOf(["Lakers vs Celtics", "nba-lal-bos"])).toEqual({ tab: "sports", category: "NBA" });
    expect(categoryOf(["Arsenal vs Spurs", "epl-ars-tot"])).toEqual({ tab: "sports", category: "Soccer" });
    expect(categoryOf(["Bitcoin above $100k on Friday?", "bitcoin-above-100k"])).toEqual({ tab: "crypto", category: "Crypto" });
    expect(categoryOf(["Fed rate cut in December?", "fed-dec"])).toEqual({ tab: "markets", category: "Markets" });
    expect(categoryOf(["Chiefs vs Bills", "kc-buf"], "sports")).toEqual({ tab: "sports", category: "Other sports" });
  });
  it("one result per market: both outcomes of a market net out", () => {
    const m = byMarket([mk(1, 500), mk(1, -200, { moneyIn: 300 })]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ pnl: 300, moneyIn: 1300 });
  });
  it("win rate, profit, return, biggest win, best category, last 30 days, streak, average bet, chart, categories", () => {
    const list: MarketResult[] = [
      ...Array.from({ length: 12 }, (_, i) => mk(i, i % 3 === 0 ? -400 : 900)),                                   // NBA: 8 won, 4 lost
      ...Array.from({ length: 6 }, (_, i) => mk(20 + i, 2000, { category: "Markets", tab: "markets", moneyIn: 4000 })), // Markets: 6 won
      mk(40, 50_000, { category: "NFL", moneyIn: 10_000 }),                                                          // one huge NFL win (1 market)
      // the last three to resolve, inside 30 days: lost, won, won
      mk(97, -1000), mk(98, 300), mk(99, 700),
    ];
    const s = traderStats(list, NOW);
    expect(s).toMatchObject({ resolved: 22, won: 17, lost: 5 });
    expect(s.profit).toBe(8 * 900 - 4 * 400 + 6 * 2000 + 50_000 - 1000 + 300 + 700);
    expect(s.moneyIn).toBe(12 * 1000 + 6 * 4000 + 10_000 + 3 * 1000);
    expect(s.roi).toBeCloseTo(s.profit / s.moneyIn, 10);
    expect(s.biggestWin).toBe(50_000);
    // NFL made the most but over 1 market (fewer than 5): Markets is the best category.
    expect(s.best).toEqual({ category: "Markets", won: 6, lost: 0, profit: 12_000 });
    expect(s.last30).toEqual({ won: 2, resolved: 3, profit: 0 });
    expect(s.streak).toEqual({ kind: "won", n: 2 });
    expect(s.avgBet).toBe(Math.round((s.moneyIn / 22) * 100) / 100);
    expect(s.series.at(-1)!.profit).toBe(s.profit);
    expect(s.categories.map(c => c.category)).toEqual(["NFL", "Markets", "NBA"]);
    expect(showStats(s)).toBe(true);
    expect(showStats(traderStats(list.slice(0, 19), NOW))).toBe(false);
  });
  it("a window's stats only count markets that resolved in it", () => {
    const list = [mk(1, 100, { resolvedAt: NOW - 3 * DAY }), mk(2, -50, { resolvedAt: NOW - 20 * DAY }), mk(3, 500, { resolvedAt: NOW - 40 * DAY, tab: "markets" })];
    expect(windowStats(list, NOW - 7 * DAY, null)).toEqual({ resolved: 1, won: 1, profit: 100 });
    expect(windowStats(list, NOW - 30 * DAY, "sports")).toEqual({ resolved: 2, won: 1, profit: 50 });
    expect(windowStats(list, null, "markets")).toEqual({ resolved: 1, won: 1, profit: 500 });
  });
  it("the profit chart is a step line through every resolution day, ending at all-time profit", () => {
    const c = profitPath([{ at: 0, profit: 100 }, { at: DAY, profit: -50 }, { at: 2 * DAY, profit: 300 }])!;
    expect(c.path.startsWith("M")).toBe(true);
    expect(c.path.match(/H/g)).toHaveLength(2);
    expect(c.last).toBe(300);
    expect(c.min).toBe(-50);
    expect(profitPath([{ at: 0, profit: 1 }])).toBeNull();
  });
});

/* ---------- SEC: insiders and funds ---------- */

const own = (o: Partial<Ownership> = {}): Ownership => ({
  issuerCik: "0001045810", issuerName: "NVIDIA CORP", ticker: "NVDA", documentType: "4",
  owners: [{ cik: "0001197647", name: "HUANG JEN HSUN", isDirector: true, isOfficer: true, isTenPercentOwner: false, officerTitle: "President and CEO", otherText: null }],
  lines: [
    { code: "P", acquiredDisposed: "A", derivative: false, date: "2026-10-20", shares: 1000, price: 140.5, value: 140_500, security: "Common Stock" },
    { code: "S", acquiredDisposed: "D", derivative: false, date: "2026-10-21", shares: 500, price: 150, value: 75_000, security: "Common Stock" },
    { code: "M", acquiredDisposed: "A", derivative: false, date: "2026-10-21", shares: 900, price: 10, value: 9000, security: "Common Stock" },
    { code: "P", acquiredDisposed: "A", derivative: true, date: "2026-10-21", shares: 10, price: 5, value: 50, security: "Option" },
    ...(o.lines ?? []),
  ],
  ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== "lines")),
});

describe("insider history", () => {
  const url = "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000001/0001197647-26-000001-index.htm";
  it("keeps every open-market buy and sale of stock, nothing else, with its filing", () => {
    const rows = tradeRows(own(), "000119764726000001", NOW, url);
    expect(rows.map(r => [r.code, r.line, r.value])).toEqual([["P", 0, 140_500], ["S", 1, 75_000]]);
    expect(rows[0]).toMatchObject({ ownerCik: "1197647", issuerCik: "1045810", company: "NVIDIA", ticker: "NVDA", role: "The CEO", url });
    expect(tradeRows(own({ documentType: "4/A" }), "x", NOW, url)).toEqual([]);
  });
  it("a jointly filed line is stored for each owner with a CIK", () => {
    const o = own({ owners: [...own().owners, { cik: "0000000002", name: "HUANG FAMILY TRUST", isDirector: false, isOfficer: false, isTenPercentOwner: false, officerTitle: null, otherText: null },
      { cik: null, name: "Nobody", isDirector: false, isOfficer: false, isTenPercentOwner: false, officerTitle: null, otherText: null }] });
    expect(tradeRows(o, "a", NOW, url).filter(r => r.code === "P").map(r => r.ownerCik)).toEqual(["1197647", "2"]);
  });
  it("totals and one row per filing and side", () => {
    const base = { company: "Nvidia", ticker: "NVDA", url, filedAt: NOW };
    const trades = [
      { ...base, accession: "a", code: "P" as const, shares: 100, price: 10, value: 1000, tradeDate: "2026-10-01" },
      { ...base, accession: "a", code: "P" as const, shares: 100, price: 12, value: 1200, tradeDate: "2026-10-02" },
      { ...base, accession: "b", code: "S" as const, shares: 50, price: 20, value: 1000, tradeDate: "2026-10-03" },
    ];
    expect(insiderTotals(trades)).toEqual({ bought: 2200, sold: 1000, buys: 1, sales: 1 });
    const rows = tradesByFiling(trades);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ accession: "a", shares: 200, value: 2200, price: 11, tradeDate: "2026-10-02", lines: 2 });
  });
  it("lists Form 4 originals newest first, back to a date", () => {
    const subs = { filings: { recent: {
      form: ["4", "4/A", "4", "10-K", "4"], accessionNumber: ["0001-26-000003", "0001-26-000002", "0000000001-26-000001", "0000000001-25-000009", "0000000001-15-000001"].map(a => a.length === 20 ? a : a.replace(/^0001/, "0000000001")),
      filingDate: ["2026-10-20", "2026-10-19", "2026-09-01", "2025-03-01", "2015-01-01"],
    } } };
    expect(form4List(subs, "2016-10-26", 300)).toEqual([{ accession: "000000000126000003", filedOn: "2026-10-20" }, { accession: "000000000126000001", filedOn: "2026-09-01" }]);
    expect(form4List(subs, "2016-10-26", 1)).toHaveLength(1);
  });
});

describe("fund history", () => {
  const h = (cusip: string, shares: number, value: number) => ({ cusip, company: cusip, shares, value });
  it("top 10 holdings by value, with their share of everything reported", () => {
    const list = Array.from({ length: 12 }, (_, i) => h(`C${i}`, 10, (i + 1) * 100));
    const top = topHoldings(list);
    expect(top).toHaveLength(10);
    expect(top[0]).toMatchObject({ cusip: "C11", value: 1200 });
    expect(top[0]!.share).toBeCloseTo(1200 / 7800, 10);
  });
  it("adds, new positions, cuts and positions sold out, by dollars", () => {
    const prev = [h("A", 100, 10_000), h("B", 100, 10_000), h("C", 100, 5_000)];
    const cur = [h("A", 300, 36_000), h("B", 40, 4_800), h("D", 10, 2_000)];
    const { adds, cuts } = quarterChanges(prev, cur);
    expect(adds).toEqual([{ cusip: "A", company: "A", shares: 200, value: 24_000, kind: "added" }, { cusip: "D", company: "D", shares: 10, value: 2_000, kind: "new" }]);
    expect(cuts).toEqual([{ cusip: "B", company: "B", shares: 60, value: 7_200, kind: "cut" }, { cusip: "C", company: "C", shares: 100, value: 5_000, kind: "sold" }]);
  });
});

/* ---------- "Why this matters" ---------- */

const pm = (o: Partial<Move> = {}): Move => ({
  id: "pm:1", source: "polymarket", marketId: "C1", eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs", outcomeSide: "yes",
  amount: 200_000, avgPrice: 0.62, wallet: W, walletName: null, at: NOW - 10 * 60_000, lastAt: NOW - 10 * 60_000, fills: 1, tab: "sports", league: "NFL",
  category: "sports", url: null, result: null, settledAt: null, ...o,
});
const facts = (o: Partial<WhyFacts> = {}): WhyFacts => ({ records: true, moveDay: etDay(NOW - 10 * 60_000), today: etDay(NOW), ...o });

const insiderDetail = (o: Partial<Extract<StockDetail, { kind: "insider" }>> = {}): StockDetail => ({
  kind: "insider", company: "Nvidia", ticker: "NVDA", issuerCik: "0001045810", role: "The CEO", ownerName: "HUANG JEN HSUN", ownerCik: "0001197647",
  shares: 10_000, pricePerShare: 140, tradeDate: "2026-10-20", filedAt: NOW - DAY, accession: "000119764726000001", ...o,
});
const insider = (d = insiderDetail(), amount = 1_400_000): Move => pm({ id: "f4:x", source: "sec", tab: "stocks", amount, avgPrice: 140, wallet: null, detail: d });
const fundDetail = (o: Partial<Extract<StockDetail, { kind: "fund" }>> = {}): StockDetail => ({
  kind: "fund", company: "Chevron", cusip: "166764100", fund: "Berkshire Hathaway", fundCik: "0001067983", period: "2026-09-30", filedOn: "2026-10-14",
  addedShares: 1_000_000, prevShares: 1_000_000, curShares: 2_000_000, curValue: 300_000_000, newPosition: false, accession: "a", prevAccession: "b", ...o,
});
const fund = (d: StockDetail): Move => pm({ id: "13f:x", source: "sec", tab: "stocks", amount: 150_000_000, wallet: null, detail: d });

describe("why this matters: prediction markets", () => {
  it("1. biggest bet on this game today: beat every other big move in the market today", () => {
    expect(whyLine(pm(), facts({ sameMarketDay: { others: 2, max: 150_000 } }))).toBe("Biggest bet on this game today.");
    expect(whyLine(pm({ tab: "markets" }), facts({ sameMarketDay: { others: 1, max: 10_000 } }))).toBe("Biggest bet on this market today.");
    expect(whyLine(pm(), facts({ sameMarketDay: { others: 2, max: 250_000 } }))).toBeNull();
    expect(whyLine(pm(), facts({ sameMarketDay: { others: 0, max: 0 } }))).toBeNull(); // alone: nothing to beat
    expect(whyLine(pm(), facts({ sameMarketDay: { others: 2, max: 150_000 }, moveDay: "2026-10-25" }))).toBeNull(); // not today
  });
  it("2. biggest bet this trader has ever made: members, 20+ resolved, more than ever before", () => {
    const f = { traderHasRecord: true, traderBiggestBefore: 120_000 };
    expect(whyLine(pm(), facts(f))).toBe("Biggest bet this trader has ever made.");
    expect(whyLine(pm(), facts({ ...f, traderBiggestBefore: 200_000 }))).toBeNull(); // a tie isn't bigger
    expect(whyLine(pm(), facts({ ...f, traderHasRecord: false }))).toBeNull();
    expect(whyLine(pm(), facts({ ...f, traderBiggestBefore: null }))).toBeNull();
    expect(whyLine(pm(), facts({ ...f, records: false }))).toBeNull(); // free viewers: no records
  });
  it("3. N top traders on the same side: at least 2, members only", () => {
    expect(whyLine(pm(), facts({ topTradersSameSide: 3 }))).toBe("3 top traders are on the same side.");
    expect(whyLine(pm(), facts({ topTradersSameSide: 1 }))).toBeNull();
    expect(whyLine(pm(), facts({ topTradersSameSide: 3, records: false }))).toBeNull();
  });
  it("4. the price moved in the last hour: big moves only", () => {
    expect(whyLine(pm({ avgPrice: 100 / 161 }), facts({ priceHourAgo: 100 / 182 }))).toBe("This price moved from paying $182 to $161 on $100 in the last hour.");
    expect(whyLine(pm({ avgPrice: 0.56 }), facts({ priceHourAgo: 0.55 }))).toBeNull(); // under 10%
    expect(whyLine(pm(), facts({ priceHourAgo: null }))).toBeNull();
  });
  it("the first rule that applies wins; nothing when none does", () => {
    const all = facts({ sameMarketDay: { others: 1, max: 1 }, traderHasRecord: true, traderBiggestBefore: 1, topTradersSameSide: 4, priceHourAgo: 0.3 });
    expect(whyLine(pm(), all)).toBe("Biggest bet on this game today.");
    expect(whyLine(pm(), { ...all, sameMarketDay: undefined })).toBe("Biggest bet this trader has ever made.");
    expect(whyLine(pm(), { ...all, sameMarketDay: undefined, traderBiggestBefore: null })).toBe("4 top traders are on the same side.");
    expect(whyLine(pm(), facts())).toBeNull();
    expect(whyLine(pm({ source: "kalshi", wallet: null }), facts({ priceHourAgo: 0.3 }))).toMatch(/^This price moved/);
  });
});

describe("why this matters: stocks", () => {
  it("5. first buy by the insider in N years, inside a fully read history", () => {
    expect(whyLine(insider(), facts({ ownerPrevBuy: "2022-03-01", ownerCompleteSince: "2016-11-01" }))).toBe("First buy by Jen Hsun Huang in 4 years.");
    expect(whyLine(insider(), facts({ ownerPrevBuy: "2025-03-01", ownerCompleteSince: "2016-11-01" }))).toBeNull(); // under 2 years
    expect(whyLine(insider(), facts({ ownerPrevBuy: "2015-03-01", ownerCompleteSince: "2016-11-01" }))).toBeNull(); // before the history we read
    expect(whyLine(insider(), facts({ ownerPrevBuy: "2020-03-01", ownerCompleteSince: null }))).toBeNull(); // still reading
  });
  it("6. N insiders at the company bought this month", () => {
    expect(whyLine(insider(), facts({ insidersThisMonth: 3 }))).toBe("3 Nvidia insiders bought this month.");
    expect(whyLine(insider(), facts({ insidersThisMonth: 1 }))).toBeNull();
    expect(whyLine(insider(insiderDetail({ tradeDate: "2026-09-28" })), facts({ insidersThisMonth: 3 }))).toBeNull(); // not this month
  });
  it("7. biggest insider buy at the company since a year", () => {
    expect(whyLine(insider(), facts({ issuerBiggerOn: "2019-05-02", issuerCompleteSince: "2016-11-01" }))).toBe("Biggest insider buy at Nvidia since 2019.");
    expect(whyLine(insider(), facts({ issuerBiggerOn: null, issuerCompleteSince: "2016-11-01" }))).toBe("Biggest insider buy at Nvidia since 2016.");
    expect(whyLine(insider(), facts({ issuerBiggerOn: "2026-02-01", issuerCompleteSince: "2016-11-01" }))).toBeNull(); // bigger one this year
    expect(whyLine(insider(), facts({ issuerBiggerOn: null, issuerCompleteSince: null }))).toBeNull();
  });
  it("insider rules in order", () => {
    const all = facts({ ownerPrevBuy: "2020-01-01", ownerCompleteSince: "2016-11-01", insidersThisMonth: 2, issuerBiggerOn: null, issuerCompleteSince: "2016-11-01" });
    expect(whyLine(insider(), all)).toBe("First buy by Jen Hsun Huang in 6 years.");
    expect(whyLine(insider(), { ...all, ownerPrevBuy: null })).toBe("2 Nvidia insiders bought this month.");
    expect(whyLine(insider(), { ...all, ownerPrevBuy: null, insidersThisMonth: 0 })).toBe("Biggest insider buy at Nvidia since 2016.");
  });
  it("8–9. funds: a new position, a doubled stake", () => {
    expect(whyLine(fund(fundDetail({ newPosition: true, prevShares: 0 })), facts())).toBe("New position: they didn't own it last quarter.");
    expect(whyLine(fund(fundDetail()), facts())).toBe("They doubled their stake.");
    expect(whyLine(fund(fundDetail({ curShares: 1_500_000, addedShares: 500_000 })), facts())).toBeNull();
  });
  it("every line is a fact, never advice, never a banned word", () => {
    const lines = [
      whyLine(pm(), facts({ sameMarketDay: { others: 1, max: 1 } })), whyLine(pm(), facts({ traderHasRecord: true, traderBiggestBefore: 1 })),
      whyLine(pm(), facts({ topTradersSameSide: 2 })), whyLine(pm({ avgPrice: 0.62 }), facts({ priceHourAgo: 0.5 })),
      whyLine(insider(), facts({ ownerPrevBuy: "2020-01-01", ownerCompleteSince: "2016-01-01" })), whyLine(insider(), facts({ insidersThisMonth: 2 })),
      whyLine(insider(), facts({ issuerCompleteSince: "2016-01-01" })), whyLine(fund(fundDetail({ newPosition: true })), facts()), whyLine(fund(fundDetail()), facts()),
    ];
    for (const l of lines) {
      expect(l).toBeTruthy();
      for (const b of BANNED_WORDS) expect(l!).not.toMatch(b);
      expect(l!).not.toMatch(/\b(should|buy now|you|copy|follow them|guarantee)\b/i);
    }
  });
});

describe("brand-new wallets", () => {
  it("a move is marked new only when the wallet had no activity before it, checked once per move", async () => {
    const T = NOW;
    const fills = (wallet: string) => [{ proxyWallet: wallet, side: "BUY", conditionId: "C1", size: 40_000, price: 0.5, timestamp: Math.floor((T - 60_000) / 1000), title: "Chiefs vs Bills", outcome: "Chiefs", outcomeIndex: 0, transactionHash: `0x${wallet.slice(-1)}` }];
    let asked = 0;
    const poller = new MovesPoller({
      polyTradesPage: async () => [...fills("0x1111111111111111111111111111111111111111"), ...fills("0x2222222222222222222222222222222222222222")],
      polyWalletTrades: async () => [],
      polyWalletIsNew: async w => { asked++; return w.endsWith("1"); },
      kalshiTradesPage: async () => ({ trades: [] }),
    });
    const info = new Map([["C1", { category: "sports", labels: ["NFL"], url: null }]]);
    const got = await poller.pollPolymarket(T, info);
    expect(Object.fromEntries(got.map(m => [m.wallet, m.newWallet]))).toEqual({ "0x1111111111111111111111111111111111111111": true, "0x2222222222222222222222222222222222222222": false });
    await poller.pollPolymarket(T + 15_000, info);
    expect(asked).toBe(2);
  });
});

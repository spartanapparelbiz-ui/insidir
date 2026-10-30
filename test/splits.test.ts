/* Smart money vs. the crowd (lib/smart): every rule, worked by hand. */
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "@/lib/moves/copy";
import { provenFrom } from "@/lib/smart/proven";
import {
  bigMoneySplit, changeOver, closeOnOrBefore, crowdSplit, fundAddsInFall, insiderDips, marketVerdict, points, scorecard, smartOf, stockVerdict,
  SMART_MIN_MONEY, SPLIT_ALERT_GAP,
} from "@/lib/smart/splits";
import { gapLabel, splitHref, splitLine, splitMessage, stockLine } from "@/lib/smart/text";
import { readFigi } from "@/lib/stocks/cusip";
import { readClosedRows } from "@/lib/profiles/trader";

/** n markets won and m lost, $100 in each at price p. */
function history(won: number, lost: number, p: number) {
  return [
    ...Array.from({ length: won }, (_, i) => ({ marketId: `w${i}`, moneyIn: 100, pnl: 100 * (1 / p - 1), avgPrice: p })),
    ...Array.from({ length: lost }, (_, i) => ({ marketId: `l${i}`, moneyIn: 100, pnl: -100, avgPrice: p })),
  ];
}

describe("proven traders", () => {
  it("20+ markets and a win rate above the price paid", () => {
    // 14 of 20 = 70% at 60¢: proven. 12 of 20 = 60% at 60¢: not (not above). 14 of 19: too few markets.
    expect(provenFrom(history(14, 6, 0.6))).toMatchObject({ markets: 20, won: 14, proven: true });
    expect(provenFrom(history(14, 6, 0.6)).avgPrice).toBeCloseTo(0.6);
    expect(provenFrom(history(12, 8, 0.6)).proven).toBe(false);
    expect(provenFrom(history(14, 5, 0.6)).proven).toBe(false);
  });

  it("price weighted by money in; a market counts once; unpriced rows don't move the price", () => {
    const p = provenFrom([
      { marketId: "a", moneyIn: 300, pnl: 50, avgPrice: 0.8 }, { marketId: "a", moneyIn: 100, pnl: -100, avgPrice: 0.2 },
      { marketId: "b", moneyIn: 100, pnl: -100, avgPrice: null },
    ]);
    expect(p.markets).toBe(2);
    expect(p.won).toBe(0); // a: +50 − 100 = −50
    expect(p.avgPrice).toBeCloseTo((300 * 0.8 + 100 * 0.2) / 400);
  });

  it("closed positions carry their average price", () => {
    expect(readClosedRows([{ conditionId: "0xa", realizedPnl: 5, avgPrice: 0.4, totalBought: 100 }])[0]).toMatchObject({ moneyIn: 40, avgPrice: 0.4 });
    expect(readClosedRows([{ conditionId: "0xa", realizedPnl: 5, avgPrice: 1, totalBought: 100 }])[0]!.avgPrice).toBeNull();
  });
});

describe("smart money and the gap", () => {
  const pos = (wallet: string, outcomeIndex: number, moneyIn: number) => ({ wallet, outcomeIndex, moneyIn });

  it("YES share of proven money: positions of $2K+, with 3+ wallets and enough money", () => {
    const s = smartOf([pos("a", 0, 6000), pos("b", 0, 2100), pos("c", 1, 1900), pos("c", 1, 2000)]);
    expect(s).toMatchObject({ yes: 8100, no: 2000, wallets: 3 }); // the $1,900 position doesn't count
    expect(s.share).toBeCloseTo(8100 / 10100);
    expect(smartOf([pos("a", 0, 6000), pos("b", 0, 6000)]).share).toBeNull();
    expect(SMART_MIN_MONEY).toBeLessThan(6000);
  });

  it("Crowd 62% · Smart money 81% is 19 points, smart money leaning YES", () => {
    const s = smartOf([pos("a", 0, 6000), pos("b", 0, 2100), pos("c", 1, 1900), pos("d", 1, 2000)]);
    s.share = 0.81;
    expect(crowdSplit(0.62, s)).toEqual({ crowd: 0.62, smart: 0.81, gap: 19, smartSide: "yes" });
    expect(crowdSplit(0.9, s)!.smartSide).toBe("no");
    expect(crowdSplit(null, s)).toBeNull();
    expect(crowdSplit(1, s)).toBeNull();
    expect(points(0.5, 0.345)).toBe(15.5);
  });

  it("games: all big bets vs. proven traders only when they point opposite ways", () => {
    const smart = smartOf([pos("a", 0, 2000), pos("b", 1, 3000), pos("c", 1, 3000)]); // 25% YES
    expect(bigMoneySplit({ yes: 70_000, no: 30_000 }, smart, 0.6)).toEqual({ crowd: 0.7, smart: 0.25, gap: 45, smartSide: "no" });
    expect(bigMoneySplit({ yes: 30_000, no: 70_000 }, smart, 0.6)).toBeNull(); // both lean NO
    expect(bigMoneySplit({ yes: 7_000, no: 3_000 }, smart, 0.6)).toBeNull(); // too little big money
    expect(bigMoneySplit({ yes: 70_000, no: 30_000 }, smart, 0.97)).toBeNull(); // NO priced at 3%
  });

  it("scored on the side smart money leaned to; void isn't scored", () => {
    expect(marketVerdict("yes", "yes")).toBe(true);
    expect(marketVerdict("yes", "no")).toBe(false);
    expect(marketVerdict("no", "void")).toBeNull();
    expect(scorecard([{ smartRight: true }, { smartRight: false }, { smartRight: true }, { smartRight: null }])).toEqual({ scored: 3, right: 2, share: 2 / 3 });
    expect(scorecard([])).toEqual({ scored: 0, right: 0, share: null });
  });
});

describe("stocks", () => {
  // 100 from Aug 1 to Sep 1, then falling to 80 by Oct 1 (−20%), then rising a dollar a day.
  const day0 = Date.UTC(2026, 7, 1), sep1 = 31;
  const closes = Array.from({ length: 92 }, (_, i) => ({ date: new Date(day0 + i * 86_400_000).toISOString().slice(0, 10), close: i <= sep1 ? 100 : i <= sep1 + 30 ? 100 - (20 * (i - sep1)) / 30 : 80 + (i - sep1 - 30) }));
  const map = new Map([["ACME", closes]]);

  it("change over 30 days, from the last close on or before each date", () => {
    expect(changeOver(closes, "2026-10-01", 30)).toBeCloseTo(-20);
    expect(closeOnOrBefore([{ date: "2026-10-02", close: 1 }], "2026-10-04")).toEqual({ date: "2026-10-02", close: 1 });
    expect(changeOver(closes, "2026-08-01", 30)).toBeNull();
  });

  it("insiders buying the dip: buys after a 10%+ fall, per ticker", () => {
    const d = insiderDips([
      { ticker: "ACME", company: "Acme", owner: "A", value: 1_000_000, tradeDate: "2026-10-01" },
      { ticker: "ACME", company: "Acme", owner: "B", value: 500_000, tradeDate: "2026-09-25" },
      { ticker: "ACME", company: "Acme", owner: "C", value: 9_000_000, tradeDate: "2026-09-05" }, // only −2.7% by then
    ], map);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ ticker: "ACME", owners: ["A", "B"], value: 1_500_000, fall: 20, from: "2026-09-25", to: "2026-10-01" });
  });

  it("funds adding in a quarter the price fell 10%+", () => {
    // From Mar 1, 20¢ lower each day: Mar 31 is 94, Jun 30 is 75.8 (−19.4% over the quarter).
    const q = Array.from({ length: 130 }, (_, i) => ({ date: new Date(Date.UTC(2026, 2, 1) + i * 86_400_000).toISOString().slice(0, 10), close: 100 - i * 0.2 }));
    const f = fundAddsInFall([{ ticker: "ACME", company: "Acme", fund: "Fund A", addedValue: 40e6, period: "2026-06-30" }], new Map([["ACME", q]]));
    expect(f[0]).toMatchObject({ funds: ["Fund A"], value: 40e6 });
    expect(f[0]!.fall).toBeCloseTo(19.4, 1);
    // A quarter with no close 91 days before its end can't be judged.
    expect(fundAddsInFall([{ ticker: "ACME", company: "Acme", fund: "F", addedValue: 1, period: "2026-04-20" }], new Map([["ACME", q]]))).toEqual([]);
  });

  it("a stock call is scored 90 days on: right when the price is higher", () => {
    const c = [{ date: "2026-01-02", close: 50 }, { date: "2026-04-01", close: 60 }];
    expect(stockVerdict(c, "2026-01-02", "2026-03-01")).toBeNull();
    expect(stockVerdict(c, "2026-01-02", "2026-04-02")).toEqual({ outcome: "up", right: true, change: 20 });
    expect(stockVerdict([{ date: "2026-01-02", close: 50 }, { date: "2026-04-01", close: 40 }], "2026-01-02", "2026-04-02")!.right).toBe(false);
  });

  it("OpenFIGI: the first US share's ticker, null when none", () => {
    expect(readFigi([{ data: [{ exchCode: "LN", ticker: "X" }, { exchCode: "US", ticker: "brk/b", securityType: "Common Stock" }] }, { warning: "No identifier found." }], 2)).toEqual(["BRK.B", null]);
    expect(readFigi(null, 1)).toEqual([null]);
  });
});

describe("the words", () => {
  const base = { id: "crowd:0xa", subject: "0xa", title: "Will the Fed cut in December?", subtitle: null, smartSide: "yes", gap: 19 };

  it("card line, gap, link and alert", () => {
    const s = { ...base, kind: "crowd" as const, crowd: 0.62, smart: 0.81, detail: { yesLabel: "Yes", wallets: 4 } };
    expect(splitLine(s)).toBe("Market 62% · Proven traders 81%");
    expect(splitLine({ ...s, kind: "bigmoney", crowd: 0.7, smart: 0.3, detail: { yesLabel: "Brewers" } })).toBe("Large positions 70% · Proven traders 30% on Brewers");
    expect(gapLabel(s)).toBe("19 pts apart");
    expect(splitHref(s)).toBe("/market/0xa");
    const msg = splitMessage(s, "https://insidir.com");
    expect(msg.title).toBe("Proven traders vs. the market: 19 pts");
    expect(msg.body).toBe("Will the Fed cut in December? Market 62% · Proven traders 81% (4 proven traders). Data, not a recommendation.");
    expect(msg.body).toContain("Data, not a recommendation.");
    expect(msg.url).toBe("https://insidir.com/market/0xa?from=split");
    expect(SPLIT_ALERT_GAP).toBe(15);
  });

  it("stocks", () => {
    const s = { ...base, kind: "insider_dip" as const, subject: "ACME:2026-09-25", crowd: null, smart: null, gap: 20, smartSide: "up", detail: { ticker: "ACME", owners: ["A", "B"], value: 1_500_000 } };
    expect(splitLine(s)).toBe("2 insiders bought $1.5M after a 30-day fall");
    expect(gapLabel(s)).toBe("−20% in 30 days");
    expect(splitMessage({ ...s, title: "Insiders buying the dip: Acme", detail: { ...s.detail, company: "Acme" } }, "").body).toBe("Acme. 2 insiders bought $1.5M after a 30-day fall (−20%). Data, not a recommendation.");
    expect(splitHref(s)).toBe("/insider-trading/ACME");
    expect(stockLine({ funds: ["F"], value: 40e6 }, "fund_add")).toBe("A big fund added $40M in a quarter it fell");
  });

  it("no banned words", () => {
    const lines = [splitLine({ kind: "crowd", crowd: 0.6, smart: 0.8, detail: {} }), splitMessage({ ...base, kind: "crowd", crowd: 0.6, smart: 0.8, detail: { wallets: 2 } }, "").body];
    for (const l of lines) for (const b of BANNED_WORDS) expect(l).not.toMatch(b);
  });
});

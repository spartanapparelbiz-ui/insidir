import { describe, expect, it } from "vitest";
import { cents, earlyLateLine, entryProfile, etClock, etWindow, exclusiveLadder, hundredOnEach, ladderLine, marginLabel, moveLine, numericLadder, payout, payoutLine, pnlNow, priceAt, priceMoves, recordLine, signed, sizeVsUsual, totalLabel } from "@/lib/briefing/math";

const H = 3_600_000;

describe("payout math", () => {
  it("76¢: the market says 76%, $100 buys 131 shares that pay $131 if yes", () => {
    expect(payout(0.76)).toEqual({ impliedPct: 76, shares: 131, pays: 131, profit: 31 });
    expect(payoutLine(0.76, "Yes")).toBe("76¢ means the market says 76%. $100 buys 131 shares. They pay $131 if yes, $0 if not.");
    expect(payout(0.25, 50)).toEqual({ impliedPct: 25, shares: 200, pays: 200, profit: 150 });
    expect(() => payout(0)).toThrow();
    expect(() => payout(1)).toThrow();
  });
  it("profit or loss at the price now", () => {
    expect(pnlNow(200, 100, 0.6)).toEqual({ value: 120, pnl: 20, pnlPct: 0.2 });
    expect(pnlNow(200, 100, 0.3).pnl).toBeCloseTo(-40);
  });
  it("formats signed money and cents", () => {
    expect(signed(160_000)).toBe("+$160K");
    expect(signed(-29_000)).toBe("−$29K");
    expect(signed(0.2)).toBe("$0");
    expect(cents(0.755)).toBe("76¢");
  });
});

describe("ladder P&L per outcome", () => {
  it("spread lines on one team: each margin's P&L, merged into ranges", () => {
    // From the Colts' side, margin = Colts − opponent. Colts +3.5 wins when margin > −3.5; Colts −2.5 when margin > 2.5;
    // the opponent −4.5 (Colts lose by 5+) when margin < −4.5.
    const legs = [
      { label: "Colts +3.5", line: -3.5, dir: "over" as const, cost: 100_000, shares: 180_000 },
      { label: "Colts −2.5", line: 2.5, dir: "over" as const, cost: 50_000, shares: 120_000 },
      { label: "Opponent −4.5", line: -4.5, dir: "under" as const, cost: 20_000, shares: 60_000 },
    ];
    const rows = numericLadder(legs, marginLabel("Colts"));
    // Lose by 5+: only the opponent leg wins: +40K − 100K − 50K.
    expect(rows[0]).toMatchObject({ from: null, to: -5, pnl: -110_000 });
    // Lose by exactly 4: nothing wins.
    expect(rows[1]).toMatchObject({ from: -4, to: -4, pnl: -170_000, label: "Colts lose by exactly 4" });
    // Lose by 3 up to win by 2: only +3.5 wins.
    expect(rows[2]).toMatchObject({ from: -3, to: 2, pnl: 10_000 });
    // Win by 3+: +3.5 and −2.5 win (+80K + 70K), the opponent leg loses (−20K).
    expect(rows[3]).toMatchObject({ from: 3, to: null, pnl: 130_000, label: "Colts win by 3+" });
    expect(ladderLine(rows)).toBe("Colts lose by 5+: −$110K. Colts lose by exactly 4: −$170K. Colts lose by up to 3, tie or win by up to 2: +$10K. Colts win by 3+: +$130K.");
  });
  it("a whole-number line pushes: the money back on exactly that number", () => {
    const rows = numericLadder([{ label: "Over 3", line: 3, dir: "over", cost: 100, shares: 200 }], totalLabel("Goals"));
    expect(rows.map(r => [r.label, Math.round(r.pnl)])).toEqual([["Goals 2 or less", -100], ["Goals exactly 3", 0], ["Goals 4+", 100]]);
  });
  it("an event's exclusive outcomes: YES on one, NO on another", () => {
    const rows = exclusiveLadder([
      { label: "Yes Smith", outcome: "Smith", side: "yes", cost: 40_000, shares: 100_000 },
      { label: "No Jones", outcome: "Jones", side: "no", cost: 30_000, shares: 50_000 },
    ], ["Smith", "Jones", "Lee", "Kim"]);
    expect(rows).toEqual([
      { label: "Smith", from: null, to: null, pnl: 60_000 + 20_000 },
      { label: "Jones", from: null, to: null, pnl: -40_000 - 30_000 },
      { label: "Anything else", from: null, to: null, pnl: -40_000 + 20_000 },
    ]);
  });
});

describe("the price over time", () => {
  const t0 = Date.UTC(2026, 10, 5, 22); // Thursday 5 p.m. ET
  const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => ({ t: t0 + i * H, p: [0.24, 0.24, 0.25, 0.3, 0.35, 0.38, 0.4, 0.4, 0.4, 0.39, 0.38][i]! }));
  it("finds the biggest move and its exact window", () => {
    const [m] = priceMoves(pts);
    expect(m).toMatchObject({ from: 0.24, to: 0.4, startAt: t0 + H, endAt: t0 + 6 * H });
    expect(moveLine(m!, t0 + 12 * H)).toBe("24% → 40% Thursday 6 p.m.–11 p.m.");
    expect(priceMoves(pts, { minMove: 0.5 })).toEqual([]);
  });
  it("reads the price at a moment", () => {
    expect(priceAt(pts, t0 + 4.5 * H)).toBe(0.35);
    expect(priceAt(pts, t0 - H)).toBe(0.24);
    expect(priceAt([], t0)).toBeNull();
  });
  it("names ET times plainly", () => {
    expect(etClock(Date.UTC(2026, 10, 6, 5))).toBe("midnight");
    expect(etClock(Date.UTC(2026, 10, 6, 17))).toBe("noon");
    expect(etWindow(t0 + H, Date.UTC(2026, 10, 6, 5), t0 + 2 * H)).toBe("Thursday 6 p.m.–midnight");
  });
});

describe("money in and records", () => {
  it("most of the money came in under a price", () => {
    const p = entryProfile([{ price: 0.2, amount: 300, at: 1 }, { price: 0.22, amount: 200, at: 2 }, { price: 0.7, amount: 100, at: 3 }])!;
    expect(p.mostUnder).toBe(0.25);
    expect(p.avgEntry).toBeCloseTo((60 + 44 + 70) / 600);
    expect(earlyLateLine(p, "YES", 0.76)).toBe("Most of the YES money came in under 25¢. You'd be buying at 76¢.");
    expect(entryProfile([])).toBeNull();
  });
  it("size against the usual bet and $100 on each", () => {
    expect(sizeVsUsual(48_000, 15_000)).toBe(3.2);
    expect(sizeVsUsual(1, null)).toBeNull();
    const r = hundredOnEach([{ price: 0.5, result: "won" }, { price: 0.25, result: "won" }, { price: 0.6, result: "lost" }, { price: 0.5, result: "void" }]);
    expect(r).toEqual({ n: 4, won: 2, lost: 1, net: 100 + 300 - 100 });
    expect(recordLine(r)).toBe("2–1, $100 on each: +$300");
  });
});

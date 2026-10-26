import { describe, expect, it } from "vitest";
import { isWallet, kalshiPnl, kalshiPnlFromCsv, polymarketPnlFromRaw } from "@/lib/pnl";

const W = "0x1111111111111111111111111111111111111111";

// Data API shapes: /positions rows and /v2/activity rows (numbers sometimes as strings).
const POSITIONS = [
  { proxyWallet: W, asset: "tok-a-yes", conditionId: "0xA", size: 100, avgPrice: 0.4, initialValue: 40, currentValue: 55, cashPnl: 15, curPrice: 0.55, title: "Will A happen?", outcome: "Yes", slug: "a", eventSlug: "a" },
  { proxyWallet: W, asset: "tok-c-no", conditionId: "0xC", size: "0.0000001", avgPrice: 0.5, initialValue: 0, currentValue: 0, title: "Dust", outcome: "No" },
];
const ACTIVITY = [
  // Market A: bought 150 at 0.40 ($60), sold 50 at 0.60 ($30). Still holds 100 (cost $40). Realized: 30 − 60 + 40 = 10.
  { proxyWallet: W, timestamp: 1700000000, type: "TRADE", side: "BUY", conditionId: "0xA", size: 150, usdcSize: "60", price: 0.4, title: "Will A happen?" },
  { proxyWallet: W, timestamp: 1700000100, type: "TRADE", side: "SELL", conditionId: "0xA", size: 50, usdcSize: 30, price: 0.6, title: "Will A happen?" },
  // Market B: bought 200 NO at 0.30 ($60), redeemed for $200. Realized 140.
  { proxyWallet: W, timestamp: 1700000200, type: "TRADE", side: "BUY", conditionId: "0xB", size: 200, usdcSize: 60, price: 0.3, title: "Will B happen?" },
  { proxyWallet: W, timestamp: 1700000300, type: "REDEEM", conditionId: "0xB", size: 200, usdcSize: 200, title: "Will B happen?" },
  // Market D: bought $25, lost (no redemption). Realized −25.
  { proxyWallet: W, timestamp: 1700000400, type: "TRADE", side: "BUY", conditionId: "0xD", size: 50, usdcSize: 25, price: 0.5, title: "Will D happen?" },
  // No condition id: skipped.
  { proxyWallet: W, timestamp: 1700000500, type: "REWARD", usdcSize: 1 },
];

describe("P&L: Polymarket wallet", () => {
  it("validates addresses", () => {
    expect(isWallet(W)).toBe(true);
    expect(isWallet("0x123")).toBe(false);
    expect(isWallet("polymarket.com/@someone")).toBe(false);
  });

  it("computes realized, open cost and open value per market", () => {
    const s = polymarketPnlFromRaw(POSITIONS, ACTIVITY);
    expect(s.realized).toBeCloseTo(125, 9);
    expect(s.openCost).toBeCloseTo(40, 9);
    expect(s.openValue).toBeCloseTo(55, 9);
    expect(s.openPositions).toBe(1);
    expect(s.rows).toBe(6);
    expect(s.skipped).toBe(1);
    const by = Object.fromEntries(s.markets.map(m => [m.key, m]));
    expect(by["0xA"]).toMatchObject({ title: "Will A happen?", realized: 10, openContracts: 100, openCost: 40, openValue: 55, outcome: "Yes" });
    expect(by["0xB"]).toMatchObject({ realized: 140, openContracts: 0, openValue: 0 });
    expect(by["0xD"]).toMatchObject({ realized: -25 });
    expect(by["0xC"]).toBeUndefined();
  });

  it("is empty for an empty wallet", () => {
    const s = polymarketPnlFromRaw([], []);
    expect(s).toMatchObject({ realized: 0, openCost: 0, openValue: 0, openPositions: 0, markets: [] });
  });
});

describe("P&L: Kalshi CSV", () => {
  it("computes realized P&L from trades and settlements (average cost), prices in cents", () => {
    const csv = [
      "\uFEFFTicker,Market Title,Type,Side,Contracts,Price,Fees,Revenue,Created",
      "KXFED-25DEC-T4.00,\"Fed above 4%, December?\",Buy,Yes,100,40,0.84,,2025-10-01",
      "KXFED-25DEC-T4.00,\"Fed above 4%, December?\",Sell,Yes,40,55,0.70,,2025-10-02",
      "KXFED-25DEC-T4.00,\"Fed above 4%, December?\",Settlement,,60,,0,$60.00,2025-12-10",
      "KXBTC-25OCT-B100,BTC above 100k?,Buy,No,10,$0.30,0.15,,2025-10-03",
      ",,,,,,,,",
    ].join("\n");
    const { summary, error } = kalshiPnlFromCsv(csv);
    expect(error).toBeNull();
    if (!summary) return;
    const fed = summary.markets.find(m => m.key === "KXFED-25DEC-T4.00");
    expect(fed?.title).toBe("Fed above 4%, December?");
    // Cost 40; sell 40 @ .55 = 22 − 16 cost − .70 fee = 5.30; settle 60 @ $1 = 60 − 24 cost = 36; buy fee −.84 → 40.46
    expect(fed?.realized).toBeCloseTo(40.46, 9);
    expect(fed?.openContracts).toBe(0);
    const btc = summary.markets.find(m => m.key === "KXBTC-25OCT-B100");
    expect(btc).toMatchObject({ realized: -0.15, openContracts: 10, openCost: 3, openValue: null, outcome: "NO" });
    expect(summary.realized).toBeCloseTo(40.31, 9);
    expect(summary.openCost).toBeCloseTo(3, 9);
    expect(summary.openValue).toBeNull();
    expect(summary.openPositions).toBe(1);
  });

  it("sums a realized P&L column when the file has one", () => {
    const csv = "market_ticker,realized_pnl,type\nA,$12.50,settlement\nA,(2.50),settlement\nB,-1,settlement\n";
    const { summary } = kalshiPnlFromCsv(csv);
    expect(summary?.realized).toBeCloseTo(9, 9);
    expect(summary?.markets.find(m => m.key === "A")?.realized).toBeCloseTo(10, 9);
  });

  it("explains a file without a ticker column, or an empty file", () => {
    expect(kalshiPnlFromCsv("foo,bar\n1,2").error).toMatch(/ticker/);
    expect(kalshiPnlFromCsv("").error).toMatch(/empty/);
  });

  it("a settlement closes every side held in the market", () => {
    const s = kalshiPnl([
      { ticker: "T", title: null, kind: "buy", side: "yes", contracts: 10, price: 0.4, amount: null, fee: 0, pnl: null },
      { ticker: "T", title: null, kind: "buy", side: "no", contracts: 5, price: 0.5, amount: null, fee: 0, pnl: null },
      { ticker: "T", title: null, kind: "settlement", side: null, contracts: null, price: null, amount: 10, fee: 0, pnl: null },
    ]);
    expect(s.realized).toBeCloseTo(10 - 4 - 2.5, 9);
    expect(s.openPositions).toBe(0);
  });
});

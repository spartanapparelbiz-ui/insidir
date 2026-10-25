import { describe, expect, it } from "vitest";
import { mapColumns, parseCsv, parseKalshiCsv, parseTime } from "@/lib/exchanges/kalshi-csv";
import { fixtureText } from "./fixtures/exchanges/harness";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""","multi\nline"\r\n\r\n1,2,3');
    expect(rows.map(r => r.cells)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "multi\nline"],
      ["1", "2", "3"],
    ]);
    expect(rows.map(r => r.line)).toEqual([1, 2, 5]);
  });
});

describe("parseTime", () => {
  it("reads ISO, zone-less (as UTC), US dates and epochs", () => {
    expect(parseTime("2025-10-01 14:30:00")).toBe(Date.UTC(2025, 9, 1, 14, 30));
    expect(parseTime("2025-10-02T10:00:00Z")).toBe(Date.UTC(2025, 9, 2, 10));
    expect(parseTime("2025-10-31")).toBe(Date.UTC(2025, 9, 31));
    expect(parseTime("10/03/2025 9:15 PM")).toBe(Date.UTC(2025, 9, 3, 21, 15));
    expect(parseTime("1730000000")).toBe(1730000000000);
    expect(parseTime("1730000000000")).toBe(1730000000000);
    expect(parseTime("nope")).toBeNull();
  });
});

describe("parseKalshiCsv", () => {
  it("reads trades and settlements from a human-readable export", () => {
    const r = parseKalshiCsv(fixtureText("kalshi-export.csv"));
    expect(r.columns).toMatchObject({ ticker: "Ticker", type: "Type", side: "Side", action: "Action", contracts: "Contracts", price: "Price", fee: "Fee ($)", timestamp: "Created Time", result: "Market Result", revenue: "Revenue", cost: "Cost", id: "Order ID" });
    expect(r.trades).toEqual([
      { kind: "trade", line: 2, ticker: "KXFEDDECISION-25DEC-C25", title: null, side: "yes", action: "buy", contracts: 10, price: 0.45, fee: 0.18, timestamp: Date.UTC(2025, 9, 1, 14, 30), id: "ord-1" },
      { kind: "trade", line: 3, ticker: "KXFEDDECISION-25DEC-C25", title: null, side: "yes", action: "sell", contracts: 4, price: 0.52, fee: 0.07, timestamp: Date.UTC(2025, 9, 2, 10), id: "ord-2" },
      { kind: "trade", line: 4, ticker: "KXBTCD-25OCT31-T100000", title: null, side: "no", action: "buy", contracts: 1000, price: 0.38, fee: 26.6, timestamp: Date.UTC(2025, 9, 3, 9, 15), id: "ord-3" },
    ]);
    expect(r.settlements).toHaveLength(2);
    expect(r.settlements[0]).toMatchObject({ ticker: "KXFEDDECISION-25DEC-C25", result: "yes", contracts: 6, revenue: 6, cost: 2.7 });
    expect(r.settlements[0]!.profit).toBeCloseTo(3.3, 10);
    // "(380.00)" is a cost shown as an outflow: its magnitude is used.
    expect(r.settlements[1]).toMatchObject({ result: "no", contracts: 1000, revenue: 1000, cost: 380, profit: 620, timestamp: Date.UTC(2025, 9, 31) });
    expect(r.skipped).toEqual([
      { line: 7, reason: "no ticker" },
      { line: 8, reason: "no yes/no side" },
    ]);
  });

  it("reads Trade-API-style settlement columns in cents without a type column", () => {
    const r = parseKalshiCsv(fixtureText("kalshi-export-api-names.csv"));
    expect(r.trades).toEqual([]);
    expect(r.settlements.map(s => ({ t: s.ticker, res: s.result, yes: s.yesContracts, no: s.noContracts, n: s.contracts, cost: s.cost, rev: s.revenue, p: s.profit, ts: s.timestamp }))).toEqual([
      { t: "KXA-1", res: "no", yes: 0, no: 20, n: 20, cost: 7, rev: 20, p: 13, ts: 1730000000000 },
      { t: "KXA-2", res: "yes", yes: 5, no: 0, n: 5, cost: 2.5, rev: 5, p: 2.5, ts: 1730000000000 },
    ]);
  });

  it("reads fills with yes_price / no_price columns and combined 'Buy Yes' actions", () => {
    const csv = "ticker,action,count,yes_price,no_price,created_time\nKXA,Buy Yes,3,0.41,0.59,2025-01-01\nKXA,Sell No,2,40,60,2025-01-02";
    const r = parseKalshiCsv(csv);
    expect(r.trades.map(t => [t.side, t.action, t.contracts, t.price])).toEqual([
      ["yes", "buy", 3, 0.41],
      ["no", "sell", 2, 0.6],
    ]);
  });

  it("matches headers leniently and never throws on junk", () => {
    expect(mapColumns(["MARKET TICKER", "Qty", "Avg. Price"]).columns).toMatchObject({ ticker: "MARKET TICKER", contracts: "Qty", price: "Avg. Price" });
    expect(parseKalshiCsv("").trades).toEqual([]);
    expect(parseKalshiCsv("foo,bar\n1,2").skipped[0]!.reason).toMatch(/no ticker column/);
  });
});

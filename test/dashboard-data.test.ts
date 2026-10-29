/* The dashboard's other numbers, worked by hand: returns after an insider's buy against the S&P 500, cluster buys,
 * a fund's quarter over quarter, the price sources' parsers, market price history, and New York's day. */
import { describe, expect, it } from "vitest";
import { startOfEtDay } from "@/lib/discover";
import { gammaYesPrice } from "@/lib/exchanges/polymarket";
import { kalshiYesPrice } from "@/lib/exchanges/kalshi";
import { kalshiSeries, readKalshiCandles, readPolyHistory } from "@/lib/markets/info";
import { readStooq, readYahoo, type Close } from "@/lib/stocks/prices";
import { quarterSummary } from "@/lib/stocks/quarters";
import { afterBuy, averageAfter, closeOnOrAfter, latestCluster } from "@/lib/stocks/returns";

/** Daily closes from `start`, one a day, from a list of prices. */
function closes(start: string, prices: number[]): Close[] {
  return prices.map((close, i) => ({ date: new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), close }));
}

describe("after an insider's buy", () => {
  // The stock: 100 on Jan 1, 110 on day 30, 90 on day 90. SPY: 400 → 404 (+1%) → 420 (+5%).
  const stock = closes("2026-01-01", Array.from({ length: 200 }, (_, i) => (i < 30 ? 100 : i < 90 ? 110 : 90)));
  const spy = closes("2026-01-01", Array.from({ length: 200 }, (_, i) => (i < 30 ? 400 : i < 90 ? 404 : 420)));
  it("30 and 90 days: the stock's change and the gap to the S&P 500", () => {
    const a30 = afterBuy(stock, spy, "2026-01-01", 30, "2026-12-31");
    expect(a30.pct).toBeCloseTo(10);
    expect(a30.spy).toBeCloseTo(1);
    expect(a30.vs).toBeCloseTo(9);
    const a90 = afterBuy(stock, spy, "2026-01-01", 90, "2026-12-31");
    expect(a90.pct).toBeCloseTo(-10);
    expect(a90.vs).toBeCloseTo(-15);
  });

  it("a window that hasn't ended yet, or has no close since, is not reached", () => {
    expect(afterBuy(stock, spy, "2026-01-01", 180, "2026-03-01")).toEqual({ days: 180, pct: null, spy: null, vs: null });
    expect(afterBuy(stock.slice(0, 50), spy, "2026-01-01", 90, "2026-12-31").pct).toBeNull();
  });

  it("the first close on or after a date (weekends and holidays roll forward)", () => {
    const l = [{ date: "2026-01-02", close: 1 }, { date: "2026-01-05", close: 2 }];
    expect(closeOnOrAfter(l, "2026-01-03")).toEqual({ date: "2026-01-05", close: 2 });
    expect(closeOnOrAfter(l, "2026-01-06")).toBeNull();
  });

  it("averages count each buy once per window it has reached", () => {
    const r = averageAfter([
      [{ days: 30, pct: 10, spy: 1, vs: 9 }, { days: 90, pct: -10, spy: 5, vs: -15 }, { days: 180, pct: null, spy: null, vs: null }],
      [{ days: 30, pct: 20, spy: 2, vs: 18 }, { days: 90, pct: null, spy: null, vs: null }, { days: 180, pct: null, spy: null, vs: null }],
    ]);
    expect(r).toEqual([{ days: 30, n: 2, pct: 15, vs: 13.5 }, { days: 90, n: 1, pct: -10, vs: -15 }, { days: 180, n: 0, pct: null, vs: null }]);
  });

  it("cluster buys: three different insiders within 30 days, the most recent window", () => {
    const b = (ownerCik: string, date: string) => ({ ownerCik, ownerName: `Owner ${ownerCik}`, date });
    expect(latestCluster([b("1", "2026-10-01"), b("2", "2026-10-10"), b("3", "2026-10-30")])).toEqual({ owners: ["Owner 3", "Owner 2", "Owner 1"], from: "2026-10-01", to: "2026-10-30" });
    expect(latestCluster([b("1", "2026-09-01"), b("2", "2026-10-10"), b("3", "2026-10-30")])).toBeNull();
    expect(latestCluster([b("1", "2026-10-01"), b("1", "2026-10-10"), b("2", "2026-10-30")])).toBeNull();
  });
});

describe("a fund's quarter over quarter", () => {
  const h = (cusip: string, shares: number, value: number) => ({ cusip, company: cusip, shares, value });
  it("value change and new, added, cut and sold-out positions", () => {
    const prev = [h("A", 100, 1000), h("B", 100, 1000), h("C", 100, 1000)];
    const cur = [h("A", 150, 1500), h("B", 50, 500), h("D", 10, 1000)];
    expect(quarterSummary(cur, prev)).toEqual({ value: 3000, prevValue: 3000, change: 0, positions: 3, new: 1, added: 1, cut: 1, soldOut: 1 });
    expect(quarterSummary(cur, null)).toMatchObject({ value: 3000, prevValue: null, change: null, new: 0 });
  });
});

describe("price sources", () => {
  it("Stooq's CSV and Yahoo's chart JSON", () => {
    expect(readStooq("Date,Open,High,Low,Close,Volume\n2026-10-27,1,2,0.5,1.5,100\n2026-10-28,1,2,0.5,N/D,100\n")).toEqual([{ date: "2026-10-27", close: 1.5 }]);
    expect(readStooq("No data")).toEqual([]);
    const y = { chart: { result: [{ timestamp: [Date.UTC(2026, 9, 27, 14, 30) / 1000, Date.UTC(2026, 9, 28, 14, 30) / 1000], indicators: { quote: [{ close: [10, null] }] } }] } };
    expect(readYahoo(y)).toEqual([{ date: "2026-10-27", close: 10 }]);
    expect(readYahoo(null)).toEqual([]);
  });

  it("market price history: Polymarket (seconds, 0..1) and Kalshi candlesticks (cents or dollars)", () => {
    expect(readPolyHistory({ history: [{ t: 200, p: 0.6 }, { t: 100, p: 0.5 }, { t: 300, p: 1.5 }] })).toEqual([{ t: 100_000, p: 0.5 }, { t: 200_000, p: 0.6 }]);
    expect(readKalshiCandles({ candlesticks: [{ end_period_ts: 100, price: { close: 42 } }, { end_period_ts: 200, price: { close_dollars: "0.45" } }, { end_period_ts: 300, price: {}, yes_bid: { close: 40 } }] }))
      .toEqual([{ t: 100_000, p: 0.42 }, { t: 200_000, p: 0.45 }, { t: 300_000, p: 0.4 }]);
    expect(kalshiSeries("KXNFLGAME-26NOV09NYJBUF-NYJ")).toBe("KXNFLGAME");
    expect(kalshiSeries("odd")).toBeNull();
  });

  it("the price now: Gamma outcomePrices (a JSON string), else lastTradePrice; Kalshi dollars, else cents", () => {
    expect(gammaYesPrice({ outcomePrices: "[\"0.62\", \"0.38\"]" })).toBeCloseTo(0.62);
    expect(gammaYesPrice({ lastTradePrice: 0.4 })).toBeCloseTo(0.4);
    expect(gammaYesPrice({})).toBeNull();
    expect(kalshiYesPrice({ last_price_dollars: "0.31" })).toBeCloseTo(0.31);
    expect(kalshiYesPrice({ last_price: 55 })).toBeCloseTo(0.55);
    expect(kalshiYesPrice({})).toBeNull();
  });
});

describe("New York's day", () => {
  it("midnight ET in summer (UTC−4) and winter (UTC−5)", () => {
    expect(new Date(startOfEtDay(Date.UTC(2026, 6, 4, 3))).toISOString()).toBe("2026-07-03T04:00:00.000Z");
    expect(new Date(startOfEtDay(Date.UTC(2026, 6, 4, 15))).toISOString()).toBe("2026-07-04T04:00:00.000Z");
    expect(new Date(startOfEtDay(Date.UTC(2026, 11, 4, 15))).toISOString()).toBe("2026-12-04T05:00:00.000Z");
  });
});

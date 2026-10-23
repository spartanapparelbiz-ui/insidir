import test from "node:test";
import assert from "node:assert/strict";
import { scoreTrade, bandOf } from "../src/signal-score.mjs";
import { lastChange, marker, todayData, HERO_SQL, MARKET_SQL } from "../src/today.mjs";

/* Signal score (src/signal-score.mjs) by the fixed rules in docs/INSIDER-EDGE-PLAN.md §2, and the Today data
   (src/today.mjs). Fixtures are fictional. */
const buy = (x = {}) => ({ code: "P", shares: 10000, shares_after: 60000, role: "CEO", ...x });

test("bands: 0–39 Low, 40–69 Medium, 70–100 High", () => {
  assert.deepEqual([bandOf(0), bandOf(39), bandOf(40), bandOf(69), bandOf(70), bandOf(100)], ["Low", "Low", "Medium", "Medium", "High", "High"]);
});

test("a buy: base 30, size vs holdings up to 20, cluster 15/20, first in a year 10, after a 20% fall 10, track record 5–10", () => {
  // 10,000 on 50,000 held = +20% → 8 points
  assert.deepEqual(scoreTrade(buy()).factors.map(f => [f.key, f.points]), [["buy", 30], ["size", 8]]);
  assert.equal(scoreTrade(buy({ shares: 25000, shares_after: 75000 })).factors.find(f => f.key === "size").points, 20, "50% of the holding or more = 20");
  assert.equal(scoreTrade(buy({ shares_after: 10000 })).factors.find(f => f.key === "size").text, "a brand-new position");
  const all = scoreTrade(buy({ shares: 25000, shares_after: 75000 }), { others: 2, firstIn12m: true, drawdown: -0.31, track: { n: 5, hits: 5 } });
  assert.deepEqual(all.factors.map(f => [f.key, f.points]), [["buy", 30], ["size", 20], ["cluster", 20], ["first", 10], ["drop", 10], ["track", 10]]);
  assert.equal(all.score, 100);
  assert.equal(all.band, "High");
  assert.equal(all.sentence, "High: The CEO bought on the open market with their own money, adding 50% to their stake, 3 insiders bought within 10 days.");
  assert.equal(scoreTrade(buy(), { others: 1 }).factors.find(f => f.key === "cluster").points, 15);
  assert.equal(scoreTrade(buy(), { drawdown: -0.19 }).factors.some(f => f.key === "drop"), false, "a 19% fall is not enough");
  assert.equal(scoreTrade(buy(), { track: { n: 2, hits: 2 } }).factors.some(f => f.key === "track"), false, "fewer than 3 matured buys");
  assert.equal(scoreTrade(buy(), { track: { n: 5, hits: 3 } }).factors.find(f => f.key === "track").points, 5, "60% exactly = 5");
});

test("sales say less; 10b5-1 sales are labelled pre-scheduled and capped at 15; routine codes score 5", () => {
  const sale = scoreTrade({ code: "S", shares: 30000, shares_after: 30000, role: "director" });
  assert.deepEqual(sale.factors.map(f => [f.key, f.points]), [["sale", 5], ["size", 20]]);
  assert.equal(sale.band, "Low");
  const plan = scoreTrade({ code: "S", shares: 30000, shares_after: 30000, rule_10b5_1: true });
  assert.equal(plan.score, 15);
  assert.match(plan.sentence, /^Low: Pre-scheduled under a 10b5-1 plan/);
  assert.deepEqual([scoreTrade({ code: "A" }).score, scoreTrade({ code: "M" }).factors[0].key], [5, "routine"]);
});

test("Today: last close and change; markers carry who, role, amount and the filing link (sec.gov only)", () => {
  assert.deepEqual(lastChange([["2026-10-21", 100], ["2026-10-22", 110]]), { day: "2026-10-22", close: 110, change: 10, pct: 0.10000000000000009 });
  assert.equal(lastChange([]), null);
  const m = marker({ id: "x", transaction_date: new Date("2026-10-01T00:00:00Z"), transaction_code: "S", rule_10b5_1: true, estimated_value: "1600000", shares: "20000", price_per_share: "80", owner_name: "PARK AVERY", owner_cik: "52", role: "director", source_url: "https://www.sec.gov/x" });
  assert.deepEqual(m, { id: "x", day: "2026-10-01", kind: "sell", planned: true, value: 1600000, shares: 20000, price: 80, owner: "PARK AVERY", ownerCik: "52", role: "director", url: "https://www.sec.gov/x" });
  assert.equal(marker({ transaction_code: "P", source_url: "https://evil.example/x" }).url, null);
});

test("Today: the hero is the biggest trade at the watchlist; a quiet watchlist falls back to the market, and says so", async () => {
  const row = { id: "r1", ticker: "EXMP", issuer_name: "EXAMPLE CORP", issuer_cik: "99", owner_cik: "42", owner_name: "DOE JANE", transaction_code: "P", transaction_date: "2026-10-21",
    shares: "10000", shares_after: "60000", price_per_share: "24", estimated_value: "240000", source_url: "https://www.sec.gov/x", published_at: "2026-10-22T20:00:00Z", is_director: true };
  const query = async (sql, params) => {
    if (sql.startsWith("SELECT ticker FROM watchlist")) return { rows: [{ ticker: "EXMP" }] };
    if (sql === HERO_SQL) return { rows: params[0] ? [] : [row] };
    if (sql === MARKET_SQL) return { rows: [{ bought: 5e6, sold: 1.9e6, buys: 5, sells: 2 }] };
    if (/price_series/.test(sql)) return { rows: [] };
    if (/FROM price_daily/.test(sql) && /ORDER BY day$/.test(sql)) return { rows: [{ day: "2026-10-21", close: 24 }, { day: "2026-10-22", close: 25 }] };
    return { rows: [] };
  };
  const d = await todayData(query, "u1");
  assert.equal(d.hero.scope, "market", "nothing at the watchlist in 30 days");
  assert.equal(d.hero.trade.sentence, "Jane Doe, a director, bought $240K of EXMP stock on Oct 21, 2026.");
  assert.equal(d.hero.score.band, "Medium");
  assert.deepEqual(d.watchlist.map(w => [w.ticker, w.last?.close, w.spark.length]), [["EXMP", 25, 2]]);
  assert.equal(d.market.bought, 5e6);
});

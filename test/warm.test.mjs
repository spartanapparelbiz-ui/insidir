import test from "node:test";
import assert from "node:assert/strict";
import { warmCompanies, POPULAR } from "../src/warm.mjs";

// The SEC ticker index shape (company_tickers.json): { "0": { cik_str, ticker, title }, ... }.
const INDEX = Object.fromEntries(["ORCL", "NVDA", "AAPL", "MSFT", "AMZN"].map((t, i) => [String(i), { cik_str: 1000 + i, ticker: t, title: t }]));

test("followed companies are read ahead first, then popular ones, bounded per run", async () => {
  const seen = [];
  const load = { index: async () => INDEX, insiders: async t => { seen.push(t); }, company: async () => {}, facts: async () => {}, profile: async () => {} };
  const run = async sql => ({ rows: /FROM watchlist/.test(sql) ? [{ ticker: "ORCL", n: 3 }, { ticker: "bad ticker!", n: 2 }] : [] });
  const r = await warmCompanies({ run, limit: 3, load });
  assert.deepEqual(seen, ["ORCL", "NVDA", "AAPL"], "the followed company first, then the popular list, up to the limit");
  assert.deepEqual([r.warmed, r.failed, r.of], [3, 0, 3]);
  assert.ok(POPULAR.includes("NVDA"));
});

test("a failing source is counted, and the run keeps going", async () => {
  const load = { index: async () => INDEX, insiders: async t => { if (t === "NVDA") throw new Error("SEC 503"); }, company: async () => {}, facts: async () => {}, profile: async () => {} };
  const r = await warmCompanies({ run: async () => ({ rows: [] }), limit: 3, load });
  assert.deepEqual([r.warmed, r.failed], [2, 1]);
});

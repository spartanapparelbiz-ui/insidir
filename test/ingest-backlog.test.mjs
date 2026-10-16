import test from "node:test";
import assert from "node:assert/strict";
import { recentForm4Backlog } from "../src/sec.mjs";

/* The ingester pages back through EDGAR's current-filings feed until it reaches filings it already stored. */
const f = n => ({ accession: String(n).padStart(18, "0") });
const pages = (...ps) => async ({ start }) => ps[start / 100] || [];

test("pages back until a page holds nothing new", async () => {
  const known = new Set([f(150), f(151), f(152)].map(x => x.accession));
  const fetched = [];
  const fetchPage = async q => { fetched.push(q.start); return pages([f(1), f(1), f(2)], [f(3), f(150)], [f(151), f(152)], [f(999)])(q); };
  const out = await recentForm4Backlog({ isKnown: async a => known.has(a), fetchPage });
  assert.deepEqual(out.map(x => Number(x.accession)), [1, 2, 3, 150, 151, 152]);
  assert.deepEqual(fetched, [0, 100, 200], "stops at the page with nothing new");
});

test("stops at maxPages and on an empty page", async () => {
  const many = Array.from({ length: 20 }, (_, i) => [f(i * 2), f(i * 2 + 1)]);
  assert.equal((await recentForm4Backlog({ isKnown: async () => false, fetchPage: pages(...many), maxPages: 3 })).length, 6);
  assert.equal((await recentForm4Backlog({ isKnown: async () => false, fetchPage: pages([f(1)], []) })).length, 1);
});

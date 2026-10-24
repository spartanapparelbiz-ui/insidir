/* The Insidir instrument, event tape, capital structure and research-report sections: pure tests. The
 * PostgreSQL behaviour of the same routes is covered in intelligence-db.test.mjs. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARK, parseTapeFilters, roleEdges } from "../src/intelligence-instrument.mjs";
import { buildDirectory, parseQuestion, buildRelationships, buildTimeline, verifyCitations, STAGES } from "../src/intelligence-investigate.mjs";

test("the instrument is the Insidir mark itself: the same ten circles as favicon.svg, in order, never rearranged", () => {
  const svg = readFileSync(new URL("../web/assets/icons/favicon.svg", import.meta.url), "utf8");
  const circles = [...svg.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"\/>/g)].map(m => m.slice(1).map(Number));
  assert.equal(circles.length, 10);
  assert.deepEqual(MARK.map(d => [d.cx, d.cy, d.r]), circles);
  assert.equal(new Set(MARK.map(d => d.id)).size, 10, "every dot has its own layer");
  // The Intelligence page reads the instrument's categories from the engine's answer (inst.data.mark), keeping no copy.
  const js = readFileSync(new URL("../web/assets/js/intelligence-app.js", import.meta.url), "utf8");
  assert.match(js, /inst\.data\.mark/);
});

test("event-tape filters are whitelisted and bounded", () => {
  assert.deepEqual(parseTapeFilters(new URLSearchParams("")), { days: 7, form: "all", ticker: null, person: null, before: null });
  assert.deepEqual(parseTapeFilters(new URLSearchParams("days=90&form=8-K&ticker=$nvda&person=Huang Jen")), { days: 90, form: "8-K", ticker: "NVDA", person: "Huang Jen", before: null });
  assert.equal(parseTapeFilters(new URLSearchParams("days=9999&form=DROP")).days, 7);
  assert.equal(parseTapeFilters(new URLSearchParams("form=DROP")).form, "all");
  assert.throws(() => parseTapeFilters(new URLSearchParams("ticker=NV'DA")), e => e.status === 400);
  assert.throws(() => parseTapeFilters(new URLSearchParams("person=%25%27;--")), e => e.status === 400);
  assert.throws(() => parseTapeFilters(new URLSearchParams("before=yesterday-ish")), e => e.status === 400);
  assert.equal(parseTapeFilters(new URLSearchParams("person=" + "x".repeat(200))).person.length, 60);
});

test("relationship labels say only what the Form 4 boxes say", () => {
  assert.deepEqual(roleEdges({ is_director: true, is_officer: true, officer_title: "EVP  and CFO", is_ten_percent_owner: true, other_text: "Trustee" }),
    ["Director", "Officer: EVP and CFO", "10% owner", "Other: Trustee"]);
  assert.deepEqual(roleEdges({}), []);
});

const dir = buildDirectory([{ ticker: "NVDA", issuer_name: "NVIDIA CORP" }, { ticker: "AAPL", issuer_name: "Apple Inc." }, { ticker: "AMZN", issuer_name: "AMAZON COM INC" }, { ticker: "TSLA", issuer_name: "Tesla, Inc." }, { ticker: "MSFT", issuer_name: "MICROSOFT CORP" }]);
test("the new example questions are understood", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  let p = parseQuestion("What changed at Nvidia this month?", dir, { now });
  assert.deepEqual([p.companies[0].ticker, p.intent], ["NVDA", "overview"], "a change question covers transactions and filings");
  p = parseQuestion("Show recent insider transactions at Tesla.", dir, { now });
  assert.deepEqual([p.companies[0].ticker, p.intent], ["TSLA", "insider_activity"]);
  p = parseQuestion("What did Microsoft's executives disclose?", dir, { now });
  assert.deepEqual([p.companies[0].ticker, p.intent], ["MSFT", "insider_activity"]);
  p = parseQuestion("Compare recent filings for Apple and Amazon.", dir, { now });
  assert.deepEqual([p.companies.map(c => c.ticker), p.intent, p.mentionsFilings], [["AAPL", "AMZN"], "compare", true]);
  assert.deepEqual(STAGES.map(s => s.id), ["understood", "sources", "connected", "verified", "prepared"]);
});

test("relationships and timeline come only from the retrieved lines, and every citation is verified", () => {
  const list = [], cite = r => { const id = list.length + 1; list.push({ id, url: r.url }); return id; };
  const lines = [
    { accession: "a1", owner_cik: "0001", owner_name: "HUANG JEN HSUN", ticker: "NVDA", issuer_name: "NVIDIA CORP", category: "reported_sale", transaction_code: "S", shares: 100, transaction_date: "2026-10-16", published_at: "2026-10-18T10:00:00Z", source_url: "https://www.sec.gov/a1", security_title: "Common Stock", form_type: "4" },
    { accession: "a1", owner_cik: "1", owner_name: "HUANG JEN HSUN", ticker: "NVDA", issuer_name: "NVIDIA CORP", category: "other", transaction_code: "F", shares: 5, transaction_date: "2026-10-16", published_at: "2026-10-18T10:00:00Z", source_url: "https://www.sec.gov/a1", security_title: "Common Stock", form_type: "4" }
  ];
  const rel = buildRelationships(lines, new Map([["a1|1", "President and CEO"]]), cite);
  assert.equal(rel.length, 1, "bare and padded CIKs are one person");
  assert.deepEqual([rel[0].sales, rel[0].other, rel[0].role, rel[0].basis], [1, 1, "President and CEO", "Role as checked on the person's Form 4"]);
  const tl = buildTimeline(lines, [{ date: "2026-10-17", kind: "event", text: "Date of event", cites: [] }], cite);
  assert.deepEqual(tl.map(e => e.kind), ["disclosed", "event", "transaction", "transaction"]);
  const bogus = { summary: [{ text: "x", cites: [1, 99] }], sections: [{ facts: [{ text: "y", cites: [1] }], records: [{ citation: 42 }] }], relationships: rel, timeline: tl };
  const v = verifyCitations(bogus, [...list, { id: 3, url: "javascript:alert(1)" }]);
  assert.deepEqual(bogus.summary[0].cites, [1], "an unknown citation number is removed, never shown");
  assert.equal(bogus.sections[0].records[0].citation, null);
  assert.equal(v.removed, 2);
});

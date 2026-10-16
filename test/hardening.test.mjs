import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic } from "../src/web.mjs";
import { createApiServer } from "../src/api.mjs";
import { summarizeOwnershipFiling, summarizePeople, markSuperseded } from "../src/insiders.mjs";

/* Production hardening: HTTPS pinning, an honest answer during a database outage, parsed-only transactions,
 * and amended Form 4 lines counted once. */

async function listen(server) {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test("pages carry Strict-Transport-Security when cookies are Secure", async () => {
  const { base, close } = await listen(createServer((req, res) => serveStatic(req, res).then(d => { if (!d) { res.writeHead(404); res.end(); } })));
  try {
    const r = await fetch(base + "/index.html");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  } finally { close(); }
});

const PAID = { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active", current_period_end: new Date(Date.now() + 864e5) };

test("a database outage answers 503 with Retry-After, not 500", async () => {
  const down = async () => { throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }); };
  const { base, close } = await listen(createApiServer({ quiet: true, env: { INSIDIR_PAYWALL: "1" }, currentUser: async () => PAID, query: down }));
  const original = console.error; console.error = () => {};
  try {
    const r = await fetch(base + "/v1/me/manual-holdings");
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("retry-after"), "30");
    assert.match((await r.json()).error, /temporarily unavailable/);
  } finally { console.error = original; close(); }
});

const owner = { name: "Jane Doe", cik: "0001234567", isDirector: true };
const line = (shares, date = "2026-09-18") => ({ transactionDate: date, code: "S", acquiredDisposed: "D", derivative: false, securityTitle: "Common", shares, pricePerShare: 100, estimatedValue: shares * 100, category: "reported_sale" });
const filing = (accession, form, filedAt) => ({ accession, form, filedAt, viewUrl: "https://www.sec.gov/x", xmlUrl: "https://www.sec.gov/x.xml" });

test("a Form 4/A that restates the original is counted once", () => {
  const original = summarizeOwnershipFiling({ owners: [owner], transactions: [line(1000)] }, filing("0000000000-26-000001", "4", "2026-09-20"));
  const amended = summarizeOwnershipFiling({ owners: [owner], transactions: [line(1000)] }, filing("0000000000-26-000002", "4/A", "2026-09-25"));
  const [person] = summarizePeople(markSuperseded([amended, original]));
  assert.equal(person.netShares, -1000);
  assert.equal(person.value, 100000);
  assert.equal(original.superseded, true);
  assert.equal(JSON.parse(JSON.stringify(original)).lines, undefined, "full line list stays out of the JSON");
});

test("lines an amendment does not repeat still count, and other people's filings are untouched", () => {
  const original = summarizeOwnershipFiling({ owners: [owner], transactions: [line(1000), line(500, "2026-09-19")] }, filing("0000000000-26-000001", "4", "2026-09-20"));
  const amended = summarizeOwnershipFiling({ owners: [owner], transactions: [line(1000)] }, filing("0000000000-26-000002", "4/A", "2026-09-25"));
  const other = summarizeOwnershipFiling({ owners: [{ name: "John Roe", cik: "0007654321" }], transactions: [line(1000)] }, filing("0000000000-26-000003", "4", "2026-09-21"));
  const people = summarizePeople(markSuperseded([amended, other, original]));
  assert.equal(people.find(p => p.name === "Jane Doe").netShares, -1500);
  assert.equal(people.find(p => p.name === "John Roe").netShares, -1000);
  assert.equal(original.superseded, false);
  assert.equal(original.supersededLines, 1);
});

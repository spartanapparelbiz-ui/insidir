/* Coverage validation against live SEC EDGAR: node scripts/coverage-validate.mjs [--json]
 *
 * Needs DATABASE_URL (a migrated Insidir database) and SEC_USER_AGENT. For each case it reads the truth straight from
 * the SEC (the company ticker list, EDGAR submissions, the EDGAR entity lookup) with plain HTTP requests that do not go
 * through the code under test, then checks what Insidir's search and entity record return: discovery, the stable CIK,
 * the kind, provenance and relationships. Cases for joint filers, multi-issuer people and corporate owners are picked
 * from the imported filings at run time, not written into this file. Read-only apart from the on-demand lookups that
 * search itself stores. Exit code 1 when any case fails. */
import { config } from "../src/config.mjs";
import { query, pool, migrate } from "../src/db.mjs";
import { searchEntities, entityRecord, normalizeTicker } from "../src/sec-directory.mjs";

if (!process.env.DATABASE_URL || !config.userAgent) { console.error("Set DATABASE_URL and SEC_USER_AGENT"); process.exit(2); }
await migrate();
let last = 0;
async function sec(url) {
  const wait = Math.max(0, last + 150 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait)); last = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": config.userAgent, Accept: "application/json" } });
  if (!r.ok) throw new Error(url + " answered " + r.status);
  return r.json();
}
const pad = c => String(Number(c)).padStart(10, "0");
const truthTickers = await sec("https://www.sec.gov/files/company_tickers_exchange.json");
const tickerCik = new Map(truthTickers.data.map(r => [String(r[2]).toUpperCase(), pad(r[0])]));
const submissions = cik => sec("https://data.sec.gov/submissions/CIK" + pad(cik) + ".json");

const results = [];
async function check(category, queryText, expectCik, expect = {}) {
  const out = { category, query: queryText, expectedCik: expectCik, checks: {} };
  try {
    const t0 = Date.now();
    const r = await searchEntities(queryText, { run: query, kind: expect.searchKind || "all", limit: 10 });
    out.ms = Date.now() - t0; out.state = r.state; out.total = r.total;
    const pos = r.items.findIndex(i => i.cik === expectCik);
    out.checks.discovered = pos >= 0; out.rank = pos >= 0 ? pos + 1 : null;
    const item = r.items[pos];
    if (item) {
      out.found = { name: item.name, kind: item.kind, kindBasis: item.kindBasis, tickers: item.tickers, listed: item.listed, url: item.url, matched: item.matched, sources: item.sources };
      if (expect.kind) out.checks.kind = item.kind === expect.kind;
      if (expect.listed != null) out.checks.listed = item.listed === expect.listed;
      if (expect.url) out.checks.url = expect.url.test(item.url);
      if (expect.matchedAs) out.checks.matchedAs = item.matched?.as === expect.matchedAs;
    }
    const rec = await entityRecord(expectCik, { run: query });
    out.checks.profile = rec.state === "ok" && rec.entity.cik === expectCik;
    if (rec.state === "ok") {
      out.checks.provenance = rec.entity.sources.length > 0 && (!rec.edgar || /^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/.test(rec.edgar.sourceUrl));
      if (expect.relationships) out.checks.relationships = rec.imported.asReportingOwner.length >= expect.relationships && rec.imported.asReportingOwner.every(x => /^https:\/\/www\.sec\.gov\/Archives\//.test(x.evidenceUrl || ""));
      if (expect.former) out.checks.formerName = rec.names.some(n => n.as === "former" && expect.former.test(n.name));
      out.relationships = rec.imported.asReportingOwner.slice(0, 3).map(x => ({ issuer: x.issuerName, role: x.role, filings: x.filings }));
    }
  } catch (e) { out.error = String(e?.message || e); }
  out.pass = !out.error && Object.values(out.checks).every(Boolean);
  results.push(out);
}

// Companies: truth from the SEC ticker list and submissions, read above with plain requests.
await check("major issuer", "Apple", tickerCik.get("AAPL"), { kind: "company", listed: true, url: /^company\.html\?ticker=AAPL$/ });
for (const [a, b] of [["BRK-A", "BRK-B"], ["GOOGL", "GOOG"]]) {
  if (tickerCik.get(a) !== tickerCik.get(b)) throw new Error("SEC list: " + a + " and " + b + " are not one CIK");
  await check("multiple share classes", a.replace("-", "."), tickerCik.get(a), { kind: "company", listed: true });
  await check("multiple share classes", b, tickerCik.get(b), { kind: "company", listed: true });
}
const meta = await submissions(tickerCik.get("META"));
const formerMeta = (meta.formerNames || [])[0]?.name;
if (formerMeta) await check("renamed company (former name)", formerMeta.replace(/\binc\b\.?/i, "").trim(), pad(meta.cik), { kind: "company", matchedAs: "former name", former: new RegExp(formerMeta, "i") });
// Companies with no ticker on the SEC list, found by EDGAR's own lookup, their submissions confirming no ticker.
for (const [category, name] of [["operating company without a ticker", "Berkshire Hathaway Energy"], ["acquired / delisted company", "Twitter, Inc."]]) {
  const hit = (await sec("https://efts.sec.gov/LATEST/search-index?keysTyped=" + encodeURIComponent(name))).hits.hits[0];
  const sub = await submissions(hit._id);
  if (sub.tickers.length) throw new Error(name + " has tickers on EDGAR now; pick another case");
  await check(category, name, pad(hit._id), { kind: "company", listed: false, url: /^entity\.html\?cik=\d{10}$/ });
}
await check("search by CIK", String(Number(tickerCik.get("MSFT"))), tickerCik.get("MSFT"), { kind: "company" });
await check("typo tolerance", "Microsft", tickerCik.get("MSFT"), { kind: "company" });
// A small issuer: an imported issuer whose only SEC-list listing is over the counter.
const small = (await query(`SELECT e.cik,e.name FROM sec_entities e WHERE e.listed AND e.issuer_filings>0 AND 'OTC'=ALL(e.exchanges) ORDER BY e.issuer_filings,e.cik LIMIT 1`)).rows[0];
if (small) await check("smaller issuer (over-the-counter)", small.name, small.cik, { kind: "company" });

// People and owners, picked from what is imported.
const cookHit = (await sec("https://efts.sec.gov/LATEST/search-index?keysTyped=cook%20timothy%20d")).hits.hits.find(h => /^COOK TIMOTHY D$/i.test(h._source.entity));
if (cookHit) await check("individual reporting owner (not necessarily imported)", "Tim Cook", pad(cookHit._id), { kind: "person", searchKind: "owner", url: /^person\.html\?cik=\d{10}$/ });
const joint = (await query(`SELECT o.owner_cik,o.owner_name FROM sec_filing_owners o WHERE o.accession=(SELECT accession FROM sec_filing_owners GROUP BY accession HAVING count(*)>1 ORDER BY accession LIMIT 1)`)).rows;
for (const o of joint) await check("joint reporting person", o.owner_name, pad(o.owner_cik), { searchKind: "owner", relationships: 1 });
const multi = (await query(`SELECT owner_cik,(array_agg(owner_name))[1] AS name FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  GROUP BY owner_cik HAVING count(DISTINCT f.issuer_cik)>1 ORDER BY count(DISTINCT f.issuer_cik) DESC, owner_cik LIMIT 2`)).rows;
for (const o of multi) await check("reporting person at several issuers", o.name, pad(o.owner_cik), { searchKind: "owner", relationships: 2 });
const multiPerson = (await query(`SELECT o.owner_cik,(array_agg(o.owner_name))[1] AS name FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  JOIN sec_entities e ON e.cik=LPAD(LTRIM(o.owner_cik,'0'),10,'0') AND e.kind='person'
  GROUP BY o.owner_cik HAVING count(DISTINCT f.issuer_cik)>1 ORDER BY count(DISTINCT f.issuer_cik) DESC, o.owner_cik LIMIT 2`)).rows;
for (const o of multiPerson) await check("individual at several issuers", o.name, pad(o.owner_cik), { kind: "person", searchKind: "owner", relationships: 2 });
const corp = (await query(`SELECT cik,name FROM sec_entities WHERE kind='organization' AND owner_filings>0 ORDER BY owner_filings DESC,cik LIMIT 2`)).rows;
for (const o of corp) await check("corporate / institutional reporting owner", o.name, o.cik, { kind: "organization", searchKind: "owner", relationships: 1 });
const unknownCik = "0000000001";
const nf = await searchEntities(unknownCik, { run: query });
results.push({ category: "nonexistent CIK", query: unknownCik, state: nf.state, pass: nf.state === "no_match" && !nf.items.length, checks: { explicitNoMatch: nf.state === "no_match" } });

const passed = results.filter(r => r.pass).length;
if (process.argv.includes("--json")) console.log(JSON.stringify({ passed, failed: results.length - passed, results }, null, 1));
else for (const r of results) console.log((r.pass ? "PASS " : "FAIL ") + r.category.padEnd(52) + JSON.stringify(r.query).padEnd(36) + " → " + (r.found ? r.found.name + " (" + r.found.kind + ", rank " + r.rank + ", " + r.ms + "ms)" : r.state || r.error) + (r.pass ? "" : " " + JSON.stringify(r.checks)));
console.log(`\n${passed}/${results.length} cases passed`);
await pool.end();
process.exit(passed === results.length ? 0 : 1);

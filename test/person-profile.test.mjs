import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import {
  handlePersonRoute, personProfile, isPersonRoute, parsePersonCik, parseLimit, rolesOf, exactSum, buildTotals, createSecBudget, createSecCache,
  SQL, COMPANIES_SQL, NAMES_SQL, TRANSACTIONS_SQL, FILINGS_SQL, OWNERS_TABLE_SQL, JOINT_OWNERS_SQL, withJointOwners, hasFilingOwners, SAME_LINE, RECENT_FILED, RECENT_DISCLOSED, DISCLAIMER, NOT_FOUND, NOT_FOUND_SINGLE,
  MAX_ROLE_ISSUERS, PROFILES_PER_MINUTE, SEC_PER_PROFILE, SEC_ALLOWANCE, SEC_ROUTE_PER_MINUTE, SEC_QUEUE_LIMIT_MS, HEAVY_LINES
} from "../src/person-profile.mjs";
import { ownerRole } from "../src/insiders.mjs";
import { classifyApi } from "../src/paywall.mjs";
import { secReady } from "../src/config.mjs";

/* GET /v1/people/<cik>: the reporting-person profile. Runs against an injected query(sql, params)
 * and stubbed SEC lookups, so no database or network is touched (the last test also runs the SQL on
 * PostgreSQL when INSIDIR_TEST_DATABASE_URL is set, inside a throwaway schema). Fixtures are
 * fictional people. */

const CIKS = ["9876543", "0009876543"];
const XML = (issuer, accession = "000987654326000001") => `https://www.sec.gov/Archives/edgar/data/${Number(issuer)}/${accession}/form4.xml`;
const STATEMENTS = [OWNERS_TABLE_SQL, COMPANIES_SQL, NAMES_SQL, TRANSACTIONS_SQL, FILINGS_SQL];

// Answers by exact SQL text and records every statement (same idea as fakeQuery in following.test.mjs).
// OWNERS_TABLE_SQL is unanswered by default, i.e. sec_filing_owners does not exist.
function fakeQuery(answers = {}) {
  const fn = async (sql, params) => {
    fn.statements.push({ sql, params });
    const answer = answers[sql];
    if (answer instanceof Error) throw answer;
    if (typeof answer === "function") return answer(params);
    return answer || { rows: [], rowCount: 0 };
  };
  fn.statements = [];
  return fn;
}
// Per-issuer rows as pg returns them: COUNT ::integer as numbers, SUM/NUMERIC as strings, dates as Date.
const issuerRow = (issuer, extra = {}) => ({
  issuer_cik: issuer, ticker: "EXMP", issuer_name: "Example Corp", latest_xml_url: XML(issuer), latest_accession: "000987654326000001",
  transactions: 3, superseded: 0, filings: 2, purchases_count: 1, purchases_shares: "10.00000000", purchases_value: "1000.50",
  sales_count: 1, sales_shares: "5.00000000", sales_value: "600.25", other_count: 1,
  first_transaction_date: new Date("2026-01-05T00:00:00Z"), last_transaction_date: new Date("2026-10-01T00:00:00Z"),
  last_published_at: new Date("2026-10-03T21:15:00Z"),
  d30_transactions: 1, d30_superseded: 0, d30_filings: 1, d30_purchases_count: 1, d30_purchases_shares: "10.00000000", d30_purchases_value: "1000.50",
  d30_sales_count: 0, d30_sales_shares: "0", d30_sales_value: "0", d30_other_count: 0,
  d30_first_transaction_date: new Date("2026-10-01T00:00:00Z"), d30_last_transaction_date: new Date("2026-10-01T00:00:00Z"),
  d30_last_published_at: new Date("2026-10-03T21:15:00Z"), ...extra
});
const noRecent = { d30_transactions: 0, d30_superseded: 0, d30_filings: 0, d30_purchases_count: 0, d30_purchases_shares: "0", d30_purchases_value: "0",
  d30_sales_count: 0, d30_sales_shares: "0", d30_sales_value: "0", d30_other_count: 0,
  d30_first_transaction_date: null, d30_last_transaction_date: null, d30_last_published_at: null };
const txRow = (id, extra = {}) => ({
  id, accession: id.split(":")[0], issuer_cik: "0000099999", ticker: "EXMP", owner_cik: "0009876543", owner_name: "DOE JANE",
  transaction_date: new Date("2026-10-01T00:00:00Z"), security_title: "Common Stock", transaction_code: "P", acquired_disposed: "A",
  category: "reported_purchase", derivative: false, shares: "10.00000000", price_per_share: "100.05000000", estimated_value: "1000.50",
  direct_ownership: "D", source_url: "https://www.sec.gov/Archives/edgar/data/9876543/000987654326000001/", created_at: new Date("2026-10-04T00:00:00Z"),
  issuer_name: "Example Corp", published_at: new Date("2026-10-03T21:15:00Z"), is_amendment: false, superseded: false, ...extra
});
const nameRow = (name, cik = "0009876543") => ({ owner_cik: cik, owner_name: name, last_published_at: new Date("2026-10-03T21:15:00Z"), last_transaction_date: new Date("2026-10-01T00:00:00Z") });
const filingRow = (accession, extra = {}) => ({ accession, form_type: "4", ticker: "EXMP", issuer_cik: "0000099999", issuer_name: "Example Corp",
  published_at: new Date("2026-10-03T21:15:00Z"), source_url: "https://www.sec.gov/Archives/edgar/data/9876543/" + accession + "/", lines: 2, ...extra });
function ownershipXml({ issuer = "0000099999", owners = [{ cik: "0009876543", name: "DOE JANE", director: 1, officer: 1, title: "Chief Executive Officer" }] } = {}) {
  const owner = o => `<reportingOwner><reportingOwnerId><rptOwnerCik>${o.cik}</rptOwnerCik><rptOwnerName>${o.name}</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>${o.director ? 1 : 0}</isDirector><isOfficer>${o.officer ? 1 : 0}</isOfficer>
    ${o.title ? `<officerTitle>${o.title}</officerTitle>` : ""}<isTenPercentOwner>${o.tenPercent ? 1 : 0}</isTenPercentOwner>
    ${o.other ? `<isOther>1</isOther><otherText>${o.other}</otherText>` : ""}</reportingOwnerRelationship></reportingOwner>`;
  return `<?xml version="1.0"?><ownershipDocument><schemaVersion>X0508</schemaVersion><documentType>4</documentType>
    <periodOfReport>2026-10-01</periodOfReport><issuer><issuerCik>${issuer}</issuerCik><issuerName>Example Corp</issuerName>
    <issuerTradingSymbol>EXMP</issuerTradingSymbol></issuer>${owners.map(owner).join("")}</ownershipDocument>`;
}
// A stub SEC fetcher: url -> body | Error | a never-settling promise; records every URL asked for.
function stubFetcher(byUrl = {}) {
  const fn = async url => {
    fn.calls.push(url);
    const answer = byUrl[url];
    if (answer === "hang") return new Promise(() => {});
    if (answer instanceof Error || answer === undefined) throw answer || new Error("SEC responded 404");
    return answer;
  };
  fn.calls = [];
  return fn;
}
const noIssuers = async () => [];
const generous = () => createSecBudget({ perProfile: { documents: 100, ownerPages: 1 }, perMember: { documents: 1000, ownerPages: 100 }, perMinute: 10000 });
let requesterSeq = 0;
// Calls the handler the way src/api.mjs does: false = not this route; a thrown {status} = JSON error.
// Each call gets its own SEC allowance unless the test passes one.
async function call(path, deps, { method = "GET" } = {}) {
  const url = new URL(path, "http://localhost");
  const req = { method, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const res = { status: 0, headers: null, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b ?? ""; } };
  const full = { requester: "test:" + (++requesterSeq), ownerIssuers: noIssuers, tickerIndex: null, fetcher: stubFetcher(), secBudget: createSecBudget(), ...deps };
  try {
    if (await handlePersonRoute(req, res, url, full) === false) return { handled: false };
    return { status: res.status, headers: res.headers, json: JSON.parse(res.body) };
  } catch (e) { return { status: e.status || 500, error: e.message }; }
}
const iso = value => JSON.parse(JSON.stringify(value));
const fullAnswers = (rows = [issuerRow("0000099999")], extra = {}) => ({
  [COMPANIES_SQL]: { rows }, [NAMES_SQL]: { rows: [nameRow("DOE JANE")] },
  [TRANSACTIONS_SQL]: { rows: [txRow("000987654326000001:N:0")] }, [FILINGS_SQL]: { rows: [filingRow("000987654326000001")] }, ...extra
});
const flat = s => s.replace(/\s+/g, " ");
// The expression behind " AS <alias>" in COMPANIES_SQL, where each measure sits on its own line.
const measure = alias => COMPANIES_SQL.split("\n").map(l => l.trim()).find(l => new RegExp(" AS " + alias + ",?$").test(l)) || null;

test("route matching: only /v1/people/<segment>, GET or HEAD", async () => {
  assert.equal(isPersonRoute("/v1/people/9876543"), true);
  assert.equal(isPersonRoute("/v1/people/"), true);
  for (const p of ["/v1/people", "/v1/me/people", "/v1/me/people/9876543", "/v1/people/1/x", "/v1/peoples/1", "/v1/insiders"]) {
    assert.equal(isPersonRoute(p), false, p);
    assert.deepEqual(await call(p, { query: fakeQuery() }), { handled: false }, p);
  }
  const query = fakeQuery();
  for (const method of ["POST", "DELETE", "PUT"]) assert.deepEqual(await call("/v1/people/9876543", { query }, { method }), { status: 405, error: "Method not allowed" });
  assert.equal(query.statements.length, 0);
  // Unlisted /v1 paths fail closed in the paywall: a signed-in, subscribed product read like /v1/insiders.
  for (const method of ["GET", "HEAD"]) assert.equal(classifyApi("/v1/people/9876543", method), "product");
  assert.equal(classifyApi("/v1/insiders"), "product");
});

test("validation: a bad CIK is 400 before any query; an unknown CIK is 404 after the first statement", async () => {
  const query = fakeQuery();
  for (const bad of ["abc", "12a", "9876543890123", "0", "000000000000", "-1", "1.5", "%20", "%E0%A4%A", "", "1%2F2"]) {
    const r = await call("/v1/people/" + bad, { query });
    assert.deepEqual(r, { status: 400, error: "Invalid SEC reporting-person CIK" }, bad);
  }
  assert.equal(query.statements.length, 0, "invalid input never reaches the database");
  const fetcher = stubFetcher();
  let ownerLookups = 0;
  const r = await call("/v1/people/7654321", { query, fetcher, ownerIssuers: async () => { ownerLookups++; return []; } });
  // Without sec_filing_owners the 404 says why a joint-only filer has no file.
  assert.deepEqual(r, { status: 404, error: NOT_FOUND_SINGLE });
  assert.match(NOT_FOUND_SINGLE, /Joint filings \(several reporting owners\) are not yet attributed/);
  assert.deepEqual(query.statements.map(s => s.sql), [OWNERS_TABLE_SQL, COMPANIES_SQL]);
  assert.deepEqual(query.statements[1].params, [["7654321", "0007654321"]]);
  assert.equal(fetcher.calls.length + ownerLookups, 0, "no SEC request for a person who is not in the import");
  // The catalogue answer is remembered for this query function.
  await call("/v1/people/7654322", { query });
  assert.deepEqual(query.statements.map(s => s.sql), [OWNERS_TABLE_SQL, COMPANIES_SQL, COMPANIES_SQL]);
  assert.throws(() => parsePersonCik("x"), e => e.status === 400);
});

test("requireUser runs first: a signed-out request is refused without touching the database", async () => {
  const query = fakeQuery(fullAnswers());
  const requireUser = async () => { throw Object.assign(new Error("Sign in required"), { status: 401 }); };
  assert.deepEqual(await call("/v1/people/9876543", { query, requireUser }), { status: 401, error: "Sign in required" });
  assert.equal(query.statements.length, 0);
  const member = await call("/v1/people/9876543", { query, requireUser: async () => ({ id: "u-1" }) });
  assert.equal(member.status, 200);
});

test("padded and unpadded CIKs are the same person; SQL is bound to both forms", async () => {
  for (const cik of ["9876543", "0009876543", "000009876543", "%30%30%309876543"]) {
    const query = fakeQuery(fullAnswers());
    const r = await call("/v1/people/" + cik, { query });
    assert.equal(r.status, 200, cik);
    assert.deepEqual(query.statements.map(s => s.sql), STATEMENTS, cik);
    for (const s of query.statements.slice(1)) assert.deepEqual(s.params[0], CIKS, cik);
    assert.equal(r.json.person.cik, "0009876543", "the CIK as stored, which follows match on");
    assert.equal(r.json.edgar_url, "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0009876543&type=4&dateb=&owner=include&count=40");
  }
  assert.deepEqual(parsePersonCik(" 42 "), { bare: "42", ciks: ["42", "0000000042"] });
  assert.deepEqual(parsePersonCik("9876543890"), { bare: "9876543890", ciks: ["9876543890"] });
});

test("limit: default 100, clamped to 1..500, blank or non-integer falls back to the default", async () => {
  assert.equal(parseLimit(null), 100);
  const cases = [["", 100], ["?limit=", 100], ["?limit=%20", 100], ["?limit=25", 25], ["?limit=500", 500], ["?limit=501", 500],
    ["?limit=100000", 500], ["?limit=0", 1], ["?limit=-5", 1], ["?limit=abc", 100], ["?limit=2.5", 100], ["?limit=1e1", 10]];
  for (const [search, expected] of cases) {
    const query = fakeQuery(fullAnswers());
    assert.equal((await call("/v1/people/9876543" + search, { query })).status, 200, search);
    const tx = query.statements.find(s => s.sql === TRANSACTIONS_SQL);
    assert.deepEqual(tx.params, [CIKS, expected], search);
  }
});

test("SQL: parameterised, scoped by owner CIK on parsed filings, filings probed per accession, fixed statements, no N+1", async () => {
  // 30 issuers and 300 lines still cost exactly four statements (plus the remembered catalogue check).
  const issuers = Array.from({ length: 30 }, (_, i) => issuerRow(String(90000 + i).padStart(10, "0"), { latest_xml_url: null }));
  const lines = Array.from({ length: 300 }, (_, i) => txRow("0009876543260000" + String(i).padStart(2, "0") + ":N:" + i));
  const query = fakeQuery(fullAnswers(issuers, { [TRANSACTIONS_SQL]: { rows: lines } }));
  const fetcher = stubFetcher();
  const r = await call("/v1/people/9876543?limit=300", { query, fetcher });
  assert.equal(r.status, 200);
  assert.deepEqual(query.statements.map(s => s.sql), STATEMENTS);
  assert.deepEqual(query.statements[0].params, []);
  assert.equal(r.json.transactions.length, 300);
  assert.equal(r.json.companies.length, 30);
  assert.equal(fetcher.calls.length, 0, "issuers without a stored XML URL are not looked up");
  for (const mode of ["single", "joint"]) for (const [name, sql] of Object.entries(SQL[mode])) {
    const text = flat(sql);
    // Lines come off the owner index into a materialised CTE; filings are probed once per distinct accession.
    assert.match(text, /^WITH lines AS MATERIALIZED \(SELECT [a-z_.,]+ FROM sec_transactions t WHERE t\.owner_cik=ANY\(\$1::text\[\]\)/, mode + " " + name);
    assert.match(text, /files AS MATERIALIZED \(SELECT .* FROM sec_filings f WHERE f\.accession IN \(SELECT DISTINCT l\.accession FROM lines l\) AND f\.ingest_status='parsed'\)/, mode + " " + name);
    assert.doesNotMatch(text, /9876543/, "the CIK is bound, never interpolated");
    assert.equal(/sec_filing_owners/.test(text), mode === "joint", mode + " " + name);
    assert.doesNotMatch(text, /OVER /, "no window over every line");
  }
  // Joint lines: owner_cik NULL on a filing that lists the person in sec_filing_owners.
  assert.match(flat(SQL.joint.companies), /UNION ALL SELECT [a-z_.,]+ FROM sec_transactions t WHERE t\.owner_cik IS NULL AND t\.accession IN \(SELECT o\.accession FROM sec_filing_owners o WHERE o\.owner_cik=ANY\(\$1::text\[\]\)\)/);
  assert.match(flat(TRANSACTIONS_SQL), /LIMIT \$2\) SELECT t\.\*,n\.issuer_name,n\.published_at,n\.is_amendment,\(a\.amended_at IS NOT NULL AND \(n\.published_at IS NULL OR a\.amended_at>n\.published_at\)\) AS superseded FROM newest n JOIN sec_transactions t ON t\.id=n\.id/);
  assert.match(flat(TRANSACTIONS_SQL), /ORDER BY n\.transaction_date DESC NULLS LAST,n\.published_at DESC NULLS LAST,n\.id DESC$/);
  assert.match(flat(FILINGS_SQL), /ORDER BY f\.published_at DESC NULLS LAST,f\.accession DESC LIMIT 100$/);
  assert.match(flat(NAMES_SQL), /GROUP BY t\.owner_cik,t\.owner_name ORDER BY last_published_at DESC NULLS LAST/);
  assert.match(flat(COMPANIES_SQL), /SELECT LPAD\(p\.issuer_key,10,'0'\) AS issuer_cik,x\.ticker,x\.issuer_name,x\.latest_xml_url,x\.latest_accession,/);
  assert.match(flat(COMPANIES_SQL), /ORDER BY x\.last_published_at DESC NULLS LAST,p\.last_transaction_date DESC NULLS LAST,1$/);
  assert.doesNotMatch(COMPANIES_SQL, /LIMIT/, "every issuer row feeds the totals");
});

test("amendments: a line repeated by a later 4/A is superseded, on the dashboard's derive() key", () => {
  // derive() in web/assets/js/v3-dashboard.js: owner, issuer, trade date, code, acquired/disposed, derivative, shares.
  assert.equal(SAME_LINE, "LTRIM(t.issuer_cik,'0')||'|'||COALESCE(t.transaction_date::text,'')||'|'||COALESCE(t.transaction_code,'')||'|'||COALESCE(t.acquired_disposed,'')||'|'||t.derivative::text||'|'||COALESCE(t.shares::text,'')");
  const companies = flat(COMPANIES_SQL);
  // The newest 4/A date per key, from 4/A lines only; a line is superseded when that is after its own filing.
  assert.ok(companies.includes(`amended AS (SELECT ${SAME_LINE} AS same,MAX(f.published_at) AS amended_at FROM lines t JOIN files f ON f.accession=t.accession WHERE f.is_amendment GROUP BY 1)`));
  assert.ok(companies.includes("(k.amended_at IS NOT NULL AND (f.published_at IS NULL OR k.amended_at>f.published_at)) AS superseded"));
  // A 4/A copy keeps the first filing date of the line it repeats (for the 30-day window).
  assert.ok(companies.includes("CASE WHEN f.is_amendment AND k.same IS NOT NULL THEN k.first_published_at ELSE f.published_at END AS disclosed_at"));
  // Every count and sum leaves superseded lines out; superseded is counted on its own.
  for (const alias of ["transactions", "purchases_count", "purchases_shares", "purchases_value", "sales_count", "sales_shares", "sales_value", "other_count", "first_transaction_date", "last_transaction_date"]) {
    for (const prefix of ["", "d30_"]) {
      const m = measure(prefix + alias);
      assert.ok(m && m.includes("FILTER (WHERE NOT c.superseded"), prefix + alias + ": " + m);
    }
  }
  assert.ok(companies.includes("(COUNT(*) FILTER (WHERE c.superseded))::integer AS superseded,"));
  assert.equal(TRANSACTIONS_SQL.includes("t.*"), true, "superseded lines are listed, flagged, never dropped from the list");
});

test("d30: lines by their first filing date, filings by publication date, never by trade date", () => {
  const companies = flat(COMPANIES_SQL);
  assert.equal(RECENT_DISCLOSED, "c.disclosed_at>=now()-interval '30 days'");
  assert.equal(RECENT_FILED, "x.published_at>=now()-interval '30 days'");
  for (const alias of ["transactions", "purchases_count", "purchases_shares", "purchases_value", "sales_count", "sales_shares", "sales_value", "other_count", "first_transaction_date", "last_transaction_date"]) {
    const m = measure("d30_" + alias);
    assert.ok(m && m.includes(RECENT_DISCLOSED), "d30_" + alias + ": " + m);
    const all = measure(alias);
    assert.ok(all && !all.includes("interval"), "all-time " + alias + " has no window: " + all);
  }
  assert.ok(companies.includes(`(COUNT(*) FILTER (WHERE ${RECENT_FILED}))::integer AS d30_filings`));
  assert.ok(companies.includes(`MAX(x.published_at) FILTER (WHERE ${RECENT_FILED}) AS d30_last_published_at`));
  assert.ok(companies.includes("(COUNT(*) FILTER (WHERE c.superseded AND c.published_at>=now()-interval '30 days'))::integer AS d30_superseded"));
  assert.ok(!/transaction_date>=|transaction_date >=/.test(companies), "the window is never on transaction_date");
});

test("totals add every issuer exactly: counts, superseded, decimal sums, date extremes, and the d30 window", () => {
  const a = issuerRow("0000099999", { transactions: "4", superseded: "2", filings: "3", purchases_count: "2", purchases_shares: "0.1", purchases_value: "0.10",
    sales_count: "1", sales_shares: "10.98765438", sales_value: "1000000000.07", other_count: "1",
    first_transaction_date: new Date("2025-03-02T00:00:00Z"), last_transaction_date: new Date("2026-09-30T00:00:00Z"),
    last_published_at: new Date("2026-10-02T12:00:00Z"), d30_superseded: 1 });
  const b = issuerRow("0000088888", { ...noRecent, transactions: 2, superseded: 0, filings: 1, purchases_count: 1, purchases_shares: "0.2", purchases_value: "0.20",
    sales_count: 1, sales_shares: "0.00000001", sales_value: "0.01", other_count: 0,
    first_transaction_date: new Date("2024-12-31T00:00:00Z"), last_transaction_date: new Date("2025-06-01T00:00:00Z"),
    last_published_at: new Date("2025-06-03T12:00:00Z") });
  const totals = buildTotals([a, b]);
  assert.deepEqual(iso(totals.all), {
    transactions: 6, superseded: 2, filings: 4,
    purchases: { count: 3, shares: 0.3, value: 0.3 },       // 0.1 + 0.2 in decimal, not 0.30000000000000004
    sales: { count: 2, shares: 10.98765439, value: 1000000000.08 },
    other: { count: 1 },
    first_transaction_date: "2024-12-31T00:00:00.000Z", last_transaction_date: "2026-09-30T00:00:00.000Z",
    last_published_at: "2026-10-02T12:00:00.000Z"
  });
  // b had nothing published in the last 30 days, so d30 is a's window only.
  assert.deepEqual(iso(totals.d30), {
    transactions: 1, superseded: 1, filings: 1, purchases: { count: 1, shares: 10, value: 1000.5 }, sales: { count: 0, shares: 0, value: 0 }, other: { count: 0 },
    first_transaction_date: "2026-10-01T00:00:00.000Z", last_transaction_date: "2026-10-01T00:00:00.000Z", last_published_at: "2026-10-03T21:15:00.000Z"
  });
  const quiet = buildTotals([issuerRow("0000099999", noRecent)]).d30;
  assert.deepEqual(iso(quiet), { transactions: 0, superseded: 0, filings: 0, purchases: { count: 0, shares: 0, value: 0 }, sales: { count: 0, shares: 0, value: 0 },
    other: { count: 0 }, first_transaction_date: null, last_transaction_date: null, last_published_at: null });
  assert.equal(exactSum(["0.1", "0.2"]), 0.3);
  assert.equal(exactSum([0.1, 0.2, null, ""]), 0.3);
  assert.equal(exactSum(["987654389012.34", "0.01"]), 987654389012.35);
  assert.equal(exactSum(["-5.5", "2"]), -3.5);
  assert.equal(exactSum(["1.5e3"]), 1500);
  assert.equal(exactSum([]), 0);
});

test("response shape: exact keys, JSON numbers for counts and sums, rows passed through like /v1/transactions", async () => {
  const issuers = [issuerRow("0000099999", { transactions: "3", purchases_value: "1000.50", sales_value: null }),
    issuerRow("0000088888", { ...noRecent, ticker: null, issuer_name: null, latest_xml_url: null, transactions: 1, purchases_value: "0", sales_value: "250.75",
      last_published_at: new Date("2025-01-02T12:00:00Z") })];
  const line = txRow("000987654326000001:N:0"), restated = txRow("000987654325000009:N:0", { superseded: true });
  const query = fakeQuery(fullAnswers(issuers, {
    [NAMES_SQL]: { rows: [nameRow("DOE JANE"), nameRow("Doe Jane A"), nameRow("DOE JANE", "9876543"), nameRow("  ")] },
    [TRANSACTIONS_SQL]: { rows: [line, restated] },
    [FILINGS_SQL]: { rows: [filingRow("000987654326000001", { lines: "2" }), filingRow("000987654325000009", { form_type: "4/A", ticker: null, issuer_cik: null, lines: 1 })] }
  }));
  const fetcher = stubFetcher({ [XML("0000099999")]: ownershipXml() });
  const r = await call("/v1/people/9876543", { query, fetcher });
  assert.equal(r.status, 200);
  assert.equal(r.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(r.headers["Cache-Control"], "no-store");
  const body = r.json;
  assert.deepEqual(Object.keys(body), ["person", "companies", "totals", "transactions", "filings", "other_issuers", "edgar_url", "source", "disclaimer"]);
  assert.deepEqual(body.person, { cik: "0009876543", name: "DOE JANE", filed_names: ["DOE JANE", "Doe Jane A"] });
  assert.deepEqual(body.companies, [
    { ticker: "EXMP", issuer_cik: "0000099999", issuer_name: "Example Corp", roles: ["Chief Executive Officer", "Director"],
      first_transaction_date: "2026-01-05T00:00:00.000Z", last_transaction_date: "2026-10-01T00:00:00.000Z", last_published_at: "2026-10-03T21:15:00.000Z",
      transactions: 3, purchases_value: 1000.5, sales_value: 0 },
    { ticker: null, issuer_cik: "0000088888", issuer_name: null, roles: [],
      first_transaction_date: "2026-01-05T00:00:00.000Z", last_transaction_date: "2026-10-01T00:00:00.000Z", last_published_at: "2025-01-02T12:00:00.000Z",
      transactions: 1, purchases_value: 0, sales_value: 250.75 }
  ]);
  assert.deepEqual(Object.keys(body.totals), ["all", "d30"]);
  for (const window of ["all", "d30"]) {
    const t = body.totals[window];
    assert.deepEqual(Object.keys(t), ["transactions", "superseded", "filings", "purchases", "sales", "other", "first_transaction_date", "last_transaction_date", "last_published_at"]);
    for (const v of [t.transactions, t.superseded, t.filings, t.purchases.count, t.purchases.shares, t.purchases.value, t.sales.count, t.sales.shares, t.sales.value, t.other.count])
      assert.equal(typeof v, "number", window);
  }
  assert.deepEqual(body.transactions, iso([line, restated]), "transaction rows are unchanged (NUMERIC stays as filed), superseded flagged");
  assert.equal(body.transactions[0].shares, "10.00000000");
  assert.deepEqual(body.transactions.map(x => x.superseded), [false, true]);
  assert.deepEqual(body.filings, [
    { accession: "000987654326000001", form_type: "4", ticker: "EXMP", issuer_cik: "0000099999", issuer_name: "Example Corp", published_at: "2026-10-03T21:15:00.000Z",
      source_url: "https://www.sec.gov/Archives/edgar/data/9876543/000987654326000001/", lines: 2 },
    { accession: "000987654325000009", form_type: "4/A", ticker: null, issuer_cik: null, issuer_name: "Example Corp", published_at: "2026-10-03T21:15:00.000Z",
      source_url: "https://www.sec.gov/Archives/edgar/data/9876543/000987654325000009/", lines: 1 }
  ]);
  assert.deepEqual(body.other_issuers, []);
  assert.equal(body.source, "SEC Form 4");
  assert.equal(body.disclaimer, "Public SEC records. Not a recommendation or a prediction.");
  assert.equal(body.disclaimer, DISCLAIMER);
});

test("roles come from the person's latest Form 4 at each issuer, with the same wording as ownerRole()", async () => {
  const issuers = ["0000011111", "0000022222", "0000033333", "0000044444", "0000055555"].map(c => issuerRow(c));
  issuers[4].latest_xml_url = "https://example.com/evil.xml"; // not an SEC Archives URL: never fetched
  const fetcher = stubFetcher({
    [XML("0000011111")]: ownershipXml({ issuer: "0000011111" }),
    // Joint filing: the person is the second owner, a 10% holder with no officer title.
    [XML("0000022222")]: ownershipXml({ issuer: "0000022222", owners: [{ cik: "0009999999", name: "FUND LP", tenPercent: 1 }, { cik: "9876543", name: "DOE JANE", tenPercent: 1, officer: 1 }] }),
    [XML("0000033333")]: ownershipXml({ issuer: "0000033333", owners: [{ cik: "0009999999", name: "SOMEONE ELSE", director: 1 }] }),
    [XML("0000044444")]: new Error("SEC responded 503")
  });
  const query = fakeQuery(fullAnswers(issuers));
  const r = await call("/v1/people/9876543", { query, fetcher });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.companies.map(c => c.roles), [["Chief Executive Officer", "Director"], ["Officer", "10% owner"], [], [], []]);
  assert.deepEqual(fetcher.calls, [XML("0000011111"), XML("0000022222"), XML("0000033333"), XML("0000044444")]);
  // rolesOf() is ownerRole() as a list.
  const owners = [
    { isOfficer: true, officerTitle: "EVP,  Chief Financial  Officer", isDirector: false, isTenPercentOwner: false },
    { isOfficer: true, officerTitle: null, isDirector: true, isTenPercentOwner: true },
    { isOfficer: false, isDirector: false, isTenPercentOwner: false, otherText: "Member of 13(d) group" },
    { isOfficer: false, isDirector: true, isTenPercentOwner: false, otherText: "ignored when a box is ticked" }
  ];
  for (const owner of owners) assert.equal(rolesOf(owner).join(" · "), ownerRole(owner));
  assert.deepEqual(rolesOf(owners[0]), ["EVP, Chief Financial Officer"]);
  assert.deepEqual(rolesOf({ isOfficer: false, isDirector: false, isTenPercentOwner: false }), []);
  assert.deepEqual(rolesOf(null), []);
});

test("roles are bounded: 8 issuers at most (null past them: not looked up), one cached document each, failures and slow documents give []", async () => {
  const issuers = Array.from({ length: 12 }, (_, i) => issuerRow(String(10000 + i).padStart(10, "0")));
  const byUrl = Object.fromEntries(issuers.map(row => [row.latest_xml_url, ownershipXml({ issuer: row.issuer_cik, owners: [{ cik: "0009876543", name: "DOE JANE", director: 1 }] })]));
  const fetcher = stubFetcher(byUrl);
  const documents = createSecCache(50);
  const query = fakeQuery(fullAnswers(issuers));
  // With an allowance larger than 8, still only the 8 most recent issuers are read.
  let r = await call("/v1/people/9876543", { query, fetcher, documents, secBudget: generous() });
  assert.deepEqual(r.json.companies.map(c => c.roles && c.roles.join()), [...Array(MAX_ROLE_ISSUERS).fill("Director"), null, null, null, null]);
  assert.equal(fetcher.calls.length, MAX_ROLE_ISSUERS);
  assert.equal(new Set(fetcher.calls).size, MAX_ROLE_ISSUERS);
  // A second view of the same person reuses every parsed document, even with no allowance left.
  r = await call("/v1/people/0009876543", { query, fetcher, documents, secBudget: createSecBudget({ perProfile: { documents: 0, ownerPages: 0 } }) });
  assert.deepEqual(r.json.companies.slice(0, MAX_ROLE_ISSUERS).map(c => c.roles[0]), Array(MAX_ROLE_ISSUERS).fill("Director"));
  assert.equal(fetcher.calls.length, MAX_ROLE_ISSUERS, "each document is fetched once");

  // A document that never arrives: roles [] once the budget is spent, the profile is not held up.
  const slow = stubFetcher({ [XML("0000011111")]: "hang", [XML("0000022222")]: ownershipXml({ issuer: "0000022222" }) });
  const started = Date.now();
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers([issuerRow("0000011111"), issuerRow("0000022222")])), fetcher: slow, budgets: { roles: 60 } });
  assert.equal(r.status, 200);
  assert.ok(Date.now() - started < 1500, "answered within the budget");
  assert.deepEqual(r.json.companies.map(c => c.roles), [[], ["Chief Executive Officer", "Director"]]);
  // Not XML at all.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), fetcher: stubFetcher({ [XML("0000099999")]: "<html>maintenance</html>" }) });
  assert.deepEqual(r.json.companies[0].roles, []);
});

test("SEC work: per profile, per member and route-wide allowances; cached lookups are free; unused allowance is given back", async () => {
  const people = Array.from({ length: 61 }, (_, i) => String(3000000 + i));
  // Every person has 10 issuers with a stored ownership XML (a fund or a multi-board director).
  const rowsFor = cik => Array.from({ length: 10 }, (_, i) => issuerRow(String(5000 + i).padStart(10, "0"),
    { latest_xml_url: `https://www.sec.gov/Archives/edgar/data/${cik}/${String(i).padStart(18, "0")}/form4.xml` }));
  const query = fakeQuery({ [COMPANIES_SQL]: params => ({ rows: rowsFor(params[0][0]) }), [NAMES_SQL]: params => ({ rows: [nameRow("X", params[0][1])] }) });
  let pages = 0;
  const fetcher = stubFetcher(), ownerIssuers = async () => { pages++; return []; };
  const budget = createSecBudget();
  const documents = createSecCache(5000), ownerPages = createSecCache(5000);
  const member = { query, fetcher, ownerIssuers, documents, ownerPages, secBudget: budget, requireUser: async () => ({ id: "member-1" }) };
  const statuses = [];
  for (const cik of people) {
    const before = fetcher.calls.length;
    const r = await call("/v1/people/" + cik, member);
    statuses.push(r.status);
    assert.ok(fetcher.calls.length - before <= SEC_PER_PROFILE.documents, "at most " + SEC_PER_PROFILE.documents + " new documents per profile");
  }
  assert.equal(statuses.filter(s => s === 200).length, PROFILES_PER_MINUTE);
  assert.equal(statuses.at(-1), 429);
  assert.equal(fetcher.calls.length, SEC_ALLOWANCE.documents, "one member starts at most the document allowance");
  assert.equal(pages, SEC_ALLOWANCE.ownerPages, "and at most the owner-page allowance");
  const again = await call("/v1/people/" + people[0], { ...member, requireUser: async () => ({ id: "member-1" }) });
  assert.equal(again.status, 429, "the profile rate limit still applies");
  const otherMember = await call("/v1/people/" + people[0], { ...member, requireUser: async () => ({ id: "member-2" }) });
  assert.equal(otherMember.status, 200);
  assert.equal(fetcher.calls.length, SEC_ALLOWANCE.documents + SEC_PER_PROFILE.documents, "member 2 joins the cached documents and starts only new ones");

  // Route-wide: many members together never start more than SEC_ROUTE_PER_MINUTE requests a minute.
  const shared = createSecBudget(), crowdFetcher = stubFetcher();
  let crowdPages = 0;
  for (let i = 0; i < 40; i++) {
    await call("/v1/people/" + people[i], { query, fetcher: crowdFetcher, ownerIssuers: async () => { crowdPages++; return []; },
      documents: createSecCache(), ownerPages: createSecCache(), secBudget: shared, requester: "crowd:" + i });
  }
  assert.equal(crowdFetcher.calls.length + crowdPages, SEC_ROUTE_PER_MINUTE);

  // Unused allowance is given back: a 404 uses nothing; a one-issuer profile uses one document.
  const small = createSecBudget({ perProfile: { documents: 4, ownerPages: 1 }, perMember: { documents: 5, ownerPages: 2 } });
  const one = fakeQuery({ [COMPANIES_SQL]: { rows: [issuerRow("0000099999")] } });
  const f2 = stubFetcher({ [XML("0000099999")]: ownershipXml() });
  for (let i = 0; i < 3; i++) await call("/v1/people/7" + i, { query: fakeQuery(), secBudget: small, requester: "giver" });
  const kept = await call("/v1/people/9876543", { query: one, fetcher: f2, secBudget: small, requester: "giver" });
  assert.deepEqual(kept.json.companies[0].roles, ["Chief Executive Officer", "Director"]);
  const reservation = small.reserve("giver");
  assert.deepEqual(reservation.grant, { documents: 4, ownerPages: 1 }, "5 - 1 used = 4 documents and 2 - 1 used = 1 owner page are left");
  reservation.release({ documents: 0, ownerPages: 0 });
});

test("SEC work: nothing new is started while the shared SEC queue is long", async () => {
  const fetcher = stubFetcher({ [XML("0000099999")]: ownershipXml() });
  let pages = 0;
  const documents = createSecCache();
  const busy = () => SEC_QUEUE_LIMIT_MS + 1;
  let r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), fetcher, documents, ownerIssuers: async () => { pages++; return []; }, secBacklogMs: busy });
  assert.deepEqual([r.status, r.json.companies[0].roles, fetcher.calls.length, pages], [200, [], 0, 0]);
  // Once the queue is short, the lookup runs; later views are served from the cache even when busy.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), fetcher, documents, secBacklogMs: () => 0 });
  assert.deepEqual(r.json.companies[0].roles, ["Chief Executive Officer", "Director"]);
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), fetcher, documents, secBacklogMs: busy });
  assert.deepEqual([r.json.companies[0].roles, fetcher.calls.length], [["Chief Executive Officer", "Director"], 1]);
  // A probe that throws counts as an empty queue.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), fetcher: stubFetcher({ [XML("0000099999")]: ownershipXml() }), secBacklogMs: () => { throw new Error("x"); } });
  assert.deepEqual(r.json.companies[0].roles, ["Chief Executive Officer", "Director"]);
});

test("other_issuers: EDGAR's owner page minus imported issuers, tickers from the SEC file, bounded by a timeout", async () => {
  const listed = [
    { cik: "0000099999", name: "Example Corp", lastDate: "2026-10-01", relation: "officer: Chief Executive Officer" }, // imported: dropped
    { cik: "0000077777", name: "Other Board Inc.", lastDate: "2024-05-01", relation: "director" },
    { cik: "0000066666", name: "Private Holdings & Co", lastDate: null, relation: "" }
  ];
  const asked = [];
  const ownerIssuers = async (cik, opts) => { asked.push([cik, typeof opts.fetcher]); return listed; };
  const tickerIndex = async () => ({ 0: { cik_str: 77777, ticker: "OTHB", title: "Other Board Inc." }, 1: { cik_str: 77777, ticker: "OTHB-P", title: "Other Board Inc." } });
  const ownerPages = createSecCache();
  let r = await call("/v1/people/0009876543", { query: fakeQuery(fullAnswers()), ownerIssuers, tickerIndex, ownerPages });
  assert.equal(r.status, 200);
  assert.deepEqual(asked, [["9876543", "function"]]);
  assert.deepEqual(r.json.other_issuers, [
    { cik: "0000077777", name: "Other Board Inc.", ticker: "OTHB", relation: "director", last_transaction_date: "2024-05-01" },
    { cik: "0000066666", name: "Private Holdings & Co", ticker: null, relation: null, last_transaction_date: null }
  ]);
  // Cached for the next view: no new owner-page request, even with no allowance left.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers, tickerIndex, ownerPages, secBudget: createSecBudget({ perProfile: { documents: 0, ownerPages: 0 } }) });
  assert.equal(r.json.other_issuers.length, 2);
  assert.equal(asked.length, 1);
  // No allowance and nothing cached: [] without asking.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers, tickerIndex, secBudget: createSecBudget({ perProfile: { documents: 0, ownerPages: 0 } }) });
  assert.deepEqual([r.json.other_issuers, asked.length], [[], 1]);
  // Failure -> [].
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers: async () => { throw new Error("SEC responded 503"); } });
  assert.deepEqual([r.status, r.json.other_issuers], [200, []]);
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers: () => { throw new Error("sync failure"); } });
  assert.deepEqual([r.status, r.json.other_issuers], [200, []]);
  // Timeout -> [] after the budget, never a stalled profile; a slow ticker file only drops tickers.
  const started = Date.now();
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers: () => new Promise(() => {}), budgets: { otherIssuers: 60 } });
  assert.deepEqual([r.status, r.json.other_issuers], [200, []]);
  assert.ok(Date.now() - started < 1500, "answered within the budget");
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers, tickerIndex: () => new Promise(() => {}), budgets: { otherIssuers: 60 } });
  assert.deepEqual(r.json.other_issuers.map(x => x.ticker), [null, null]);
  // A ticker file that throws only drops tickers, never the list.
  r = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), ownerIssuers, tickerIndex: () => { throw new Error("bad index"); } });
  assert.deepEqual(r.json.other_issuers.map(x => [x.cik, x.ticker]), [["0000077777", null], ["0000066666", null]]);
});

test("joint filings: with sec_filing_owners the joint statements run, roles are read from it, and the 404 is plain", async () => {
  const jointRow = issuerRow("0000044444", { ticker: "JNTC", role_on_file: true, role_director: true, role_officer: true, role_officer_title: "Chief  Executive Officer",
    role_ten_percent_owner: false, role_other_text: null });
  const fileOnly = issuerRow("0000033333", { ticker: "SOLO", role_on_file: false, role_director: null, role_officer: null });
  const answers = {
    [OWNERS_TABLE_SQL]: { rows: [{ present: true }] },
    [SQL.joint.companies]: { rows: [jointRow, fileOnly] }, [SQL.joint.names]: { rows: [nameRow("SMITH BOB", "0003333333")] },
    [SQL.joint.transactions]: { rows: [txRow("000222222226000001:N:0", { owner_cik: null, owner_name: "FUND LP, SMITH BOB" }), txRow("000333333326000001:N:0", { owner_cik: "0003333333", owner_name: "SMITH BOB" }),
      txRow("000222222226000001:N:1", { owner_cik: null, owner_name: "FUND LP, SMITH BOB" })] }, [SQL.joint.filings]: { rows: [] },
    [JOINT_OWNERS_SQL]: { rows: [{ accession: "000222222226000001", owner_cik: "0005555555", owner_name: "FUND LP" }, { accession: "000222222226000001", owner_cik: "0003333333", owner_name: "SMITH BOB" }] }
  };
  const query = fakeQuery(answers);
  const fetcher = stubFetcher({ [XML("0000033333")]: ownershipXml({ issuer: "0000033333", owners: [{ cik: "3333333", name: "SMITH BOB", tenPercent: 1 }] }) });
  const r = await call("/v1/people/3333333", { query, fetcher });
  assert.equal(r.status, 200);
  assert.deepEqual(query.statements.map(s => s.sql), [OWNERS_TABLE_SQL, SQL.joint.companies, SQL.joint.names, SQL.joint.transactions, JOINT_OWNERS_SQL, SQL.joint.filings],
    "one owners read for every joint line shown, never one per line");
  assert.deepEqual(query.statements[4].params, [["000222222226000001"]], "only the joint lines' accessions, once each");
  assert.deepEqual(r.json.person, { cik: "0003333333", name: "SMITH BOB", filed_names: ["SMITH BOB"] });
  assert.deepEqual(r.json.companies.map(c => [c.ticker, c.roles]), [["JNTC", ["Chief Executive Officer", "Director"]], ["SOLO", ["10% owner"]]]);
  assert.deepEqual(fetcher.calls, [XML("0000033333")], "stored roles need no SEC request; the issuer without a row falls back to its XML");
  assert.equal(r.json.transactions[0].owner_cik, null, "a joint line is listed as filed");
  // Every reporting owner of a joint line, as filed and in filing order (this person included), so person.js links each co-filer.
  const owners = [{ cik: "0005555555", name: "FUND LP" }, { cik: "0003333333", name: "SMITH BOB" }];
  assert.deepEqual([r.json.transactions[0].owners, r.json.transactions[2].owners], [owners, owners]);
  assert.equal("owners" in r.json.transactions[1], false, "a line filed alone has its own owner_cik and no owners list");
  const missing = await call("/v1/people/7654321", { query: fakeQuery({ [OWNERS_TABLE_SQL]: { rows: [{ present: true }] } }) });
  assert.deepEqual(missing, { status: 404, error: NOT_FOUND });
  // A failing catalogue check means "absent" for that request, never a failed profile ...
  const flaky = fakeQuery(fullAnswers([issuerRow("0000099999")], { [OWNERS_TABLE_SQL]: new Error("connection terminated") }));
  const r2 = await call("/v1/people/9876543", { query: flaky });
  assert.equal(r2.status, 200);
  assert.deepEqual(flaky.statements.map(s => s.sql), STATEMENTS, "single-owner statements; no owners read without the table");
  // ... and is not remembered: the next request asks again, and an answer then is kept.
  let up = false;
  const recovering = fakeQuery(fullAnswers([issuerRow("0000099999")], { [OWNERS_TABLE_SQL]: () => { if (!up) throw new Error("connection terminated"); return { rows: [{ present: true }] }; } }));
  assert.equal(await hasFilingOwners(recovering), false);
  up = true;
  assert.equal(await hasFilingOwners(recovering), true, "asked again after a failure");
  up = false;
  assert.equal(await hasFilingOwners(recovering), true, "a successful answer is kept");
  assert.equal(recovering.statements.filter(s => s.sql === OWNERS_TABLE_SQL).length, 2);
});

test("withJointOwners: one read for every joint line, owners in filing order, nothing without the table or joint lines", async () => {
  const rows = () => [{ accession: "a1", owner_cik: null }, { accession: "a1", owner_cik: null }, { accession: "a2", owner_cik: "0000000001" }, { accession: "a3", owner_cik: null }, null, { owner_cik: null }];
  const query = fakeQuery({ [JOINT_OWNERS_SQL]: { rows: [{ accession: "a1", owner_cik: "0000000009", owner_name: "B FUND" }, { accession: "a1", owner_cik: "0000000008", owner_name: "A PERSON" }] } });
  const out = await withJointOwners(rows(), query, true);
  assert.deepEqual(query.statements, [{ sql: JOINT_OWNERS_SQL, params: [["a1", "a3"]] }]);
  assert.deepEqual(out[0].owners, [{ cik: "0000000009", name: "B FUND" }, { cik: "0000000008", name: "A PERSON" }]);
  assert.notEqual(out[0].owners, out[1].owners, "each line gets its own copy");
  assert.equal("owners" in out[2], false);
  assert.equal("owners" in out[3], false, "a joint line whose owners are not on record is left as filed");
  assert.match(flat(JOINT_OWNERS_SQL), /ORDER BY o\.accession,array_position\(f\.owner_names,o\.owner_name\) NULLS LAST,o\.owner_cik$/);
  const none = fakeQuery();
  await withJointOwners(rows(), none, false);
  await withJointOwners([{ accession: "a2", owner_cik: "1" }], none, true);
  assert.equal(none.statements.length, 0, "no table, or no joint line: no query");
});

test("a heavy filer's SQL is kept for a short time; an ordinary profile is read fresh each time", async () => {
  const heavy = fakeQuery(fullAnswers([issuerRow("0000099999", { transactions: HEAVY_LINES - 5, superseded: 5 })]));
  for (let i = 0; i < 3; i++) assert.equal((await call("/v1/people/9876543", { query: heavy })).status, 200);
  assert.deepEqual(heavy.statements.map(s => s.sql), STATEMENTS, "one read, then two views from memory");
  const other = await call("/v1/people/9876543?limit=5", { query: heavy });
  assert.equal(other.status, 200);
  assert.equal(heavy.statements.length, STATEMENTS.length + 4, "a different limit is a different read");
  const light = fakeQuery(fullAnswers());
  for (let i = 0; i < 2; i++) await call("/v1/people/9876543", { query: light });
  assert.equal(light.statements.length, STATEMENTS.length + 4);
});

test("with the real SEC fetcher and no SEC_USER_AGENT, no SEC request is attempted", { skip: secReady() ? "SEC_USER_AGENT is set" : false }, async () => {
  let asked = 0;
  const body = await personProfile("9876543", { query: fakeQuery(fullAnswers()), ownerIssuers: async () => { asked++; return []; } });
  assert.deepEqual(body.companies[0].roles, []);
  assert.deepEqual(body.other_issuers, []);
  assert.equal(asked, 0);
});

test("rate limit: 60 profiles a minute per member, refused before the database", async () => {
  const query = fakeQuery();
  const deps = { query, requester: "user:burst" };
  for (let i = 0; i < PROFILES_PER_MINUTE; i++) assert.equal((await call("/v1/people/" + (1000 + i), deps)).status, 404, "attempt " + i);
  const before = query.statements.length;
  assert.deepEqual(await call("/v1/people/9876543", deps), { status: 429, error: "Too many profile requests. Try again shortly." });
  assert.equal(query.statements.length, before);
  assert.equal((await call("/v1/people/9876543", { query: fakeQuery(fullAnswers()), requester: "user:calm" })).status, 200, "other members are unaffected");
  // The signed-in member's id is the key when requireUser is given.
  const user = { id: "u-limit" };
  for (let i = 0; i < PROFILES_PER_MINUTE; i++) await call("/v1/people/1", { query, requireUser: async () => user, requester: "ignored:" + i });
  assert.equal((await call("/v1/people/1", { query, requireUser: async () => user, requester: "ignored:x" })).status, 429);
});

test("a database failure propagates (api.mjs answers 500 Internal error)", async () => {
  const r = await call("/v1/people/9876543", { query: fakeQuery({ [COMPANIES_SQL]: new Error("connection refused") }) });
  assert.deepEqual(r, { status: 500, error: "connection refused" });
  const later = await call("/v1/people/9876543", { query: fakeQuery(fullAnswers([issuerRow("0000099999")], { [FILINGS_SQL]: new Error("timeout") })) });
  assert.equal(later.status, 500);
});

test("over HTTP: JSON body on GET, headers only on HEAD", async () => {
  const deps = { query: fakeQuery(fullAnswers()), ownerIssuers: noIssuers, tickerIndex: null, fetcher: stubFetcher(), requester: "http", secBudget: createSecBudget() };
  const server = createServer((req, res) => {
    handlePersonRoute(req, res, new URL(req.url, "http://localhost"), deps).then(handled => {
      if (handled === false) { res.writeHead(404); res.end(); }
    }, error => { res.writeHead(error.status || 500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: error.message })); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const send = (method, path) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method }, res => { let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text })); });
    req.on("error", reject); req.end();
  });
  try {
    const get = await send("GET", "/v1/people/9876543?limit=5");
    assert.equal(get.status, 200);
    assert.equal(get.headers["x-content-type-options"], "nosniff");
    assert.equal(JSON.parse(get.text).person.name, "DOE JANE");
    const head = await send("HEAD", "/v1/people/9876543");
    assert.deepEqual([head.status, head.text], [200, ""]);
    assert.equal((await send("GET", "/v1/people/x")).status, 400);
  } finally { server.close(); }
});

/* The SQL itself, on PostgreSQL: set INSIDIR_TEST_DATABASE_URL to a database this test may use. It
 * works only inside its own schema (created and dropped here), so no existing table is touched. */
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
test("on PostgreSQL: an original Form 4 line and the identical 4/A line count once", { skip: PG_URL ? false : "INSIDIR_TEST_DATABASE_URL is not set" }, async () => {
  const { default: pg } = await import("pg");
  const schema = "person_profile_test_" + process.pid;
  const pool = new pg.Pool({ connectionString: PG_URL, max: 1, options: "-c search_path=" + schema });
  const query = (sql, params = []) => pool.query(sql, params);
  try {
    await query(`CREATE SCHEMA ${schema}`);
    await query(await readFile(new URL("../sql/001_initial.sql", import.meta.url), "utf8"));
    const day = n => new Date(Date.now() - n * 86400000).toISOString();
    const filing = (acc, issuer, days, form) => query(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,is_amendment,source_url,ingest_status)
      VALUES($1,'1111111',$2,'Example Corp','EXMP','4',$3,$4,$5,$6,'parsed')`, [acc, issuer, form, day(days), form === "4/A", "https://www.sec.gov/Archives/edgar/data/1111111/" + acc + "/"]);
    const line = (acc, issuer, owner) => query(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,source_url)
      VALUES($1,$2,$3,'EXMP',$4,'DOE JOHN',$5,'S','D','reported_sale',false,1000,50,50000,'https://www.sec.gov/')`, [acc + ":N:0", acc, issuer, owner, day(42).slice(0, 10)]);
    // One sale of 1,000 shares at $50, filed 40 days ago and repeated line for line on a 4/A 5 days ago.
    await filing("000111111126000001", "0000099999", 40, "4");
    await line("000111111126000001", "0000099999", "0001111111");
    await filing("000111111126000002", "0000099999", 5, "4/A");
    await line("000111111126000002", "99999", "1111111");
    const body = await personProfile("1111111", { query, fetcher: async () => { throw new Error("offline"); }, ownerIssuers: noIssuers, tickerIndex: null, limit: 500 });
    assert.deepEqual(body.totals.all.sales, { count: 1, shares: 1000, value: 50000 });
    assert.equal(body.totals.all.transactions, 1);
    assert.equal(body.totals.all.superseded, 1);
    assert.equal(body.totals.all.filings, 2);
    assert.deepEqual([body.companies[0].transactions, body.companies[0].sales_value], [1, 50000]);
    // First filed 40 days ago: the 4/A does not bring the trade into the last 30 days.
    assert.deepEqual(body.totals.d30.sales, { count: 0, shares: 0, value: 0 });
    assert.equal(body.totals.d30.filings, 1);
    assert.deepEqual(body.transactions.map(x => [x.accession, x.superseded]), [["000111111126000002", false], ["000111111126000001", true]]);
  } finally {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
  }
});

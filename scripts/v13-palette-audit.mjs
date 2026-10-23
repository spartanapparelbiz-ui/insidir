/* Insidir V13 palette audit: open every page in headless Chromium and report any computed
   colour that is not a blend of the two identity colours (#0c0c0b paper, #f0eee8 ink) or one of
   the two direction colours over the paper (#2f996a up, #f94144 down). Orange is retired: a colour
   that needs any of the old warm accent (#e9762b) beyond --warm-tolerance (default 0.025 of the
   way from paper to orange) to be explained is an off-palette leak, and leaks that read as orange
   are marked ORANGE. The audit also reports:
     - any orange glow (a shadow, filter, gradient or gradient-filled chart carrying a warm tint, or
       an orange pixel on the landing wordmark while the pointer pushes its dots);
     - orange in any interactive state: every visible link, button, summary, tab, label, field and
       [data-hf-atom] (up to --state-cap, default 200, per page) is forced through :hover,
       :focus/:focus-visible and :active with the DevTools protocol (CSS.forcePseudoState, the
       ancestors hovered/active too, transitions finished) and its text, background, border,
       outline, decoration, fill, stroke, shadow, accent colours and ::before/::after/::marker are
       read, also for its descendants; the same again for menu items once the menus are open;
     - orange pixels on screen: viewport screenshots at the top, middle and bottom of the page (and
       with the menus open, text glyphs made transparent for the capture because their colour is read
       exactly above) are searched for clusters of orange pixels, ignoring real photographs
       and company logos (<img>, <picture>, <video>), and each cluster names the element under it;
     - any serif or unexpected font family on visible text, horizontal overflow, uncaught browser
       errors, text whose WCAG contrast against its background falls below 4.5:1 (3:1 for large
       text), raster images that are not retina-sharp (native pixels must be at least twice the
       rendered size), a landing hero whose halftone wordmark did not draw, a dotted wordmark on
       any other page, and a missing plain footer.
   It prints one summary line per page render, the findings under it, and a final CLEAN line or the
   number of findings; it exits non-zero on any finding unless --no-fail is given.

   Usage: node scripts/v13-palette-audit.mjs [--pages index,dashboard,...] [--widths 1440,390]
            [--json out.json] [--shots dir] [--no-fail] [--no-menus] [--no-states] [--no-pixels]
            [--tolerance 5] [--warm-tolerance 0.025] [--state-cap 200]
            [--inject-css "<css>"] [--inject-js "<js>"]
   --inject-css adds rules to the insidir-v13 layer of every page and --inject-js runs a script at
   document start; both exist only to prove that the audit fails when something orange is added.
   The /v1 API is mocked with small fixtures so every page renders its data states: the personnel file
   (person) from a /v1/people/1214156 mock in the shape src/person-profile.mjs answers, and a CIK with no
   file (person-404) from its 404. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = name => args.includes("--" + name);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
// `warm` is not part of the palette any more: it is the direction the audit hunts for (the retired orange accent).
const PALETTE = { bg: [12, 12, 11], ink: [240, 238, 232], warm: [233, 118, 43], up: [47, 153, 106], down: [249, 65, 68] };
const TOL = Number(opt("tolerance", 5));
const WARM_TOL = Number(opt("warm-tolerance", 0.025)); // paper/ink tokens need at most 0.006 of it
const STATE_CAP = Number(opt("state-cap", 200));
const INJECT_CSS = opt("inject-css", ""), INJECT_JS = opt("inject-js", "");
const widths = opt("widths", "1440,390").split(",").map(Number);
const ALL_PAGES = [
  ["index", "/"], ["signin", "/signin.html"], ["signup", "/signup.html"], ["dashboard", "/dashboard.html"],
  ["research", "/research.html?ticker=AAPL"], ["explore", "/explore.html"], ["filings", "/filings.html"], ["filing", "/filing.html?accession=0000320193-26-000001"],
  ["watchlist", "/watchlist.html"], ["portfolio", "/portfolio.html"], ["alerts", "/alerts.html"], ["people", "/people.html"],
  ["account", "/account.html"], ["billing", "/billing.html"], ["company", "/company.html?ticker=AAPL"], ["company-picker", "/company.html"],
  ["pricing", "/pricing.html"], ["company-info", "/company-info.html"], ["terms", "/terms.html"], ["privacy", "/privacy.html"], ["404", "/no-such-page"],
  ["platform", "/platform.html"], ["why-insidir", "/why-insidir.html"], ["data", "/data.html"], ["subscribe", "/subscribe.html"], ["account-deleted", "/account-deleted.html"],
  ["person", "/person.html?cik=1214156"], ["person-404", "/person.html?cik=999"], ["entity", "/entity.html?cik=1081316"],
  ["stories", "/stories.html"], ["story", "/stories/enterprise-products-insider-purchase.html"], ["creator-kit", "/creator-kit.html"], ["creators", "/creators.html"],
  ["forgot-password", "/forgot-password.html"], ["reset-password", "/reset-password.html#token=" + "a".repeat(64)], ["verify-email", "/verify-email.html#token=" + "b".repeat(64)], ["ops", "/ops.html"], ["intelligence", "/intelligence.html?q=What%20did%20Nvidia%20insiders%20disclose%20this%20month%3F"], ["intelligence-empty", "/intelligence.html#empty"], ["admin-costs", "/admin-costs.html"]
];
const wanted = opt("pages", "").split(",").filter(Boolean);
// Pages rebuilt on ui.css (the landing page, Today, Alerts, the ticker page) follow the new design system, not V13:
// scripts/visual-layout-check.mjs and scripts/a11y-check.mjs check them with real data.
const REBUILT = new Set(["index", "dashboard", "alerts", "company", "company-picker", "signin", "signup"]);
const pages = (wanted.length ? ALL_PAGES.filter(([k]) => wanted.includes(k)) : ALL_PAGES).filter(([k]) => !REBUILT.has(k));

/* ---------- API fixtures (mock only; production reads the real routes) ---------- */
const source = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
const records = end => ["2021", "2022", "2023", "2024", "2025"].map((y, i) => ({ periodEnd: y + "-12-31", start: y + "-01-01", value: end(i), filedAt: (Number(y) + 1) + "-02-01", form: "10-K", sourceUrl: source }));
const ttmRow = (value, unit = "USD") => ({ value, unit, periodStart: "2025-07-01", periodEnd: "2026-06-30", basis: "ttm", sources: [source] });
const day = 86400000, start = Date.UTC(2025, 9, 14, 20);
const series = (n, stepMs, base) => Array.from({ length: n }, (_, i) => [start + i * stepMs, Math.round((base + i * .4 + Math.sin(i / 5) * 3) * 100) / 100]);
const filingItems = [
  { id: 1, accession: "0000320193-26-000001", ticker: "AAPL", issuer_name: "Apple Inc.", form_type: "4", published_at: "2026-09-14T20:00:00Z", source_url: source, is_amendment: false, created_at: "2026-09-14T21:00:00Z", reporting_owner: "COOK TIMOTHY D", transactions: [] },
  { id: 2, accession: "0001045810-26-000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", form_type: "4", published_at: "2026-09-12T20:00:00Z", source_url: source, is_amendment: false, created_at: "2026-09-12T21:00:00Z", reporting_owner: "HUANG JEN HSUN", transactions: [] },
  { id: 3, accession: "0000789019-26-000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", form_type: "4/A", published_at: "2026-09-10T20:00:00Z", source_url: source, is_amendment: true, created_at: "2026-09-10T21:00:00Z", reporting_owner: "NADELLA SATYA", transactions: [] }
];
const transactionItems = [
  { id: 11, accession: "0000320193-26-000001", ticker: "AAPL", issuer_name: "Apple Inc.", owner_name: "COOK TIMOTHY D", owner_cik: "0001214156", transaction_date: "2026-09-12", transaction_code: "S", category: "reported_sale", shares: 12500, price: 26, estimated_value: 325000, published_at: "2026-09-14T20:00:00Z", source_url: source, filed_at: "2026-09-14" },
  { id: 12, accession: "0001045810-26-000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", owner_name: "HUANG JEN HSUN", owner_cik: "0001049502", transaction_date: "2026-09-10", transaction_code: "P", category: "reported_purchase", shares: 1500, price: 28, estimated_value: 42000, published_at: "2026-09-12T20:00:00Z", source_url: source, filed_at: "2026-09-12" },
  { id: 13, accession: "0000789019-26-000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", owner_name: "NADELLA SATYA", owner_cik: "0001513142", transaction_date: "2026-09-08", transaction_code: "A", category: "reported_other", shares: 900, price: null, estimated_value: null, published_at: "2026-09-10T20:00:00Z", source_url: source, filed_at: "2026-09-10" }
];
/* GET /v1/people/<cik>: Tim Cook's personnel file in the shape src/person-profile.mjs answers (personProfile()), with
   dates relative to the run so the 30-day record is never empty: Apple sales and an RSU conversion, Nike director grants
   and a purchase, a line a later Form 4/A repeats (superseded: listed, counted once), a joint filing (owner_cik null)
   at an issuer with no ticker and roles not looked up (null). Any other CIK answers 404 as the engine does. */
const PERSON = { cik: "0001214156", name: "COOK TIMOTHY D" };
const PERSON_NOT_FOUND = "Reporting person not found in imported SEC records";
function personFile() {
  const DAY = 86400000, now = Date.now();
  const tradeDay = ago => new Date(now - ago * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const filedAt = ago => new Date(now - ago * DAY).toISOString().slice(0, 10) + "T22:30:00.000Z";
  const doc = (issuer, acc) => "https://www.sec.gov/Archives/edgar/data/" + Number(issuer) + "/" + acc.replace(/-/g, "") + "/xslF345X05/wk-form4.xml";
  const AAPL = ["AAPL", "0000320193", "Apple Inc."], NKE = ["NKE", "0000320187", "NIKE, Inc."], PRIV = [null, "0001999999", "PRIVATE HOLDINGS TRUST CO"];
  const ROLES = { "0000320193": ["Chief Executive Officer", "Director"], "0000320187": ["Director"], "0001999999": null };
  // [accession, issuer, filed days ago, 4/A, lines: [code, A/D, shares, price, traded days ago, derivative, security, ownership], joint owners]
  const FILED = [
    ["0000320193-26-000063", AAPL, 4, false, [["S", "D", "18000", "227.4", 6], ["S", "D", "4116.5", "229.8812", 6]]],
    ["0000320187-26-000070", NKE, 12, false, [["P", "A", "10000", "72.415", 14]]],
    ["0000320193-26-000059", AAPL, 38, true, [["F", "D", "100348", "223.19", 42]]],
    ["0000320193-26-000058", AAPL, 40, false, [["M", "D", "196410", null, 42, true, "Restricted Stock Unit"], ["M", "A", "196410", null, 42], ["F", "D", "100348", "223.19", 42]]],
    ["0000320187-26-000044", NKE, 90, false, [["A", "A", "3107", null, 92], ["A", "A", "412", null, 92]]],
    ["0001999999-26-000012", PRIV, 150, false, [["G", "D", "10000", null, 152, false, "Common Stock", "I"]], "COOK TIMOTHY D, WILLIAMS JEFFREY E"]
  ];
  const tx = [], filings = [];
  for (const [accession, [ticker, issuer_cik, issuer_name], ago, amend, lines, joint] of FILED) {
    const published_at = filedAt(ago), source_url = doc(issuer_cik, accession);
    for (const [code, ad, shares, price, traded, derivative = false, security_title = "Common Stock", own = "D"] of lines) {
      const category = !derivative && code === "P" && ad === "A" ? "reported_purchase" : !derivative && code === "S" && ad === "D" ? "reported_sale" : "other";
      tx.push({ id: String(tx.length + 1), accession, ticker, issuer_cik, issuer_name, owner_cik: joint ? null : PERSON.cik, owner_name: joint || PERSON.name,
        transaction_date: tradeDay(traded), transaction_code: code, acquired_disposed: ad, category, derivative, shares, price_per_share: price,
        estimated_value: price === null ? null : (Number(shares) * Number(price)).toFixed(2), direct_ownership: own, security_title, source_url,
        created_at: published_at, published_at, is_amendment: amend, superseded: false });
    }
    filings.push({ accession, form_type: amend ? "4/A" : "4", ticker, issuer_cik, issuer_name, published_at, source_url, lines: lines.length });
  }
  // As the API marks it: a line a later 4/A repeats (issuer, trade date, code, A/D, derivative, shares) is superseded.
  const same = x => [x.issuer_cik, x.transaction_date, x.transaction_code, x.acquired_disposed, x.derivative, x.shares].join("|");
  for (const x of tx) x.superseded = tx.some(y => y !== x && y.is_amendment && same(y) === same(x) && y.published_at > x.published_at);
  const sum = list => Math.round(list.reduce((a, v) => a + Number(v || 0), 0) * 100) / 100;
  const totals = rows => {
    const kept = rows.filter(x => !x.superseded), days = kept.map(x => x.transaction_date).sort();
    const part = cat => { const r = kept.filter(x => x.category === cat); return { count: r.length, shares: sum(r.map(x => x.shares)), value: sum(r.map(x => x.estimated_value)) }; };
    return { transactions: kept.length, superseded: rows.length - kept.length, filings: new Set(rows.map(x => x.accession)).size, purchases: part("reported_purchase"), sales: part("reported_sale"),
      other: { count: kept.filter(x => x.category === "other").length }, first_transaction_date: days[0] || null, last_transaction_date: days.at(-1) || null,
      last_published_at: rows.map(x => x.published_at).sort().at(-1) || null };
  };
  const companies = [...new Set(tx.map(x => x.issuer_cik))].map(issuer => {
    const all = tx.filter(x => x.issuer_cik === issuer), t = totals(all);
    return { ticker: all[0].ticker, issuer_cik: issuer, issuer_name: all[0].issuer_name, roles: ROLES[issuer], first_transaction_date: t.first_transaction_date, last_transaction_date: t.last_transaction_date,
      last_published_at: t.last_published_at, transactions: t.transactions, purchases_value: t.purchases.value, sales_value: t.sales.value };
  }).sort((a, b) => b.last_published_at.localeCompare(a.last_published_at));
  const order = (a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.published_at.localeCompare(a.published_at) || Number(b.id) - Number(a.id);
  return { person: { cik: PERSON.cik, name: PERSON.name, filed_names: [PERSON.name] }, companies,
    totals: { all: totals(tx), d30: totals(tx.filter(x => Date.parse(x.published_at) >= now - 30 * DAY)) },
    transactions: [...tx].sort(order), filings: filings.sort((a, b) => b.published_at.localeCompare(a.published_at)),
    other_issuers: [{ cik: "0001888888", name: "EXAMPLE BIOSCIENCES CORP", ticker: null, relation: "director", last_transaction_date: "2015-03-02" }],
    edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001214156&type=4&dateb=&owner=include&count=40",
    source: "SEC Form 4", disclaimer: "Public SEC records. Not a recommendation or a prediction." };
}
const insiderPeople = transactionItems.map(t => ({ owner_name: t.owner_name, owner_cik: t.owner_cik, ticker: t.ticker, issuer_name: t.issuer_name, filings: 3, transactions: 3, last_transaction_date: t.transaction_date, created_at: t.published_at }));
// fixture(url, method, from): the JSON body for a mocked /v1 request made by the page at path `from`, an
// answer(status, body) for a status other than 200, or null (answered 404 "not mocked").
const STATUS = Symbol("status");
const answer = (status, body) => ({ [STATUS]: status, body });
// A streamed (application/x-ndjson) response: one JSON object per line.
const NDJSON = Symbol("ndjson");
const ndjson = lines => ({ [NDJSON]: lines.map(l => JSON.stringify(l)).join("\n") + "\n" });
// Intelligence responses captured from a local server over synthetic QA records (scripts/fixtures).
const INTEL = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));
// Entity record, entity search and coverage captured from a local engine over real SEC EDGAR data.
const COVERAGE = JSON.parse(readFileSync(new URL("./fixtures/coverage-api.json", import.meta.url), "utf8"));
function intelligenceFixture(p, method, empty) {
  if (p === "/v1/me/intelligence/briefing") return empty ? { ...INTEL.briefing, stories: [], needsSetup: true, subjects: { tickers: 0, people: 0 } } : INTEL.briefing;
  if (p === "/v1/me/intelligence/investigate" && method === "POST") return ndjson([...INTEL.stream, { stage: "answer", answer: INTEL.answer }]);
  if (p === "/v1/me/intelligence/instrument") return INTEL.instrument;
  if (p === "/v1/intelligence/tape") return empty ? { ...INTEL.tape, events: [], nextBefore: null } : INTEL.tape;
  if (p === "/v1/intelligence/structure") return INTEL.structure;
  if (p === "/v1/me/intelligence/preferences") return { frequency: "daily", updatedAt: "2026-10-19T00:00:00Z" };
  if (p === "/v1/ai/status") return INTEL.aiStatus;
  if (p === "/v1/intelligence/mirror/managers") return empty ? { available: false, managers: [], reason: "Form 13F ingestion has not run yet on this deployment.", notes: INTEL.managers.notes } : INTEL.managers;
  if (p.startsWith("/v1/intelligence/mirror/managers/")) return INTEL.manager;
  if (p === "/v1/intelligence/mirror/simulate") return INTEL.simulate;
  if (p === "/v1/admin/costs") return answer(401, { error: "Administrator access required" });
  return undefined;
}
function fixture(url, method, from = "", hash = "") {
  if (from === "/intelligence.html" || from === "/admin-costs.html") { const r = intelligenceFixture(url.pathname, method, hash === "#empty"); if (r !== undefined) return r; }
  const ticker = url.searchParams.get("ticker") || "AAPL";
  const company = ticker === "MSFT" ? "MICROSOFT CORP" : ticker === "NVDA" ? "NVIDIA CORP" : "Apple Inc.";
  const p = url.pathname;
  if (/^\/v1\/people\/[^/]+$/.test(p)) return decodeURIComponent(p.slice(11)).replace(/^0+/, "") === "1214156" ? personFile() : answer(404, { error: PERSON_NOT_FOUND });
  // The personnel file starts unfollowed (Follow +); the overview follows Tim Cook.
  if (p === "/v1/me/people" && from === "/person.html") return { items: [] };
  if (p === "/v1/intelligence") {
    const history = {};
    for (const [id, label, fn] of [["revenue", "Revenue", i => (i + 1) * 1e9], ["netIncome", "Net income", i => (i - 1) * 2e8], ["operatingIncome", "Operating income", i => (i + 1) * 4e8], ["operatingCashFlow", "Operating cash flow", i => (i + 1) * 3e8]]) history[id] = { label, unit: "USD", points: records(fn) };
    return { company: { ticker, name: company, cik: "0000320193" }, currency: "USD", profile: { exchange: "NASDAQ", headquarters: { label: "Cupertino, CA" }, industry: "Electronic Computers", fiscalYearEnd: "September 26" },
      facts: [{ id: "assets", label: "Reported total assets", value: 5e11, periodEnd: "2026-06-27", form: "10-Q", sourceUrl: source }], financialHistory: history,
      filings: [{ form: "10-K", headline: "Annual financial report", filedAt: "2026-02-01", reportDate: "2025-12-31", sourceUrl: source, accession: "0000320193-26-000001" }, { form: "10-Q", headline: "Quarterly financial report", filedAt: "2026-08-01", reportDate: "2026-06-30", sourceUrl: source, accession: "0000320193-26-000002" }, { form: "8-K", headline: "Company current report", filedAt: "2026-09-01", reportDate: "2026-08-31", sourceUrl: source, accession: "0000320193-26-000003", items: [{ code: "2.02", label: "Results of operations and financial condition" }] }],
      observations: [{ kind: "fact", label: "Revenue", value: 4.1e11, periodEnd: "2026-06-30", sourceUrl: source, text: "Reported revenue" }], findings: [], warnings: [], dataAsOf: new Date().toISOString(),
      ttm: { revenue: ttmRow(4.1e11), netIncome: ttmRow(1.1e11), operatingIncome: ttmRow(1.3e11), operatingCashFlow: ttmRow(1.2e11), eps: ttmRow(7.5, "USD/share") },
      balance: { asOf: "2026-06-27", currency: "USD", cashAndShortTermInvestments: 6e10, cash: 4e10, totalDebt: 9e10, sources: [source] },
      shares: { value: 1.5e10, asOf: "2026-07-17", method: "reported", sourceUrl: source }, transactions: transactionItems.filter(t => t.ticker === ticker) };
  }
  if (p === "/v1/market/chart") {
    const range = url.searchParams.get("range") || "1Y";
    const points = range === "1Y" ? series(250, day, 180) : range === "1D" ? series(78, 300000, 228) : series(60, day, 200);
    return { ticker, range, currency: "USD", exchange: "NasdaqGS", timezone: "America/New_York", price: points.at(-1)[1], previousClose: points.at(-1)[1] - 2, change: 2, changePercent: .9, marketTime: new Date(points.at(-1)[0]).toISOString(), marketState: "closed", rangeChange: 5, rangeChangePercent: 2, points, source: { name: "Yahoo Finance", url: "https://finance.yahoo.com/quote/" + ticker } };
  }
  if (p === "/v1/company/profile") return { ticker, matched: true, label: company, shortDescription: "American multinational technology company", founded: 1976, employees: { value: 164000, asOf: "2025-09-27" }, website: { url: "https://www.apple.com/", label: "apple.com" }, summary: { text: "Apple Inc. is an American multinational technology company. It designs consumer electronics. It also sells services.", url: "https://en.wikipedia.org/wiki/Apple_Inc.", license: "CC BY-SA 4.0" }, people: [], sources: [] };
  if (p === "/v1/company/insiders") return { company: { ticker, cik: "0000320193" }, activity: [
    { accession: "a1", form: "4", filedAt: "2026-09-14", transactionDate: "2026-09-12", owner: { name: "COOK TIMOTHY D", cik: "12345", role: "Chief Executive Officer · Director" }, kind: "sale", code: "S", codeLabel: "Open-market sale", netShares: -12500, value: 325000, sharesAfter: 3000000, transactions: [], sourceUrl: source },
    { accession: "a2", form: "4", filedAt: "2026-07-09", transactionDate: "2026-07-07", owner: { name: "OTHER PUBLIC FILER", cik: "67890", role: "Director" }, kind: "purchase", code: "P", codeLabel: "Open-market purchase", netShares: 1500, value: 42000, sharesAfter: 9000, transactions: [], sourceUrl: source }],
    people: [{ name: "COOK TIMOTHY D", cik: "12345", role: "Chief Executive Officer · Director", filings: 1, lastFiled: "2026-09-14", sharesAfter: 3000000 }] };
  if (p === "/v1/company/news") return { announcements: [{ title: "Results of operations and financial condition", form: "8-K", filedAt: "2026-09-01", url: source, earnings: true }], headlines: [], headlinesAvailable: true };
  if (p === "/v1/me/watchlist") return method === "POST" ? { saved: true } : { items: [{ ticker: "AAPL", created_at: "2026-09-01T00:00:00Z" }, { ticker: "NVDA", created_at: "2026-08-01T00:00:00Z" }] };
  if (p === "/v1/me") return { user: { email: "reader@example.com", id: 1, created_at: "2026-01-01T00:00:00Z" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, currentPeriodEnd: "2026-11-14T00:00:00Z" } };
  if (p === "/v1/me/research-decisions") return method === "POST" ? { saved: true } : { items: [{ ticker: "AAPL", review_status: "researching", reviewStatus: "researching", notes: "Reading the latest 10-K before deciding.", created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }] };
  if (p === "/v1/me/people") return { items: insiderPeople.slice(0, 1) };
  if (p === "/v1/me/people/updates") return { people: [], items: [], following: 0, source: "SEC Form 4", disclaimer: "Reported purchases and sales are not recommendations or predictive signals." };
  if (p === "/v1/me/alerts") return { items: [] };
  // Alerts and research events (SYNTHETIC fixtures for the colour audit; the copy mirrors the engine's own summaries).
  const reEvent = { id: "11", event_type: "insider_purchase", status: "active", ticker: "AAPL", issuer_name: "Apple Inc.", transaction_date: "2026-09-10", transaction_date_end: "2026-09-11",
    filing_date: "2026-09-12T21:00:00Z", ingested_at: "2026-09-12T21:15:00Z", reporting_lag_days: 1, source_urls: [source], summary: "OTHER PUBLIC FILER (Director) reported buying 1,500 shares of AAPL at $28 a share on Sep 10, 2026 to Sep 11, 2026; reported value $42,000. Form 4 filed Sep 12, 2026." };
  if (p === "/v1/me/notifications") return { items: [{ id: "5", reason: "watchlist", createdAt: "2026-09-12T21:20:00Z", readAt: null, event: { id: "11", type: "insider_purchase", status: "active", ticker: "AAPL", filingDate: reEvent.filing_date, retrievedAt: reEvent.ingested_at, sourceUrls: [source], summary: reEvent.summary } },
    { id: "4", reason: "followed_person", createdAt: "2026-09-10T21:20:00Z", readAt: "2026-09-11T08:00:00Z", event: { id: "10", type: "insider_sale", status: "active", ticker: "AAPL", filingDate: "2026-09-10T20:00:00Z", retrievedAt: "2026-09-10T20:10:00Z", sourceUrls: [source], summary: "COOK TIMOTHY D (Chief Executive Officer) reported selling 12,500 shares of AAPL at $26 a share on Sep 8, 2026; reported value $325,000. Form 4 filed Sep 10, 2026." } }], unread: 1, next: null };
  if (p === "/v1/me/email-preferences") return { inApp: true, emailAlerts: "off", eventTypes: ["insider_purchase", "insider_sale", "multi_insider_purchase", "form4_amendment", "company_disclosure"], digestHourUtc: 13, consentedAt: null, unsubscribedAt: null,
    emailVerified: true, emailAvailable: true, consent: { version: "2026-10-19", text: "Email me factual alerts about new public filings." }, eventTypesAvailable: ["insider_purchase", "insider_sale", "multi_insider_purchase", "form4_amendment", "company_disclosure"], modes: ["off", "immediate", "daily"] };
  if (p === "/v1/research-events") return { items: [reEvent], next: null, lastImportAt: "2026-09-12T21:15:00Z" };
  if (/^\/v1\/research-events\/\d+\/explanation$/.test(p)) return { writer: "rules", facts: [{ text: reEvent.summary, evidence_ids: ["E1"] }], interpretation: [{ text: "A Form 4 is the public report an officer or director files after trading.", evidence_ids: [] }],
    limitations: ["Not a recommendation."], evidence: [{ id: "E1", text: "Form 4 accession 1.", sourceUrl: source, retrievedAt: reEvent.ingested_at }], disclaimer: "Not investment advice." };
  // The alerts page's public-source feed (SYNTHETIC fixtures in the shape src/api.mjs answers).
  if (p === "/v1/intelligence/events") return { items: [{ event_key: "sec:1", source_type: "sec_notice", title: "Apple Inc. 8-K: Results of operations and financial condition", subject: "AAPL", source_url: source, published_at: "2026-09-12T20:00:00Z", observed_at: "2026-09-12T20:05:00Z", verified: true }] };
  if (p === "/v1/intelligence/sources") return { sources: { secCompanyReports: "active", blueskyPublicPosts: "no_accounts_configured", houseFinancialDisclosures: "blocked_pending_legal_approval", senateFinancialDisclosures: "not_built" } };
  if (p === "/v1/me/push") return method === "GET" ? { configured: false, publicKey: null, subscriptions: 0 } : { ok: true };
  if (p === "/v1/me/security-events") return { items: [{ kind: "login_success", created_at: "2026-09-12T08:00:00Z" }] };
  if (p === "/v1/me/manual-holdings") return { items: [{ id: 1, ticker: "AAPL", quantity: 12.5, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }] };
  if (p === "/v1/me/brokerage/status") return { enabled: false, connected: false, provider: "snaptrade" };
  if (p === "/v1/me/brokerage/portfolio") return { accounts: [], holdings: [] };
  if (p === "/v1/billing/status") return { billingEnabled: true, plan: "pro", subscriptionStatus: "active", currentPeriodEnd: "2026-11-14T00:00:00Z" };
  if (p === "/v1/status") return { ok: true, filings: filingItems.length, transactions: transactionItems.length, latest_published_at: filingItems[0].published_at };
  if (p.startsWith("/v1/filings/")) return { ...filingItems[0], transactions: transactionItems.filter(t => t.ticker === "AAPL") };
  if (p === "/v1/filings") return { items: filingItems, total: filingItems.length };
  if (p === "/v1/transactions") return { items: transactionItems, total: transactionItems.length };
  if (p === "/v1/companies") return { items: filingItems.map(f => ({ ticker: f.ticker, issuer_name: f.issuer_name, name: f.issuer_name, last_filing_at: f.published_at, filings: 2 })), total: 3 };
  if (p === "/v1/insiders") return { items: insiderPeople, total: insiderPeople.length };
  if (p === "/v1/search") return { items: [{ ticker: "AAPL", name: "Apple Inc." }] };
  if (p === "/v1/entities/1081316") return COVERAGE.entity;
  if (p === "/v1/entities/search") return COVERAGE.search;
  if (p === "/v1/coverage") return COVERAGE.coverage;
  if (p === "/v1/purchases" || p === "/v1/sales") return { items: transactionItems };
  return null;
}

/* ---------- colour model (shared by every in-page pass) ----------
   Installed in the page as window.__hfPalette so the rest scan, the forced-state pass and the pixel
   pass judge colours the same way. A colour is fitted by least squares to
   paper + t·(ink − paper) + k·(orange − paper): it is in the palette when the residual is small,
   t sits in [0, 1] and k, the orange it needs, is within ±warmTol. Green and red count at any
   strength over the paper (market direction, alerts). isOrange() is what the state and glow passes
   flag: a warm hue (12°–62°) with real chroma that is not a direction colour. */
const installPalette = ({ palette, tol, warmTol }) => {
  if (window.__hfPalette) return;
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const bg = palette.bg, ink = palette.ink, warm = palette.warm;
  const u = [ink[0] - bg[0], ink[1] - bg[1], ink[2] - bg[2]], v = [warm[0] - bg[0], warm[1] - bg[1], warm[2] - bg[2]];
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const det = uu * vv - uv * uv;
  const coef = c => {
    const w = [c.r - bg[0], c.g - bg[1], c.b - bg[2]];
    const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2], wv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2];
    return { t: (wu * vv - wv * uv) / det, k: (wv * uu - wu * uv) / det };
  };
  // Market direction: green for purchases and rises, red for sales and falls, at any strength over the paper.
  const onDirection = c => [palette.up, palette.down].some(d => {
    const dv = [d[0] - bg[0], d[1] - bg[1], d[2] - bg[2]], w = [c.r - bg[0], c.g - bg[1], c.b - bg[2]];
    const t = (w[0] * dv[0] + w[1] * dv[1] + w[2] * dv[2]) / (dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]);
    return t >= -0.03 && t <= 1.03 && Math.hypot(w[0] - t * dv[0], w[1] - t * dv[1], w[2] - t * dv[2]) <= tol;
  });
  const inPalette = c => {
    if (!c || c.a <= 0.3) return true;
    if (onDirection(c)) return true;
    const { t, k } = coef(c);
    const fit = [bg[0] + t * u[0] + k * v[0], bg[1] + t * u[1] + k * v[1], bg[2] + t * u[2] + k * v[2]];
    const res = Math.hypot(c.r - fit[0], c.g - fit[1], c.b - fit[2]);
    return res <= tol && t >= -0.03 && t <= 1.03 && k >= -0.02 && k <= warmTol;
  };
  // How much of the retired orange a colour carries (0 for paper/ink blends, 1 for #e9762b).
  const warmOf = c => (!c || c.a <= 0.02) ? 0 : coef(c).k;
  const isOrange = c => {
    if (!c || c.a <= 0.05 || onDirection(c)) return false;
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), ch = max - min;
    if (ch < 24 || max !== c.r) return false;
    const hue = 60 * ((c.g - c.b) / ch);
    return hue >= 12 && hue <= 62 && warmOf(c) > warmTol;
  };
  const path = el => { const bits = []; let n = el; for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) s += "#" + n.id; else if (n.classList && n.classList.length) s += "." + [...n.classList].slice(0, 3).join("."); bits.unshift(s); } return bits.join(" > "); };
  Object.defineProperty(window, "__hfPalette", { value: Object.freeze({ parse, onDirection, inPalette, warmOf, isOrange, path }), configurable: true });
};

/* ---------- in-page scan ---------- */
const scan = ({ palette, tol }) => {
  const { parse, inPalette, warmOf, isOrange, path } = window.__hfPalette;
  const bg = palette.bg;
  const leaks = new Map(), fonts = new Map(), contrastMap = new Map();
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const over = (top, a, under) => ({ r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 });
  // Effective background: walk up to the first opaque background-color, compositing translucent
  // layers on the way. Elements over background images are skipped (judged by eye instead).
  const backdrop = el => {
    const layers = []; let n = el, base = { r: bg[0], g: bg[1], b: bg[2], a: 1 }, opacity = 1;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (n !== el) opacity *= Number(cs.opacity) || 1;
      if (cs.backgroundImage && cs.backgroundImage !== "none" && /url\(/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { if (c.a >= 0.95) { base = c; break; } layers.push(c); }
      n = n.parentElement;
    }
    let col = base; for (const l of layers.reverse()) col = over(l, l.a, col);
    return { col, opacity };
  };
  const addContrast = (el, cs, ratioValue, need, text, back) => {
    const key = cs.color + " on " + back + " " + Math.round(ratioValue * 10) / 10;
    const e = contrastMap.get(key) || { color: cs.color, background: back, ratio: Math.round(ratioValue * 100) / 100, needed: need, count: 0, examples: [], sample: "" };
    e.count++; if (e.examples.length < 3) e.examples.push(path(el)); if (!e.sample) e.sample = text.slice(0, 40); contrastMap.set(key, e);
  };
  // Nothing glows: no shadow, filter, gradient or gradient-filled SVG may carry a warm tint (orange at any
  // strength, or red/yellow beyond a trace).
  const warmTint = c => isOrange(c) || warmOf(c) > 0.1;
  const glows = new Map();
  const addGlow = (prop, value, el) => { const key = prop + " = " + value; const e = glows.get(key) || { prop, value: value.slice(0, 90), count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); glows.set(key, e); };
  const glowCheck = (cs, el, suffix) => {
    for (const prop of ["boxShadow", "textShadow", "filter", "backgroundImage"]) {
      const val = cs[prop];
      if (!val || val === "none" || (prop === "backgroundImage" && !/gradient\(/.test(val))) continue;
      if ((val.match(/rgba?\([^)]+\)/g) || []).some(m => warmTint(parse(m)))) addGlow(prop.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase()) + suffix, val, el);
    }
  };
  const add = (prop, value, el) => { const key = prop + " = " + value; const e = leaks.get(key) || { prop, value, orange: isOrange(parse(value)), count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); leaks.set(key, e); };
  const SKIP = new Set(["CANVAS", "IMG", "VIDEO", "IFRAME", "SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "HEAD", "TITLE", "BR", "WBR", "SOURCE", "PICTURE", "TEMPLATE"]);
  const allowedFonts = /^"?(JetBrains Mono|system-ui)"?/i; // V32: JetBrains Mono (brand and figures) or the interface sans
  for (const el of document.querySelectorAll("body *")) {
    if (SKIP.has(el.tagName)) continue;
    if (el.closest("canvas,[hidden],template")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (hasText) {
      const c = parse(cs.color); if (!inPalette(c)) add("color", cs.color, el);
      const bd = c ? backdrop(el) : null;
      if (bd && (Number(cs.opacity) || 1) * bd.opacity * c.a >= 0.35) {
        const eff = over(c, Math.min(1, c.a * (Number(cs.opacity) || 1) * bd.opacity), bd.col);
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
        const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        const rv = ratio(eff, bd.col);
        if (rv < need) addContrast(el, cs, rv, need, [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(" "), `rgb(${Math.round(bd.col.r)}, ${Math.round(bd.col.g)}, ${Math.round(bd.col.b)})`);
      }
      const fam = cs.fontFamily; const first = fam.split(",")[0].trim();
      if (!allowedFonts.test(first)) { const e = fonts.get(fam) || { fontFamily: fam, count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); fonts.set(fam, e); }
      if (cs.textDecorationLine && cs.textDecorationLine !== "none") { const d = parse(cs.textDecorationColor); if (!inPalette(d)) add("text-decoration-color", cs.textDecorationColor, el); }
    }
    const bgc = parse(cs.backgroundColor); if (!inPalette(bgc)) add("background-color", cs.backgroundColor, el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none") { const bc = parse(cs["border" + side + "Color"]); if (!inPalette(bc)) add("border-" + side.toLowerCase() + "-color", cs["border" + side + "Color"], el); }
    }
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") { const oc = parse(cs.outlineColor); if (!inPalette(oc)) add("outline-color", cs.outlineColor, el); }
    if (cs.backgroundImage && cs.backgroundImage !== "none" && !/url\(/.test(cs.backgroundImage)) {
      for (const m of cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []) { const gc = parse(m); if (!inPalette(gc)) { add("background-image", m, el); break; } }
    }
    if (cs.boxShadow && cs.boxShadow !== "none") { for (const m of cs.boxShadow.match(/rgba?\([^)]+\)/g) || []) { const sc = parse(m); if (sc && sc.a > 0.3 && !inPalette(sc)) { add("box-shadow", m, el); break; } } }
    glowCheck(cs, el, "");
    if (el instanceof SVGElement && /^url\(/.test(cs.fill || "")) {
      const id = (/url\("?#([^")]+)"?\)/.exec(cs.fill) || [])[1], grad = id && document.getElementById(id);
      if (grad && [...grad.querySelectorAll("stop")].some(st => { const sc = getComputedStyle(st); return Number(sc.stopOpacity) > 0.02 && warmTint(parse(sc.stopColor)); })) addGlow("svg-gradient-fill", "#" + id, el);
    }
    if (el instanceof SVGElement && /^(path|circle|rect|line|polyline|polygon|ellipse|text|use|g)$/i.test(el.tagName)) {
      for (const prop of ["fill", "stroke"]) { const val = cs[prop]; if (!val || val === "none" || /^url\(/.test(val)) continue; const pc = parse(val); if (pc && !inPalette(pc)) add("svg-" + prop, val, el); }
    }
  }
  for (const pe of ["::before", "::after"]) for (const el of document.querySelectorAll("body, body *")) {
    if (SKIP.has(el.tagName)) continue; const cs = getComputedStyle(el, pe); if (cs.content === "none" || cs.display === "none") continue;
    const c = parse(cs.backgroundColor); if (!inPalette(c)) add("background-color" + pe, cs.backgroundColor, el);
    const t = parse(cs.color); if (cs.content !== '""' && cs.content !== "normal" && !inPalette(t)) add("color" + pe, cs.color, el);
    glowCheck(cs, el, pe);
  }
  // Raster images must be retina-sharp: native pixels ≥ 2× the rendered CSS size (cover-adjusted).
  const blurry = [];
  for (const img of document.images) {
    const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
    if (r.width < 2 || cs.display === "none" || cs.visibility === "hidden" || /\.svg(\?|$)/i.test(img.currentSrc) || !img.naturalWidth) continue;
    if (/^data:image\/svg/.test(img.currentSrc)) continue;
    // With srcset (w descriptors) the page renders at DPR 1 here and the browser picked the 1x candidate; a 2x screen
    // gets the largest candidate instead, so judge that one (its pixel size, in the loaded image's aspect ratio).
    const widths = [img, ...(img.parentElement?.tagName === "PICTURE" ? img.parentElement.querySelectorAll("source") : [])]
      .flatMap(n => String(n.getAttribute("srcset") || "").split(",").map(c => Number(/\s(\d+)w\s*$/.exec(c.trim())?.[1] || 0)));
    const maxW = Math.max(0, ...widths);
    const nw = maxW || img.naturalWidth, nh = maxW ? img.naturalHeight * maxW / img.naturalWidth : img.naturalHeight;
    const scale = cs.objectFit === "cover" ? Math.max(r.width / nw, r.height / nh) : Math.min(r.width / nw, r.height / nh);
    if (scale * 2 > 1.0001) blurry.push({ src: img.currentSrc.split("/").pop().slice(0, 60), rendered: Math.round(r.width) + "x" + Math.round(r.height), natural: Math.round(nw) + "x" + Math.round(nh) + (maxW ? " (largest srcset candidate)" : ""), upscaleAt2x: +(scale * 2).toFixed(2), element: path(img) });
  }
  for (const el of document.querySelectorAll("body *")) {
    const bgi = getComputedStyle(el).backgroundImage;
    if (bgi && /url\(.*\.(jpe?g|png|webp)/i.test(bgi)) { const r = el.getBoundingClientRect(); if (r.width > 2) blurry.push({ src: bgi.slice(0, 80), rendered: Math.round(r.width) + "x" + Math.round(r.height), natural: "css background photo (use an <img> with a sharp source)", upscaleAt2x: null, element: path(el) }); }
  }
  const hal = document.querySelector("[data-halftone-hero],[data-halftone-footer]");
  const halCanvas = hal ? hal.querySelector("canvas") : null;
  const fr = halCanvas ? halCanvas.getBoundingClientRect() : null;
  return {
    leaks: [...leaks.values()].sort((a, b) => b.count - a.count),
    glows: [...glows.values()].sort((a, b) => b.count - a.count),
    fonts: [...fonts.values()].sort((a, b) => b.count - a.count),
    contrast: [...contrastMap.values()].sort((a, b) => b.count - a.count),
    blurry,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    bodyClass: document.body.className,
    halftone: hal ? { kind: hal.hasAttribute("data-halftone-hero") ? "hero" : "footer", width: fr ? Math.round(fr.width) : 0, height: fr ? Math.round(fr.height) : 0, mounted: !!hal.__halftone } : null,
    plainFooter: !!document.querySelector("footer.v13-footer--plain .hwf-top"),
    hasV13: !!document.querySelector('link[href*="v13-halftone.css"]') && !!document.querySelector('script[src*="v13-halftone.js"]'),
    title: document.title
  };
};

/* The dotted wordmark must stay ink while the pointer pushes its dots and after a click
   sends a ring through it: count orange pixels on the hero canvas at the worst moment. */
async function wordmarkGlow(page) {
  const box = await page.evaluate(() => { const c = document.querySelector("[data-halftone-hero] canvas"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, bottom: Math.min(r.bottom, innerHeight) }; });
  if (!box || box.w < 10) return 0;
  const count = () => page.evaluate(() => { const c = document.querySelector("[data-halftone-hero] canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] - d[i + 2] > 60 && d[i + 1] < d[i] - 30) k++; return k; });
  const y = box.bottom - Math.min(60, (box.bottom - box.y) / 3);
  let worst = 0;
  for (let i = 0; i <= 24; i++) await page.mouse.move(box.x + 20 + i * (box.w - 40) / 24, y, { steps: 2 });
  worst = Math.max(worst, await count());
  await page.mouse.click(box.x + box.w / 2, y);
  await page.waitForTimeout(120);
  worst = Math.max(worst, await count());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  return worst;
}

/* ---------- interactive states: nothing turns orange on hover, focus or press ----------
   Visible interactive elements (up to three of each look first, so a long table of identical links
   does not crowd out the rest), kept on window with their ancestors for the DevTools protocol. */
const pickInteractive = ({ cap, fresh }) => {
  const SEL = "a,button,summary,[role=tab],[role=button],label,input,select,textarea,[data-hf-atom]";
  const shown = el => {
    if (el.closest("[hidden],template")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== "hidden";
  };
  const done = window.__hfAudited || (window.__hfAudited = new WeakSet());
  const all = [...document.querySelectorAll(SEL)].filter(el => !(fresh && done.has(el)) && shown(el));
  const name = n => n.tagName + "." + [...n.classList].sort().join(".");
  const look = el => name(el) + "<" + (el.parentElement ? name(el.parentElement) : "");
  const per = new Map(), chosen = new Set(), later = [];
  for (const el of all) { const k = look(el), n = per.get(k) || 0; per.set(k, n + 1); if (n < 3 && chosen.size < cap) chosen.add(el); else later.push(el); }
  for (const el of later) { if (chosen.size >= cap) break; chosen.add(el); }
  const els = all.filter(el => chosen.has(el));
  for (const el of els) done.add(el);
  // Only what can take focus is focused (a press focuses it too); its ancestors get :focus-within.
  const FOCUSABLE = "a[href],area[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1']),[contenteditable]:not([contenteditable=false])";
  const anc = new Map();
  for (const el of els) { const f = el.matches(FOCUSABLE); for (let n = el.parentElement; n; n = n.parentElement) anc.set(n, anc.get(n) || f); }
  window.__hfStateEls = els; window.__hfStateAnc = [...anc.keys()];
  return { picked: els.length, of: all.length, focusable: els.map(el => el.matches(FOCUSABLE)), focusAnc: [...anc.values()] };
};
/* Reads every colour an element (and up to 24 descendants, and their ::before/::after/::marker) paints
   in the state that is forced right now, after finishing the transitions the state started. */
const readStates = ({ state }) => {
  const { parse, isOrange, path } = window.__hfPalette;
  for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) a.finish(); } catch {} }
  const out = [], seen = new Set(), kebab = p => p.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase());
  const look = (el, pe, owner) => {
    const cs = getComputedStyle(el, pe || null);
    if (cs.display === "none") return;
    if (pe === "::marker") { if (!(el.tagName === "SUMMARY" || cs.display === "list-item") || getComputedStyle(el).listStyleType === "none") return; }
    else if (pe && (cs.content === "none" || cs.content === "normal")) return;
    if (!pe && cs.visibility === "hidden") return;
    const hit = (prop, value) => out.push({ state, el: path(el) + (pe || ""), in: owner === el ? "" : path(owner), prop, value });
    const text = pe ? (pe === "::marker" || cs.content !== '""') : /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (text && isOrange(parse(cs.color))) hit("color", cs.color);
    if (isOrange(parse(cs.backgroundColor))) hit("background-color", cs.backgroundColor);
    for (const side of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none" && isOrange(parse(cs["border" + side + "Color"]))) { hit("border-" + side.toLowerCase() + "-color", cs["border" + side + "Color"]); break; }
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && isOrange(parse(cs.outlineColor))) hit("outline-color", cs.outlineColor);
    if (cs.textDecorationLine && cs.textDecorationLine !== "none" && (el.textContent || "").trim() && isOrange(parse(cs.textDecorationColor))) hit("text-decoration-color", cs.textDecorationColor);
    for (const prop of ["boxShadow", "textShadow", "backgroundImage", "filter"]) { const v = cs[prop]; if (v && v !== "none") for (const m of v.match(/rgba?\([^)]+\)/g) || []) if (isOrange(parse(m))) { hit(kebab(prop), m); break; } }
    if (!pe && el instanceof SVGElement) for (const prop of ["fill", "stroke"]) { const v = cs[prop]; if (v && v !== "none" && !/^url/.test(v) && isOrange(parse(v))) hit(prop, v); }
    if (!pe && /^(INPUT|PROGRESS|METER)$/.test(el.tagName) && cs.accentColor !== "auto" && isOrange(parse(cs.accentColor))) hit("accent-color", cs.accentColor);
    if (!pe && /^(INPUT|TEXTAREA)$/.test(el.tagName) && isOrange(parse(cs.caretColor))) hit("caret-color", cs.caretColor);
  };
  for (const el of window.__hfStateEls || []) {
    if (!el.isConnected) continue;
    for (const n of [el, ...[...el.querySelectorAll("*")].slice(0, 24)]) {
      if (seen.has(n) || /^(CANVAS|IMG|VIDEO|PICTURE|SOURCE|SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName)) continue;
      seen.add(n);
      look(n, "", el); look(n, "::before", el); look(n, "::after", el);
      if (n.tagName === "SUMMARY" || n.tagName === "LI") look(n, "::marker", el);
    }
  }
  return out;
};
/* [state, classes forced on an element (focusable or not), classes forced on an ancestor (of a focusable one
   or not)]: a real hover or press holds the whole ancestor chain, and a press focuses what it presses. */
const STATES = [
  ["hover", f => ["hover"], f => ["hover"]],
  ["focus", f => f ? ["focus", "focus-visible"] : [], f => f ? ["focus-within"] : []],
  ["active", f => f ? ["active", "hover", "focus"] : ["active", "hover"], f => f ? ["active", "hover", "focus-within"] : ["active", "hover"]]
];
async function forcedStates(page, cdp, fresh) {
  const { picked, of, focusable, focusAnc } = await page.evaluate(pickInteractive, { cap: STATE_CAP, fresh });
  if (!picked) return { picked, of, hits: [] };
  await cdp.send("DOM.getDocument", { depth: 0 });
  const nodes = async expr => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: expr, objectGroup: "hf-audit" });
    if (!result.objectId) return [];
    const { result: props } = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
    const ids = props.filter(p => /^\d+$/.test(p.name) && p.value && p.value.objectId).sort((a, b) => a.name - b.name).map(p => p.value.objectId);
    return Promise.all(ids.map(objectId => cdp.send("DOM.requestNode", { objectId }).then(r => r.nodeId, () => 0)));
  };
  const els = await nodes("window.__hfStateEls"), anc = await nodes("window.__hfStateAnc");
  await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "hf-audit" }).catch(() => {});
  const hits = await page.evaluate(readStates, { state: "rest" });
  for (const [state, own, up] of STATES) {
    const force = new Map();
    anc.forEach((id, i) => { if (id) force.set(id, up(focusAnc[i])); });
    els.forEach((id, i) => { if (id) force.set(id, [...new Set([...(force.get(id) || []), ...own(focusable[i])])]); });
    await Promise.all([...force].map(([nodeId, forcedPseudoClasses]) => cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses }).catch(() => {})));
    try { hits.push(...await page.evaluate(readStates, { state })); }
    finally { await Promise.all([...force.keys()].map(nodeId => cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }).catch(() => {}))); }
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) a.finish(); } catch {} } });
  // One finding per element and property, listing every state it is orange in.
  const merged = new Map();
  for (const h of hits) { const k = h.el + "|" + h.prop + "|" + h.value, m = merged.get(k); if (m) { if (!m.states.includes(h.state)) m.states.push(h.state); } else merged.set(k, { ...h, states: [h.state] }); }
  return { picked, of, hits: [...merged.values()] };
}

/* ---------- orange pixels on screen ----------
   A minimal PNG reader (8-bit greyscale/RGB/RGBA, not interlaced: what Chromium's screenshots are) so
   the pixels are judged in Node, away from the page under test. */
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !ch) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * ch, out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0, b = y ? out[up + x] : 0, c = x >= ch && y ? out[up + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  return { width, height, ch, data: out };
}
/* Screenshots for the pixel pass show no text: every glyph (HTML and SVG text) is made transparent for the
   moment of the capture. Text colour is checked exactly from computed styles (palette scan, forced states);
   glyph edges can carry subpixel (LCD) colour fringes on some machines (GitHub's runners), which would read
   as orange. Everything else (dot fields, canvases, fills, borders, icons, images) is captured as painted.
   The rule sits in the insidir-v13 layer with id-level specificity (:is() takes its heaviest argument), so it
   outranks the site's own !important rules. */
async function textlessShot(page) {
  await page.evaluate(() => new Promise(done => {
    document.documentElement.setAttribute("data-hf-pixel-pass", "");
    const s = document.createElement("style"); s.id = "hf-pixel-pass-style";
    s.textContent = "@layer insidir-v13{:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::before,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::after,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::marker{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important}" +
      ":is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) svg :is(text,tspan){fill:transparent!important;stroke:transparent!important}}";
    document.head.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(done));
  }));
  try { return await page.screenshot({ type: "png" }); }
  finally { await page.evaluate(() => { document.documentElement.removeAttribute("data-hf-pixel-pass"); document.getElementById("hf-pixel-pass-style")?.remove(); }); }
}
/* Orange pixels (r > 110, r − g > 35, g − b > 15, r − b > 70: the retired accent and anything near it,
   never the green/red direction colours or ink), grouped into 16px cells joined where they touch. */
function orangeClusters({ width, height, ch, data }, minPx = 3) {
  const C = 16, cw = Math.ceil(width / C), cells = new Map();
  if (ch < 3) return [];
  // Single pixels count, so a 1px orange hairline is caught; text is kept out of the capture (textlessShot).
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
    if (!(r > 110 && r - g > 35 && g - b > 15 && r - b > 70)) continue;
    const k = Math.floor(y / C) * cw + Math.floor(x / C);
    let c = cells.get(k);
    if (!c) cells.set(k, c = { n: 0, pts: [], x0: x, y0: y, x1: x, y1: y });
    c.n++; if (c.n % 7 === 1 && c.pts.length < 3) c.pts.push([x, y]);
    c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y); c.x1 = Math.max(c.x1, x); c.y1 = Math.max(c.y1, y);
  }
  const out = [], done = new Set();
  for (const start of cells.keys()) {
    if (done.has(start)) continue;
    done.add(start);
    const stack = [start], g = { n: 0, pts: [], x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
    while (stack.length) {
      const k = stack.pop(), c = cells.get(k), cx = k % cw, cy = Math.floor(k / cw);
      g.n += c.n; if (g.pts.length < 8) g.pts.push(...c.pts.slice(0, 8 - g.pts.length));
      g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, nk = ny * cw + nx;
        if (nx >= 0 && nx < cw && ny >= 0 && cells.has(nk) && !done.has(nk)) { done.add(nk); stack.push(nk); }
      }
    }
    if (g.n >= minPx) out.push(g);
  }
  return out;
}
/* The element under each cluster. A cluster is a real photograph or company logo (ignored) when every
   sampled pixel lands on an <img>, <picture> or <video>, or on a box that holds one under that pixel
   (a link or overlay laid over a logo). */
const nameClusters = clusters => {
  const { path } = window.__hfPalette;
  const MEDIA = "img,picture,video";
  const onMedia = (el, x, y) => {
    if (!el) return false;
    if (el.closest(MEDIA)) return true;
    return [...el.querySelectorAll(MEDIA)].some(m => { const r = m.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; });
  };
  return clusters.map(pts => {
    let named = null, media = 0;
    for (const [x, y] of pts) {
      const el = document.elementFromPoint(x + 0.5, y + 0.5);
      if (onMedia(el, x + 0.5, y + 0.5)) media++; else if (!named) named = el;
    }
    return { photo: media === pts.length, el: named ? path(named) : "(no element)" };
  });
};
/* Screenshots of the viewport at the given scroll positions ("top", "middle", "bottom", or null for
   where the page is now), every orange cluster on them named. */
async function orangePixels(page, where = ["top", "middle", "bottom"]) {
  const found = new Map();
  const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
  const ys = { top: 0, middle: Math.max(0, Math.round((h - vh) / 2)), bottom: Math.max(0, h - vh) };
  const seenY = new Set();
  for (const at of where) {
    if (at !== null) {
      if (seenY.has(ys[at])) continue;
      seenY.add(ys[at]);
      await page.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), ys[at]);
      await page.waitForTimeout(350);
    }
    const clusters = orangeClusters(decodePNG(await textlessShot(page)));
    if (!clusters.length) continue;
    const names = await page.evaluate(nameClusters, clusters.map(c => c.pts));
    clusters.forEach((c, i) => {
      if (names[i].photo) return;
      const key = names[i].el, f = found.get(key) || { el: key, px: 0, at: at || "now", box: `${c.x0},${c.y0} ${c.x1 - c.x0 + 1}x${c.y1 - c.y0 + 1}` };
      f.px += c.n; found.set(key, f);
    });
  }
  if (where.some(w => w !== null)) await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return [...found.values()].sort((a, b) => b.px - a.px);
}

/* ---------- run ---------- */
const server = createServer((req, res) => { serveStatic(req, res).then(found => { if (!found) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const shots = opt("shots", "");
if (shots) await mkdir(shots, { recursive: true });
const report = { tolerance: TOL, warmTolerance: WARM_TOL, pages: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-lcd-text", "--font-render-hinting=none"] });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    // Tools that measure the page see every scroll-reveal block in place (v13-motion.js holds blocks below the fold back until they scroll in).
    await context.addInitScript(() => {
      // Every scroll-reveal block in place at once; a block let go from .hf-pending may start a transition of its own
      // from the hidden state (28px low, transparent), so that is finished too and measurements see the final layout.
      const go = () => {
        const M = window.InsidirMotion;
        if (!M) return;
        const held = new Set(document.querySelectorAll(".hf-pending,.hf-revealing"));
        M.revealAll();
        if (held.size) for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect && held.has(a.effect.target)) { try { a.finish(); } catch {} }
      };
      addEventListener("DOMContentLoaded", () => setTimeout(go, 0));
      addEventListener("load", go);
    });
    // Self-test hooks: prove the audit fails when something orange is added (see the header).
    // intelligence.html plays a short one-time introduction (headings fade in over ~2 s). Colours and contrast are
    // judged on the settled page, as every returning visitor sees it, so the audit starts with the intro already seen.
    await context.addInitScript(() => { try { sessionStorage.setItem("ix-intro", "1"); } catch {} });
    if (INJECT_JS) await context.addInitScript({ content: INJECT_JS });
    if (INJECT_CSS) await context.addInitScript(css => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "@layer insidir-v13{" + css + "}"; document.head.appendChild(s); }), INJECT_CSS);
    await context.route("**/v1/**", async route => {
      const request = route.request(), url = new URL(request.url());
      let from = "", hash = ""; try { const f = new URL(request.frame().url()); from = f.pathname; hash = f.hash; } catch {}
      const body = fixture(url, request.method(), from, hash);
      if (body !== null && body[NDJSON]) await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: body[NDJSON] });
      else if (body !== null && body[STATUS]) await route.fulfill({ status: body[STATUS], contentType: "application/json", body: JSON.stringify(body.body) });
      else if (body !== null) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      else await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not mocked"}' });
    });
    // Commons pictures are stood in for by a grey disc as large as the file asked for (a "250px-" thumbnail is 250px
    // wide), so the sharpness check judges the page's choice of thumbnail, not the stand-in.
    await context.route(/upload\.wikimedia\.org|thumb\.wikimedia\.org/, route => {
      const px = Number((/\/(\d{2,4})px-[^/]*$/.exec(new URL(route.request().url()).pathname) || [])[1]) || 512;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#777"/></svg>` });
    });
    for (const [key, path] of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
      const entry = { page: key, path, width, errors };
      // Every in-page pass judges colours with the same model (installed once per document).
      const inPage = async (fn, arg) => { await page.evaluate(installPalette, { palette: PALETTE, tol: TOL, warmTol: WARM_TOL }); return page.evaluate(fn, arg); };
      try {
        await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 }));
        await page.evaluate(() => document.fonts && document.fonts.ready);
        await page.waitForTimeout(900);
        await page.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 250)); window.scrollTo(0, 0); });
        await page.waitForTimeout(250);
        Object.assign(entry, await inPage(scan, { palette: PALETTE, tol: TOL }));
        if (key === "index") entry.canvasGlow = await wordmarkGlow(page);
        if (shots) {
          // Walk the page once so lazy images and scroll reveals have loaded before the full-page capture.
          await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight * .8) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
          await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 3000); }))));
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(shots, `${key}-${width}.png`), fullPage: true });
        }
        if (!flag("no-pixels")) { await inPage(() => 0); entry.pixels = await orangePixels(page); }
        let cdp = null;
        if (!flag("no-states")) {
          cdp = await context.newCDPSession(page);
          await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
          await inPage(() => 0);
          entry.states = await forcedStates(page, cdp, false);
        }
        if (!flag("no-menus")) {
          const toggles = ["#v6-menu-button", ".app-menu-btn", ".user-menu__btn", ".site-nav__menu"];
          const opened = [];
          for (const sel of toggles) { const el = page.locator(sel).first(); if (await el.count() && await el.isVisible()) { await el.click({ force: true }).catch(() => {}); opened.push(sel); } }
          if (opened.length) {
            await page.waitForTimeout(350);
            const withMenus = await inPage(scan, { palette: PALETTE, tol: TOL });
            entry.menuState = { opened, leaks: withMenus.leaks.filter(l => !entry.leaks.some(x => x.prop === l.prop && x.value === l.value)), glows: withMenus.glows.filter(g => !entry.glows.some(x => x.prop === g.prop && x.value === g.value)), overflow: withMenus.overflow };
            // The menu items that just appeared go through the same states, and the open menus are searched for orange pixels.
            if (cdp) { await inPage(() => 0); entry.menuState.states = await forcedStates(page, cdp, true); }
            if (!flag("no-pixels")) entry.menuState.pixels = (await orangePixels(page, [null])).filter(f => !(entry.pixels || []).some(x => x.el === f.el));
            if (shots) await page.screenshot({ path: join(shots, `${key}-${width}-menus.png`), fullPage: false });
          }
        }
      } catch (e) { entry.failure = String(e && e.message || e); }
      report.pages.push(entry);
      await page.close();
    }
    await context.close();
  }
} finally { await browser?.close(); await new Promise(ok => server.close(ok)); }

/* ---------- summary ---------- */
let total = 0;
for (const p of report.pages) {
  const menuLeaks = p.menuState ? p.menuState.leaks.length : 0;
  const n = (p.leaks ? p.leaks.length : 0) + menuLeaks, lc = p.contrast ? p.contrast.length : 0, bl = p.blurry ? p.blurry.length : 0;
  total += bl;
  // The dotted wordmark belongs to the landing page's first screen only; every page needs the plain footer.
  const halftoneNote = p.failure ? "" : p.page === "index"
    ? (p.halftone && p.halftone.kind === "hero" && p.halftone.mounted && p.halftone.width > 0 ? "" : ", HALFTONE HERO MISSING")
    : (p.halftone ? ", UNEXPECTED HALFTONE WORDMARK (landing hero only)" : "");
  const footerNote = p.failure || p.plainFooter ? "" : ", PLAIN FOOTER MISSING";
  const glowCount = (p.glows ? p.glows.length : 0) + (p.menuState && p.menuState.glows ? p.menuState.glows.length : 0) + (p.canvasGlow > 0 ? 1 : 0);
  total += glowCount;
  total += n + lc + (p.fonts ? p.fonts.length : 0) + p.errors.length + (p.failure ? 1 : 0) + (p.overflow > 4 ? 1 : 0) + (halftoneNote ? 1 : 0) + (footerNote ? 1 : 0) + (p.hasV13 === false ? 1 : 0);
  // Orange in an interactive state (rest, hover, focus, active; menus open too) and orange pixels on screen.
  const stateHits = [...(p.states ? p.states.hits : []), ...(p.menuState && p.menuState.states ? p.menuState.states.hits.map(h => ({ ...h, menu: true })) : [])];
  const pixelHits = [...(p.pixels || []), ...(p.menuState && p.menuState.pixels ? p.menuState.pixels.map(x => ({ ...x, at: "menus open" })) : [])];
  total += stateHits.length + pixelHits.length;
  const tested = p.states ? p.states.picked + (p.menuState && p.menuState.states ? p.menuState.states.picked : 0) : null;
  const status = p.failure ? "FAILED " + p.failure : `${n} off-palette value${n === 1 ? "" : "s"}, ${lc} low-contrast, ${bl} blurry image(s), ${p.fonts ? p.fonts.length : 0} font issue(s), overflow ${p.overflow}px, ${p.errors.length} error(s)`
    + (tested === null ? "" : `, ${stateHits.length} orange state(s) in ${tested} controls`) + (p.pixels ? `, ${pixelHits.length} orange pixel cluster(s)` : "")
    + (p.hasV13 ? "" : ", v13 assets missing") + halftoneNote + footerNote;
  console.log(`[${p.width}px] ${p.page.padEnd(14)} ${status}`);
  for (const h of stateHits.slice(0, 12)) console.log(`    ORANGE [${h.states.join(",")}]${h.menu ? " [menu open]" : ""} ${h.prop} ${h.value}  on ${h.el}${h.in ? "  (inside " + h.in + ")" : ""}`);
  if (stateHits.length > 12) console.log(`    … ${stateHits.length - 12} more orange states (see --json)`);
  for (const x of pixelHits.slice(0, 8)) console.log(`    ORANGE PIXELS ${x.px}px at ${x.at} (${x.box}) under ${x.el}`);
  if (pixelHits.length > 8) console.log(`    … ${pixelHits.length - 8} more orange pixel clusters (see --json)`);
  if (glowCount) console.log(`    ${glowCount} ORANGE GLOW(S): nothing on the site may glow`);
  for (const g of [...(p.glows || []), ...(p.menuState && p.menuState.glows || [])]) console.log(`    glow ${g.prop.padEnd(22)} ${g.value.slice(0, 70)} ×${g.count}  e.g. ${g.examples[0]}`);
  if (p.canvasGlow > 0) console.log(`    glow halftone wordmark: ${p.canvasGlow} orange pixels while the pointer pushes the dots`);
  for (const l of (p.leaks || []).slice(0, 12)) console.log(`    ${l.orange ? "ORANGE " : ""}${l.prop.padEnd(24)} ${l.value.padEnd(26)} ×${l.count}  e.g. ${l.examples[0]}`);
  if (p.leaks && p.leaks.length > 12) console.log(`    … ${p.leaks.length - 12} more (see --json)`);
  for (const l of (p.menuState ? p.menuState.leaks : []).slice(0, 6)) console.log(`    ${l.orange ? "ORANGE " : ""}[menu open] ${l.prop.padEnd(12)} ${l.value.padEnd(26)} ×${l.count}  e.g. ${l.examples[0]}`);
  for (const c of (p.contrast || []).slice(0, 10)) console.log(`    contrast ${c.ratio}:1 (needs ${c.needed}) ${c.color} on ${c.background} ×${c.count}  "${c.sample}"  e.g. ${c.examples[0]}`);
  if (p.contrast && p.contrast.length > 10) console.log(`    … ${p.contrast.length - 10} more low-contrast (see --json)`);
  for (const b of p.blurry || []) console.log(`    BLURRY ${b.src} rendered ${b.rendered} natural ${b.natural} upscale@2x ${b.upscaleAt2x}  e.g. ${b.element}`);
  for (const f of p.fonts || []) console.log(`    font ${f.fontFamily.slice(0, 60)} ×${f.count}  e.g. ${f.examples[0]}`);
  for (const e of p.errors) console.log(`    error ${e.slice(0, 160)}`);
}
console.log(`\n${total === 0 ? "CLEAN" : total + " finding(s)"} across ${report.pages.length} page renders (tolerance ${TOL}, warm tolerance ${WARM_TOL}).`);
if (opt("json", "")) await writeFile(opt("json", ""), JSON.stringify(report, null, 1));
if (total > 0 && !flag("no-fail")) process.exitCode = 1;

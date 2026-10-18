import test from "node:test";
import assert from "node:assert/strict";
import {
  handlePublicPage, isPublicPagePath, slugify, displayName, personUrl, companyUrl, money, robotsTxt, siteOrigin, clearPublicPageCache,
  COMPANY_SQL, HUB_SQL, SITEMAP_SQL, SITEMAP_PAGE, RENDERS_PER_MINUTE
} from "../src/public-pages.mjs";
import { SQL as PROFILE_SQL, OWNERS_TABLE_SQL } from "../src/person-profile.mjs";
import { gate, classifyPage } from "../src/paywall.mjs";

/* The public, server-rendered insider pages (src/public-pages.mjs). They run against an injected
 * query(sql, params) answered by exact SQL text, so no database is touched. Fixtures are fictional. */
function fakeQuery(answers = {}) {
  const fn = async (sql, params) => {
    fn.statements.push({ sql, params });
    const answer = answers[sql];
    if (typeof answer === "function") return answer(params);
    return answer || { rows: [] };
  };
  fn.statements = [];
  return fn;
}
function fakeRes() {
  const res = { status: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.writeHead = (status, headers = {}) => { res.status = status; for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v; };
  res.end = body => { res.body = body ? String(body) : ""; };
  return res;
}
let client = 0;
async function get(path, query, env = { INSIDIR_PUBLIC_URL: "https://insidir.example" }) {
  const res = fakeRes();
  const done = await handlePublicPage({ method: "GET", headers: {} }, res, new URL(path, "http://localhost"), { query, env, requester: "test-" + (client++) });
  return { done, ...res };
}
const line = (id, extra = {}) => ({
  id, accession: "000999999926000001", issuer_cik: "0000099999", ticker: "EXMP", owner_cik: "0009876543", owner_name: "DOE JANE",
  transaction_date: new Date("2026-10-01T00:00:00Z"), security_title: "Common Stock", transaction_code: "P", acquired_disposed: "A",
  category: "reported_purchase", derivative: false, shares: "1500.00000000", price_per_share: "28.00000000", estimated_value: "42000.00",
  source_url: "https://www.sec.gov/Archives/edgar/data/99999/000999999926000001/form4.xml", issuer_name: "EXAMPLE CORP",
  published_at: new Date("2026-10-03T21:15:00Z"), is_amendment: false, ...extra
});

test("public page paths, slugs, names and money", () => {
  for (const p of ["/insider-trading", "/insider-trading/NVDA", "/insider-trading/brk.b", "/insiders/1214156", "/insiders/1214156-tim-cook", "/sitemap.xml", "/sitemaps/pages.xml", "/sitemaps/companies-1.xml", "/sitemaps/insiders-2.xml", "/robots.txt"])
    assert.equal(isPublicPagePath(p), true, p);
  for (const p of ["/", "/dashboard.html", "/insider-trading/a/b", "/sitemaps/other.xml", "/v1/insiders"]) assert.equal(isPublicPagePath(p), false, p);
  assert.equal(displayName("HUANG JEN HSUN"), "Huang Jen Hsun");
  assert.equal(displayName("BERKSHIRE HATHAWAY INC"), "Berkshire Hathaway INC");
  assert.equal(displayName("Cook Timothy D"), "Cook Timothy D", "mixed case is kept as filed");
  assert.equal(slugify("Müller-Lüdenscheidt, Hans & Co."), "muller-ludenscheidt-hans-co");
  assert.equal(personUrl("0001214156", "COOK TIMOTHY D"), "/insiders/1214156-cook-timothy-d");
  assert.equal(personUrl("0001214156", ""), "/insiders/1214156");
  assert.equal(companyUrl("nvda"), "/insider-trading/NVDA");
  assert.equal(money("42000.00"), "$42K");
  assert.equal(money(1_250_000), "$1.25M");
  assert.equal(money(31_000_000), "$31M");
  assert.equal(money(28), "$28");
  assert.equal(money(null), "—");
  assert.equal(siteOrigin({}), "https://insidir.com");
  assert.equal(siteOrigin({ INSIDIR_PUBLIC_URL: "https://insidir.example/path" }), "https://insidir.example");
});

test("the paywall leaves every public page open, signed out", async () => {
  const env = { INSIDIR_PAYWALL: "1" };
  for (const p of ["/insider-trading", "/insider-trading/NVDA", "/insiders/1214156-tim-cook", "/sitemap.xml", "/sitemaps/insiders-1.xml", "/robots.txt"]) {
    assert.equal(classifyPage(p), "public", p);
    const d = await gate({ req: { method: "GET" }, url: new URL(p, "http://x"), loadUser: async () => { throw new Error("no session lookup for public pages"); }, env });
    assert.deepEqual([d.action, d.kind], ["allow", "public"], p);
  }
});

test("robots.txt allows public pages, keeps the product and the API out, and names the sitemap", async () => {
  clearPublicPageCache();
  const r = await get("/robots.txt", null);
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /text\/plain/);
  assert.match(r.body, /^User-agent: \*\nAllow: \//);
  for (const path of ["/v1/", "/dashboard", "/company.html", "/person.html", "/billing"]) assert.ok(r.body.includes("Disallow: " + path), path);
  assert.ok(!/Disallow: \/insider/.test(r.body));
  assert.match(r.body, /Sitemap: https:\/\/insidir\.example\/sitemap\.xml/);
  assert.equal(robotsTxt("https://a.b").trim().split("\n").at(-1), "Sitemap: https://a.b/sitemap.xml");
});

test("company page: real lines, escaped, totals from original filings, insiders linked, the trial offer, cached", async () => {
  clearPublicPageCache();
  const query = fakeQuery({
    [COMPANY_SQL.lines]: { rows: [line("a:1"), line("a:2", { owner_cik: "0001111111", owner_name: "<SCRIPT>ROE</SCRIPT>", category: "reported_sale", transaction_code: "S", estimated_value: "1250000.00" })] },
    [COMPANY_SQL.totals]: { rows: [{ buys: 1, buy_value: "42000.00", sells: 1, sell_value: "1250000.00", other: 0, filings: 2, last_published_at: new Date("2026-10-03T21:15:00Z") }] },
    [COMPANY_SQL.insiders(false)]: { rows: [{ owner_cik: "0009876543", owner_name: "DOE JANE", last_transaction_date: new Date("2026-10-01T00:00:00Z"), lines: 1, buy_value: "42000.00", sell_value: "0" }] }
  });
  const r = await get("/insider-trading/EXMP", query);
  assert.equal(r.status, 200);
  assert.match(r.headers["cache-control"], /^public, max-age=600/);
  assert.match(r.body, /<title>Example Corp \(EXMP\) insider trading/);
  assert.match(r.body, /<link rel="canonical" href="https:\/\/insidir\.example\/insider-trading\/EXMP">/);
  assert.match(r.body, /<h1 id="pp-title">Example Corp <span>insider trading\.<\/span><\/h1>/);
  assert.ok(!r.body.includes("<SCRIPT>ROE"), "names are escaped");
  assert.match(r.body, /&lt;script&gt;roe&lt;\/script&gt;/i);
  assert.match(r.body, /href="\/insiders\/9876543-doe-jane"/);
  assert.match(r.body, /Open-market purchase <span class="pp-code">P<\/span>/);
  assert.match(r.body, /\$42K/);
  assert.match(r.body, /−\$1\.21M/, "net is purchases minus sales");
  assert.match(r.body, /<strong>\$1<\/strong><span>for 3 days<\/span>/);
  assert.match(r.body, /Then \$39 a month/);
  assert.match(r.body, /href="https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/99999\//);
  assert.match(r.body, /"@type":"Corporation","name":"Example Corp","tickerSymbol":"EXMP"/);
  // Original filings only in the totals; the ticker is a bound parameter.
  assert.match(COMPANY_SQL.totals, /NOT f\.is_amendment/);
  assert.deepEqual(query.statements.find(s => s.sql === COMPANY_SQL.lines).params, ["EXMP", 40]);
  const before = query.statements.length;
  const again = await get("/insider-trading/EXMP", query);
  assert.equal(again.status, 200);
  assert.equal(query.statements.length, before, "served from the page cache");
});

test("company page: canonical ticker, 404 for unknown and invalid tickers, noindex", async () => {
  clearPublicPageCache();
  const query = fakeQuery();
  const lower = await get("/insider-trading/exmp", query);
  assert.deepEqual([lower.status, lower.headers.location], [301, "/insider-trading/EXMP"]);
  const dotted = await get("/insider-trading/BRK.B", query);
  assert.deepEqual([dotted.status, dotted.headers.location], [301, "/insider-trading/BRK-B"]);
  const none = await get("/insider-trading/NOPE", query);
  assert.equal(none.status, 404);
  assert.match(none.body, /<meta name="robots" content="noindex">/);
  const bad = await get("/insider-trading/%3Cx%3E", query);
  assert.equal(bad.status, 404);
  assert.equal(query.statements.filter(s => s.params?.[0] === "<X>").length, 0, "an invalid ticker never reaches the database");
});

test("person page: built from the profile, redirected to its canonical name slug", async () => {
  clearPublicPageCache();
  const issuer = {
    issuer_cik: "0000099999", ticker: "EXMP", issuer_name: "EXAMPLE CORP", latest_xml_url: null, latest_accession: "000999999926000001",
    transactions: 2, superseded: 0, filings: 2, purchases_count: 1, purchases_shares: "1500", purchases_value: "42000.00",
    sales_count: 1, sales_shares: "10", sales_value: "500.00", other_count: 0,
    first_transaction_date: new Date("2026-09-01T00:00:00Z"), last_transaction_date: new Date("2026-10-01T00:00:00Z"), last_published_at: new Date("2026-10-03T21:15:00Z"),
    d30_transactions: 1, d30_superseded: 0, d30_filings: 1, d30_purchases_count: 1, d30_purchases_shares: "1500", d30_purchases_value: "42000.00",
    d30_sales_count: 0, d30_sales_shares: "0", d30_sales_value: "0", d30_other_count: 0,
    d30_first_transaction_date: new Date("2026-10-01T00:00:00Z"), d30_last_transaction_date: new Date("2026-10-01T00:00:00Z"), d30_last_published_at: new Date("2026-10-03T21:15:00Z")
  };
  const query = fakeQuery({
    [OWNERS_TABLE_SQL]: { rows: [{ present: false }] },
    [PROFILE_SQL.single.companies]: { rows: [issuer] },
    [PROFILE_SQL.single.names]: { rows: [{ owner_cik: "0009876543", owner_name: "DOE JANE", last_published_at: new Date("2026-10-03T21:15:00Z"), last_transaction_date: null }] },
    [PROFILE_SQL.single.transactions]: { rows: [{ ...line("a:1"), superseded: false }] },
    [PROFILE_SQL.single.filings]: { rows: [] }
  });
  const bare = await get("/insiders/9876543", query);
  assert.deepEqual([bare.status, bare.headers.location], [301, "/insiders/9876543-doe-jane"]);
  const padded = await get("/insiders/0009876543-old-name", query);
  assert.deepEqual([padded.status, padded.headers.location], [301, "/insiders/9876543-doe-jane"]);
  const page = await get("/insiders/9876543-doe-jane", query);
  assert.equal(page.status, 200);
  assert.match(page.body, /<h1 id="pp-title">Doe Jane <span>insider trades\.<\/span><\/h1>/);
  assert.match(page.body, /filed under the name DOE JANE/);
  assert.match(page.body, /href="\/insider-trading\/EXMP"/);
  assert.match(page.body, /Follow Doe in Insidir/);
  assert.match(page.body, /"@type":"ProfilePage"/);
  assert.ok(!query.statements.some(s => /sec\.gov/.test(String(s.sql))), "no SEC work");
  const missing = await get("/insiders/123", fakeQuery());
  assert.equal(missing.status, 404);
  const zeros = await get("/insiders/0000", fakeQuery());
  assert.equal(zeros.status, 404);
});

test("hub page lists the biggest purchases and sales, the newest filings and the most active companies", async () => {
  clearPublicPageCache();
  const query = fakeQuery({
    [HUB_SQL.biggest("reported_purchase")]: { rows: [line("b:1")] },
    [HUB_SQL.biggest("reported_sale")]: { rows: [line("s:1", { category: "reported_sale", transaction_code: "S", owner_cik: null, owner_name: "FUND A FUND B" })] },
    [HUB_SQL.latest]: { rows: [line("l:1")] },
    [HUB_SQL.companies]: { rows: [{ ticker: "EXMP", issuer_name: "EXAMPLE CORP", filings: 3, buys: 1, sells: 2, last_published_at: new Date() }] },
    [HUB_SQL.totals]: { rows: [{ filings: 1200, companies: 640, buy_value: "52000000", sell_value: "910000000", last_published_at: new Date() }] }
  });
  const r = await get("/insider-trading", query);
  assert.equal(r.status, 200);
  assert.match(r.body, /Biggest open-market purchases/);
  assert.match(r.body, /Biggest open-market sales/);
  assert.match(r.body, /1,200/);
  assert.match(r.body, /\$910M/);
  assert.match(r.body, /<a href="\/insider-trading\/EXMP"><b>EXMP<\/b><span>Example Corp<\/span><em>3 filings · 1 bought · 2 sold<\/em><\/a>/);
  assert.match(r.body, /Fund A Fund B/, "a joint line without an owners list reads as filed");
  assert.match(r.body, /aria-current="page">Insider filings/);
  assert.match(HUB_SQL.biggest("reported_purchase"), /NOT t\.derivative/);
  const slash = await get("/insider-trading/", query);
  assert.deepEqual([slash.status, slash.headers.location], [301, "/insider-trading"]);
});

test("sitemaps: an index over pages, companies and insiders, absolute canonical URLs", async () => {
  clearPublicPageCache();
  const query = fakeQuery({
    [OWNERS_TABLE_SQL]: { rows: [{ present: false }] },
    [SITEMAP_SQL.companyCount]: { rows: [{ n: SITEMAP_PAGE + 1 }] },
    [SITEMAP_SQL.insiderCount(false)]: { rows: [{ n: 3 }] },
    [SITEMAP_SQL.companies]: { rows: [{ ticker: "EXMP", lastmod: new Date("2026-10-03T21:15:00Z") }, { ticker: "A&B", lastmod: null }] },
    [SITEMAP_SQL.insiders(false)]: { rows: [{ bare: "9876543", owner_name: "DOE JANE", lastmod: new Date("2026-10-03T21:15:00Z") }] }
  });
  const index = await get("/sitemap.xml", query);
  assert.equal(index.status, 200);
  assert.match(index.headers["content-type"], /application\/xml/);
  for (const f of ["pages", "companies-1", "companies-2", "insiders-1"]) assert.ok(index.body.includes(`<loc>https://insidir.example/sitemaps/${f}.xml</loc>`), f);
  assert.ok(!index.body.includes("insiders-2"));
  const pages = await get("/sitemaps/pages.xml", query);
  assert.ok(pages.body.includes("<loc>https://insidir.example/insider-trading</loc>"));
  assert.ok(!pages.body.includes("dashboard"));
  const companies = await get("/sitemaps/companies-2.xml", query);
  assert.ok(companies.body.includes("<url><loc>https://insidir.example/insider-trading/EXMP</loc><lastmod>2026-10-03</lastmod></url>"));
  assert.ok(companies.body.includes("A%26B"), "URLs are encoded and escaped");
  assert.deepEqual(query.statements.find(s => s.sql === SITEMAP_SQL.companies).params, [SITEMAP_PAGE, SITEMAP_PAGE]);
  const people = await get("/sitemaps/insiders-1.xml", query);
  assert.ok(people.body.includes("<loc>https://insidir.example/insiders/9876543-doe-jane</loc>"));
});

test("uncached renders are limited per client; non-GET and unknown paths fall through", async () => {
  clearPublicPageCache();
  const query = fakeQuery();
  let last;
  for (let i = 0; i <= RENDERS_PER_MINUTE; i++) {
    const res = fakeRes();
    await handlePublicPage({ method: "GET", headers: {} }, res, new URL("/insider-trading/T" + i, "http://x"), { query, requester: "one-crawler" });
    last = res;
  }
  assert.equal(last.status, 429);
  assert.equal(await handlePublicPage({ method: "POST", headers: {} }, fakeRes(), new URL("/insider-trading", "http://x"), { query }), false);
  assert.equal(await handlePublicPage({ method: "GET", headers: {} }, fakeRes(), new URL("/pricing.html", "http://x"), { query }), false);
  // The website preview has no database: only robots.txt is served.
  assert.equal(await handlePublicPage({ method: "GET", headers: {} }, fakeRes(), new URL("/insider-trading", "http://x"), {}), false);
});

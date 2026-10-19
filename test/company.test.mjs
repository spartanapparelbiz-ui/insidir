import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChart, getMarketChart, providerSymbol } from "../src/market.mjs";
import { trailingTwelveMonths, extractTtm, extractBalance, extractShares, extractSecProfile, extractFilings, reportingCurrency } from "../src/intelligence.mjs";
import { commonsFileUrl, parseProfile, parsePeople, namesMatch, profileQuery } from "../src/company-profile.mjs";
import { ownershipUrls, recentOwnershipFilings, summarizeOwnershipFiling, ownerRole, summarizePeople } from "../src/insiders.mjs";
import { parseHeadlines, parseSearchNews, focusHeadlines, relevanceTerms, mergeHeadlines, announcementsFromFilings } from "../src/news.mjs";
import { rankCompanies, browseCompanies } from "../src/search.mjs";
import { handleCompanyRoute, parseTicker, clientAddress, isCompanyRoute } from "../src/company-routes.mjs";
import { secReady } from "../src/config.mjs";
import { allowedExternalUrl } from "../src/external.mjs";

const CIK = "0001045810", ACC = "0001045810-26-000075";
const row = (val, start, end, form, filed = "2026-08-26", accn = ACC) => ({ val, start, end, form, filed, accn });

test("market chart keeps only published closes and computes session change from the previous close", () => {
  const payload = { chart: { result: [{
    meta: { symbol: "NVDA", currency: "USD", fullExchangeName: "NasdaqGS", exchangeTimezoneName: "America/New_York", regularMarketPrice: 228.52,
      chartPreviousClose: 226.32, regularMarketTime: 1791921600, currentTradingPeriod: { regular: { start: 1791898200, end: 1791921600 } } },
    timestamp: [1791898200, 1791898500, 1791898800, 1791899100],
    indicators: { quote: [{ close: [227.1, null, 228.0, 228.52] }] }
  }] } };
  const chart = normalizeChart(payload, "NVDA", "1D", 1791930000 * 1000);
  assert.deepEqual(chart.points.map(p => p[1]), [227.1, 228, 228.52], "null bars are dropped, not interpolated");
  assert.equal(chart.previousClose, 226.32);
  assert.equal(chart.rangeChange, 2.2);
  assert.equal(chart.marketState, "closed");
  assert.equal(normalizeChart(payload, "AAPL", "1D"), null, "a payload for another symbol is rejected");
  assert.equal(providerSymbol("BRK.B"), "BRK-B");
});

test("market endpoint maps a missing symbol to 404 and merges the 1D session quote into other ranges", async () => {
  const quote = (symbol, range) => ({ chart: { result: [{ meta: { symbol, currency: "USD", regularMarketPrice: 100, previousClose: range === "1d" ? 98 : undefined, chartPreviousClose: range === "1d" ? 98 : 80 },
    timestamp: [1, 2, 3], indicators: { quote: [{ close: [90, 95, 100] }] } }] } });
  const fetcher = async url => {
    if (url.includes("/ZZZZ?")) throw Object.assign(new Error("Upstream responded 404"), { upstreamStatus: 404 });
    return quote("ACME", new URL(url).searchParams.get("range"));
  };
  const chart = await getMarketChart("ACME", "1Y", fetcher);
  assert.equal(chart.change, 2);
  assert.equal(chart.changePercent, 2.041);
  assert.equal(chart.rangeChangePercent, 11.111);
  await assert.rejects(getMarketChart("ZZZZ", "1M", fetcher), e => e.status === 404);
  await assert.rejects(getMarketChart("ACME", "2Y", fetcher), e => e.status === 400);
});

test("TTM adds year-to-date to the last fiscal year and subtracts the prior-year comparable period", () => {
  const rows = [
    row(130, "2024-01-29", "2025-01-26", "10-K", "2025-02-26"),
    row(216, "2025-01-27", "2026-01-25", "10-K", "2026-02-25"),
    row(100, "2025-01-27", "2025-07-27", "10-Q", "2026-08-26"),
    row(140, "2026-01-26", "2026-07-26", "10-Q", "2026-08-26"),
    row(60, "2026-04-27", "2026-07-26", "10-Q", "2026-08-26")
  ];
  const result = trailingTwelveMonths(rows);
  assert.equal(result.value, 256);
  assert.equal(result.basis, "ttm");
  assert.equal(result.periodEnd, "2026-07-26");
  assert.equal(result.periodStart, "2025-07-28");
  const annualOnly = trailingTwelveMonths(rows.slice(0, 2));
  assert.equal(annualOnly.value, 216);
  assert.equal(annualOnly.basis, "fiscal-year");
  assert.equal(trailingTwelveMonths([row(60, "2026-04-27", "2026-07-26", "10-Q")]), null, "no annual anchor, no TTM");
});

test("TTM measures skip concepts a company stopped reporting years ago", () => {
  const facts = { facts: { "us-gaap": {
    Revenues: { units: { USD: [row(216, "2025-01-27", "2026-01-25", "10-K")] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [row(1, "2011-01-31", "2012-01-29", "10-K")] } },
    PaymentsToAcquireProductiveAssets: { units: { USD: [row(6, "2025-01-27", "2026-01-25", "10-K")] } },
    EarningsPerShareDiluted: { units: { "USD/shares": [row(4.9, "2025-01-27", "2026-01-25", "10-K")] } }
  } } };
  const ttm = extractTtm(facts, CIK);
  assert.equal(ttm.revenue.value, 216);
  assert.equal(ttm.capex.value, 6, "the current capex concept wins over a stale one");
  assert.equal(ttm.eps.value, 4.9);
  assert.equal(ttm.eps.unit, "USD/share");
  assert.ok(ttm.revenue.sources[0].startsWith("https://www.sec.gov/Archives/edgar/data/1045810/"));
});

test("balance sheet values for enterprise value all come from one reporting date", () => {
  const instant = (val, end, form = "10-Q") => ({ val, end, form, filed: "2026-08-26", accn: ACC });
  const facts = { facts: { "us-gaap": {
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [instant(10, "2026-01-25", "10-K"), instant(22, "2026-07-26")] } },
    DebtSecuritiesCurrent: { units: { USD: [instant(34, "2026-07-26")] } },
    MarketableSecuritiesCurrent: { units: { USD: [instant(49, "2025-10-26")] } },
    LongTermDebtNoncurrent: { units: { USD: [instant(32, "2026-07-26")] } },
    LongTermDebtCurrent: { units: { USD: [instant(1, "2026-07-26")] } }
  } } };
  const balance = extractBalance(facts, CIK);
  assert.equal(balance.asOf, "2026-07-26");
  assert.equal(balance.cashAndShortTermInvestments, 56, "stale marketable securities from another date are ignored");
  assert.equal(balance.totalDebt, 33);
});

test("shares outstanding prefer the newest reported count and fall back to net income over EPS", () => {
  const facts = { facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ val: 24.3e9, end: "2026-05-15", accn: ACC, filed: "2026-05-20" }, { val: 24.1e9, end: "2026-08-21", accn: ACC, filed: "2026-08-26" }] } } },
    "us-gaap": { CommonStockSharesOutstanding: { units: { shares: [{ val: 24.2e9, end: "2026-07-26", accn: ACC, filed: "2026-08-26" }] } } }
  } };
  assert.equal(extractShares(facts, CIK).value, 24.1e9);
  const implied = extractShares({ facts: {} }, CIK, { netIncome: { value: 100e9, periodEnd: "2026-06-30", sources: [] }, eps: { value: 8, periodEnd: "2026-06-30" } });
  assert.equal(implied.value, 12.5e9);
  assert.equal(implied.method, "implied");
});

test("IFRS foreign issuers use their reporting currency and 20-F annual reports", () => {
  const facts = { facts: { "ifrs-full": {
    Revenue: { units: { TWD: [row(2.9e12, "2025-01-01", "2025-12-31", "20-F")] } },
    Assets: { units: { TWD: [{ val: 6e12, end: "2025-12-31", form: "20-F", filed: "2026-04-16", accn: ACC }] } }
  } } };
  assert.equal(reportingCurrency(facts), "TWD");
  const ttm = extractTtm(facts, CIK);
  assert.equal(ttm.revenue.value, 2.9e12);
  assert.equal(ttm.revenue.unit, "TWD");
});

test("SEC profile reports exchange, headquarters and fiscal year end from EDGAR submissions", () => {
  const profile = extractSecProfile({ tickers: ["GOOGL", "GOOG"], exchanges: ["Nasdaq", "Nasdaq"], sicDescription: "Services-Computer Programming",
    fiscalYearEnd: "1231", stateOfIncorporation: "DE", category: "Large accelerated filer", website: "",
    addresses: { business: { city: "MOUNTAIN VIEW", stateOrCountry: "CA" } } }, "GOOG");
  assert.equal(profile.exchange, "NASDAQ");
  assert.equal(profile.headquarters.label, "Mountain View, CA");
  assert.equal(profile.fiscalYearEnd, "December 31");
  assert.equal(profile.website, null);
  const foreign = extractSecProfile({ addresses: { business: { city: "HSINCHU", country: "Taiwan", isForeignLocation: 1 } } }, "TSM");
  assert.equal(foreign.headquarters.label, "Hsinchu, Taiwan");
});

test("8-K filings carry item headlines and become announcements without the exhibits item", () => {
  const filings = extractFilings({ filings: { recent: { form: ["8-K", "10-Q"], accessionNumber: [ACC, "0001045810-26-000074"], filingDate: ["2026-08-26", "2026-08-26"],
    primaryDocument: ["nvda-8k.htm", "nvda-10q.htm"], items: ["2.02,9.01", ""] } } }, CIK, 60);
  assert.deepEqual(filings[0].items.map(i => i.code), ["2.02", "9.01"]);
  const [news] = announcementsFromFilings(filings);
  assert.equal(news.title, "Results of operations and financial condition");
  assert.equal(news.earnings, true);
});

test("Commons file names map to direct upload URLs and thumbnails", () => {
  assert.equal(commonsFileUrl("http://commons.wikimedia.org/wiki/Special:FilePath/NVIDIA%20logo.svg"), "https://upload.wikimedia.org/wikipedia/commons/a/a4/NVIDIA_logo.svg");
  assert.equal(commonsFileUrl("Jen-Hsun Huang 2025.jpg", 120), "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jen-Hsun_Huang_2025.jpg/120px-Jen-Hsun_Huang_2025.jpg");
  assert.equal(commonsFileUrl("../../etc/passwd"), null);
  assert.equal(commonsFileUrl("evil.html"), null);
});

test("Wikidata profile parsing picks the latest head count, the official site and the earliest founding year", () => {
  const b = (o) => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value }]));
  const payload = { results: { bindings: [
    b({ item: "http://www.wikidata.org/entity/Q182477", itemLabel: "Nvidia", itemDescription: "American multinational technology company", inception: "1993-04-05T00:00:00Z", employees: "36000", employeesDate: "2025-01-26T00:00:00Z", website: "https://www.nvidia.cn/", websiteLanguage: "http://www.wikidata.org/entity/Q7850", logo: "http://commons.wikimedia.org/wiki/Special:FilePath/NVIDIA%20logo.svg", article: "https://en.wikipedia.org/wiki/Nvidia", hqLabel: "Santa Clara" }),
    b({ item: "http://www.wikidata.org/entity/Q182477", employees: "42000", employeesDate: "2026-01-25T00:00:00Z", website: "https://www.nvidia.com/" })
  ] } };
  const profile = parseProfile(payload);
  assert.equal(profile.founded, 1993);
  assert.deepEqual(profile.employees, { value: 42000, asOf: "2026-01-25" });
  assert.equal(profile.website.label, "nvidia.com");
  assert.equal(profile.logo.url, "https://upload.wikimedia.org/wikipedia/commons/a/a4/NVIDIA_logo.svg");
  assert.equal(profile.wikipediaUrl, "https://en.wikipedia.org/wiki/Nvidia");
  assert.equal(parseProfile({ results: { bindings: [] } }), null);
  assert.match(profileQuery("0001045810"), /"1045810" "0001045810"/);
});

test("SEC reporting-owner names match Wikidata people only on surname plus given name", () => {
  const [jensen] = parsePeople({ results: { bindings: [{ person: { value: "http://www.wikidata.org/entity/Q305177" }, name: { value: "Jensen Huang" }, role: { value: "Chief Executive Officer" },
    photo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Jen-Hsun%20Huang%202025.jpg" }, aliases: { value: "Jen-Hsun Huang|Jensen" } }] } });
  assert.equal(jensen.photo.src, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jen-Hsun_Huang_2025.jpg/120px-Jen-Hsun_Huang_2025.jpg");
  assert.equal(namesMatch("HUANG JEN HSUN", jensen), true);
  assert.equal(namesMatch("HUANG MICHAEL", jensen), false);
  assert.equal(namesMatch("KRESS COLETTE", jensen), false);
  assert.equal(namesMatch("COOK TIMOTHY D", { name: "Tim Cook" }), true);
});

test("ownership filings resolve raw XML beside EDGAR's styled rendering and exclude other issuers' documents", () => {
  const urls = ownershipUrls(CIK, "0001197647-26-000011", "xslF345X06/wk-form4_1791579847.xml");
  assert.equal(urls.xmlUrl, "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000011/wk-form4_1791579847.xml");
  assert.equal(urls.viewUrl, "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000011/xslF345X06/wk-form4_1791579847.xml");
  assert.equal(ownershipUrls(CIK, "0001197647-26-000011", "../../secret.xml"), null);
  const filings = recentOwnershipFilings({ filings: { recent: { form: ["4", "8-K", "4/A"], accessionNumber: ["0001197647-26-000011", ACC, "0002152188-26-000007"],
    filingDate: ["2026-10-09", "2026-10-08", "2026-10-13"], primaryDocument: ["xslF345X06/form4.xml", "x.htm", "xslF345X06/form4a.xml"] } } }, CIK);
  assert.deepEqual(filings.map(f => f.form), ["4", "4/A"]);
});

test("insider filing summaries net open-market trades and keep role, holdings and value", () => {
  const parsed = { owners: [{ name: "Kress Colette", cik: "0001536186", isOfficer: true, officerTitle: "EVP & Chief Financial Officer", isDirector: false }],
    transactions: [
      { transactionDate: "2026-09-17", code: "M", acquiredDisposed: "A", derivative: false, shares: 75665, pricePerShare: 0, estimatedValue: 0, sharesAfter: 840768, category: "other" },
      { transactionDate: "2026-09-17", code: "S", acquiredDisposed: "D", derivative: false, shares: 75665, pricePerShare: 215.34, estimatedValue: 16293923.1, sharesAfter: 765103, category: "reported_sale" }
    ] };
  const summary = summarizeOwnershipFiling(parsed, { accession: "a", form: "4", filedAt: "2026-09-18", viewUrl: "https://www.sec.gov/x", xmlUrl: "https://www.sec.gov/x.xml" });
  assert.equal(summary.kind, "sale");
  assert.equal(summary.netShares, -75665, "the option exercise does not cancel out the open-market sale");
  assert.equal(summary.value, 16293923.1);
  assert.equal(summary.sharesAfter, 765103);
  assert.equal(summary.owner.role, "EVP & Chief Financial Officer");
  assert.equal(ownerRole({ isDirector: true, isOfficer: true, officerTitle: "President and CEO" }), "President and CEO · Director");
  assert.equal(summarizePeople([summary, { ...summary, filedAt: "2026-08-01" }])[0].filings, 2);
});

test("headlines link to publishers and only stories naming the company are kept", () => {
  const xml = `<rss><channel><item><title>Nvidia Stocks Fall</title><link>https://example.com/a?.tsrc=rss</link><pubDate>Tue, 13 Oct 2026 19:09:01 +0000</pubDate><description>Chip news</description></item>
    <item><title>Joby Aviation Stock</title><link>https://www.fool.com/b</link><pubDate>Tue, 13 Oct 2026 18:00:00 +0000</pubDate><description>eVTOL</description></item>
    <item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const rss = parseHeadlines(xml);
  assert.equal(rss.length, 2);
  assert.equal(rss[0].url, "https://example.com/a");
  const search = parseSearchNews({ news: [{ title: "Is Coca-Cola (KO) Outpacing Peers?", link: "https://finance.yahoo.com/c", publisher: "Zacks", providerPublishTime: 1791900000 },
    { title: "A dividend stock to own", link: "https://finance.yahoo.com/d", publisher: "TIKR", providerPublishTime: 1791800000 }] });
  assert.equal(search[0].publisher, "Zacks");
  assert.equal(focusHeadlines(rss, relevanceTerms("NVDA", "NVIDIA CORP")).length, 1);
  const ko = focusHeadlines(search, relevanceTerms("KO", "COCA COLA CO"));
  assert.deepEqual(ko.map(h => h.publisher), ["Zacks"], "two-letter tickers only match in (KO) form or by company name");
  assert.deepEqual(relevanceTerms("GOOGL", "Alphabet Inc."), ["GOOGL", "ALPHABET", "GOOGLE"]);
  assert.equal(mergeHeadlines(search, search).length, 2);
});

test("company search ranks exact tickers, keeps share classes and matches names", () => {
  const rows = [["NVDA", "NVIDIA CORP", "1045810"], ["GOOGL", "Alphabet Inc.", "1652044"], ["GOOG", "Alphabet Inc.", "1652044"], ["KO", "COCA COLA CO", "21344"], ["COKE", "Coca-Cola Consolidated, Inc.", "317540"], ["F", "FORD MOTOR CO", "37996"], ["TSLA", "Tesla, Inc.", "1318605"], ["DJT", "Trump Media & Technology Group Corp.", "1849635"]]
    .map(([ticker, name, cik], rank) => ({ ticker, name, cik: cik.padStart(10, "0"), key: name.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(), rank }));
  assert.equal(rankCompanies(rows, "nvda")[0].ticker, "NVDA");
  assert.deepEqual(rankCompanies(rows, "goog").map(r => r.ticker), ["GOOG", "GOOGL"]);
  assert.equal(rankCompanies(rows, "alphabet").length, 1, "a name search lists an issuer once");
  assert.equal(rankCompanies(rows, "coca")[0].ticker, "KO");
  assert.equal(rankCompanies(rows, "F")[0].ticker, "F");
  assert.equal(rankCompanies(rows, "tesla")[0].ticker, "TSLA");
  assert.equal(rankCompanies(rows, "trump")[0].ticker, "DJT");
  assert.deepEqual(rankCompanies(rows, ""), []);
  assert.equal(rankCompanies(rows,"a",1,1).length,0, "search offsets apply after ranking");
});

test("SEC-wide directory pages deterministically through the full ticker mapping, not imported Form 4 records", async () => {
  const index = {
    0:{cik_str:1318605,ticker:"TSLA",title:"Tesla, Inc."},
    1:{cik_str:1849635,ticker:"DJT",title:"Trump Media & Technology Group Corp."},
    2:{cik_str:320193,ticker:"AAPL",title:"Apple Inc."},
    3:{cik_str:1652044,ticker:"GOOG",title:"Alphabet Inc."},
    4:{cik_str:1652044,ticker:"GOOGL",title:"Alphabet Inc."}
  };
  const fetcher = async () => index;
  const first = await browseCompanies({offset:0,limit:2,fetcher});
  assert.equal(first.total,5);
  assert.deepEqual(first.items.map(x=>x.ticker),["GOOG","GOOGL"]);
  assert.equal(first.nextOffset,2);
  const second = await browseCompanies({offset:first.nextOffset,limit:2,fetcher});
  assert.deepEqual(second.items.map(x=>x.ticker),["AAPL","TSLA"]);
  const last = await browseCompanies({offset:4,limit:2,fetcher});
  assert.deepEqual(last.items.map(x=>x.ticker),["DJT"]);
  assert.equal(last.hasMore,false);
  assert.equal(last.nextOffset,null);
});

test("company routes validate input before any upstream request", async () => {
  const call = async path => {
    const res = { status: 0, headers: {}, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b; } };
    try {
      const handled = await handleCompanyRoute({ method: "GET", socket: { remoteAddress: "test" } }, res, new URL(path, "http://x"));
      return handled === false ? { handled: false } : { status: res.status, body: JSON.parse(res.body), headers: res.headers };
    } catch (e) { return { status: e.status, error: e.message }; }
  };
  assert.deepEqual(await call("/v1/unknown"), { handled: false });
  assert.equal((await call("/v1/market/chart?ticker=NVDA&range=2Y")).status, 400);
  assert.equal((await call("/v1/company/profile?ticker=bad!ticker")).status, 400);
  const empty = await call("/v1/search?q=");
  assert.deepEqual(empty.body, { items: [] });
  assert.equal(isCompanyRoute("/v1/company/directory"), true);
  // The media batch validates its lists before it needs the SEC ticker file.
  assert.equal(isCompanyRoute("/v1/media"), true);
  assert.equal(isCompanyRoute("/v1/media/" + "a".repeat(64) + ".webp"), true);
  assert.equal(isCompanyRoute("/v1/media/x"), false);
  for (const path of ["/v1/media", "/v1/media?tickers=bad!", "/v1/media?people=AAPL", "/v1/media?ciks=0",
    "/v1/media?tickers=" + Array.from({ length: 61 }, (_, i) => "T" + i).join(","), "/v1/media?people=" + Array.from({ length: 101 }, (_, i) => (i + 1) + ":AAPL").join(",")])
    assert.equal((await call(path)).status, 400, path);
  if (!secReady()) assert.deepEqual(await call("/v1/media?tickers=AAPL"), { status: 503, error: "SEC_USER_AGENT not configured for official SEC research" });
  assert.equal(parseTicker("brk.b"), "BRK-B");
  assert.equal(clientAddress({ headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }, socket: { remoteAddress: "10.0.0.1" } }), "203.0.113.9");
  assert.equal(clientAddress({ headers: {}, socket: { remoteAddress: "10.0.0.1" } }), "10.0.0.1");
  assert.throws(() => parseTicker("../etc"), e => e.status === 400);
});

test("open image URLs: a day of caching with an ETag, takedowns answer 404, and unknown addresses are remembered and limited per client", async () => {
  const store = await import("../src/media-store.mjs");
  const call = async (path, ip = "192.0.2.10", headers = {}) => {
    const res = { status: 0, headers: {}, body: null, writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b ?? null; } };
    try { await handleCompanyRoute({ method: "GET", headers, socket: { remoteAddress: ip } }, res, new URL(path, "http://x")); return { status: res.status, headers: res.headers, body: res.body }; }
    catch (e) { return { status: e.status, error: e.message }; }
  };
  const saved = await store.putMedia({ bytes: Buffer.from("company route test image"), type: "png", width: 1, height: 1 });
  let r = await call(saved.url);
  assert.equal(r.status, 200);
  assert.equal(r.headers["Cache-Control"], "public, max-age=86400", "no longer immutable for a year: a takedown must reach caches");
  assert.equal(r.headers.ETag, '"' + saved.sha + '"');
  assert.equal(r.headers["Content-Type"], "image/png");
  r = await call(saved.url, "192.0.2.10", { "if-none-match": 'W/"' + saved.sha + '"' });
  assert.deepEqual([r.status, r.body], [304, null], "revalidation is cheap");
  // Unknown addresses: 404, remembered for a few minutes (one lookup each), at most 120 a minute per client.
  const unknown = n => "/v1/media/" + n.toString(16).padStart(64, "0") + ".webp";
  const misses = store.storeStats().misses;
  assert.equal((await call(unknown(1))).status, 404);
  assert.equal(store.storeStats().misses, misses + 1);
  assert.equal((await call(unknown(1))).status, 404);
  assert.equal(store.storeStats().misses, misses + 1, "asked again: answered from memory");
  for (let i = 2; i <= 119; i++) assert.equal((await call(unknown(i))).status, 404);
  assert.deepEqual(await call(unknown(120)), { status: 429, error: "Too many requests for missing images. Try again shortly." });
  assert.equal(store.storeStats().misses, misses + 119, "the 121st miss is refused before any lookup");
  assert.equal((await call(unknown(1))).status, 429, "its misses stay refused for the minute");
  assert.equal(store.storeStats().misses, misses + 119, "still without a lookup");
  assert.equal((await call(saved.url, "192.0.2.10")).status, 200, "images held in memory are still served to that client");
  assert.equal((await call(saved.url, "192.0.2.10", { "if-none-match": '"' + saved.sha + '"' })).status, 304);
  assert.equal((await call(unknown(121), "192.0.2.11")).status, 404, "other clients are not affected");
  // An address stored later is no longer 'missing'.
  const late = Buffer.from("stored after it was asked for");
  const lateSha = (await import("node:crypto")).createHash("sha256").update(late).digest("hex");
  assert.equal((await call("/v1/media/" + lateSha + ".png", "192.0.2.12")).status, 404);
  await store.putMedia({ bytes: late, type: "png" });
  assert.equal((await call("/v1/media/" + lateSha + ".png", "192.0.2.12")).status, 200);
  // A blocked address is never served again, not even as a 304.
  await store.blockMedia(saved.sha, "test takedown");
  assert.equal((await call(saved.url, "192.0.2.13")).status, 404);
  assert.equal((await call(saved.url, "192.0.2.13", { "if-none-match": '"' + saved.sha + '"' })).status, 404);
});

test("external fetches are limited to the allowlisted public data hosts", () => {
  for (const ok of ["https://query1.finance.yahoo.com/v8/finance/chart/NVDA", "https://query.wikidata.org/sparql", "https://en.wikipedia.org/api/rest_v1/page/summary/Nvidia"]) assert.equal(allowedExternalUrl(ok), true, ok);
  for (const bad of ["http://query1.finance.yahoo.com/x", "https://query1.finance.yahoo.com.evil.com/x", "https://user:pw@en.wikipedia.org/", "https://example.com/", "file:///etc/passwd"]) assert.equal(allowedExternalUrl(bad), false, bad);
});

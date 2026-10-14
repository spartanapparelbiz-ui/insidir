/* Insidir overview (dashboard.html) browser test.

   Opens the dashboard in headless Chromium against mocked /v1 responses and verifies that it
   makes sense to a paying reader:
     - every section renders the fixture's real rows (insider flow, watchlist, notes, insider
       transactions, filings, data source, reporting people) with portraits or monogram initials;
     - insider flow is exact and computed from the loaded rows: purchase and sale totals with counts
       and shares, the net value, other codes, the median filing lag, value by trade date (green
       purchases above the zero line, red sales below, a readout on hover and focus, a table of
       every day), sales and purchases by company and the largest reported transactions;
     - the transactions table prints signed shares, price per share, value, trade and filing dates
       with the lag, and the SEC meaning of each code; purchases are green, sales red, and the
       orange accent appears nowhere on the page except the logo's full stop;
     - the company search submits to company.html?ticker=;
     - the insider-activity filters change the rows;
     - watchlist rows link to company.html?ticker= and show that ticker's latest transaction, looked
       up per ticker (/v1/transactions?ticker=X&limit=1) when it is older than the market-wide feed;
     - the flow says which transactions it covers, and the data-source panel reads every ingest
       status the engine writes (success, partial, running, error);
     - following a person link (dashboard → people.html?q=…, or a Familiar faces tile) leaves the
       search result inside the viewport with focus on the directory's status line;
     - portraits fall back to monogram initials when Wikimedia is unreachable; initials are right for
       hyphenated and apostrophe names; the people directory pages 24 at a time;
     - empty responses and 503 errors show clear messages (with a working "Try again" in every
       module, including reporting people and the data source) and never crash;
     - 401 sends the browser to signin.html?next=dashboard.html and 402 to subscribe.html?next=…;
     - every link on the page returns 200 from the server and none points to the landing page;
     - no raster image is upscaled (native pixels ≥ 2× the rendered size, cover-adjusted);
     - no horizontal overflow at 360, 390, 768, 1024 and 1440px, standalone touch targets ≥ 24px on
       phones, research-note text in one aligned column, and no console errors.

   Usage: node scripts/dashboard-check.mjs [--shots dir] [--widths 360,390,768,1024,1440]
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const WIDTHS = opt("widths", "360,390,768,1024,1440").split(",").map(Number).filter(Boolean);
const SHOTS = opt("shots", "");
const passed = [], failed = [];
const check = (ok, label, detail) => { if (ok) passed.push(label); else failed.push(label + (detail === undefined ? "" : " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)))); return ok; };

/* ---------- fixtures (mock only; production reads the real routes) ---------- */
const source = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
const filings = [
  { accession: "000032019326000001", ticker: "AAPL", issuer_name: "Apple Inc.", form_type: "4", published_at: "2026-09-14T20:00:00Z", source_url: source, is_amendment: false, owner_names: ["COOK TIMOTHY D"] },
  { accession: "000104581026000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", form_type: "4", published_at: "2026-09-12T20:00:00Z", source_url: source, is_amendment: false, owner_names: ["HUANG JEN HSUN"] },
  { accession: "000078901926000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", form_type: "4/A", published_at: "2026-09-10T20:00:00Z", source_url: source, is_amendment: true, owner_names: ["NADELLA SATYA"] }
];
const trades = [
  { id: 11, accession: "000032019326000001", ticker: "AAPL", issuer_name: "Apple Inc.", owner_name: "COOK TIMOTHY D", owner_cik: "0001214156", transaction_date: "2026-09-12", transaction_code: "S", category: "reported_sale", shares: 12500, price: 26, estimated_value: 325000, published_at: "2026-09-14T20:00:00Z", source_url: source },
  { id: 12, accession: "000104581026000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", owner_name: "HUANG JEN HSUN", owner_cik: "0001049502", transaction_date: "2026-09-10", transaction_code: "P", category: "reported_purchase", shares: 1500, price: 28, estimated_value: 42000, published_at: "2026-09-12T20:00:00Z", source_url: source },
  { id: 13, accession: "000078901926000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", owner_name: "NADELLA SATYA", owner_cik: "0001513142", transaction_date: "2026-09-08", transaction_code: "A", category: "other", shares: 900, price: null, estimated_value: null, published_at: "2026-09-10T20:00:00Z", source_url: source },
  { id: 14, accession: "000032019326000004", ticker: "AAPL", issuer_name: "Apple Inc.", owner_name: "OTHER PUBLIC FILER", owner_cik: "0000067890", transaction_date: "2026-09-01", transaction_code: "S", category: "reported_sale", shares: 100, price: 20, estimated_value: 2000, published_at: "2026-09-10T20:00:00Z", source_url: source }
];
// The market-wide feed (/v1/transactions?limit=100) is a window of the newest records; a ticker
// lookup reaches older ones. This TSLA sale is only reachable through ?ticker=TSLA.
const olderTrades = [
  { id: 9, accession: "000131860526000009", ticker: "TSLA", issuer_name: "Tesla, Inc.", owner_name: "MUSK ELON", owner_cik: "0001494730", transaction_date: "2026-06-02", transaction_code: "S", category: "reported_sale", shares: 1000, price: 250, estimated_value: 250000, published_at: "2026-06-04T20:00:00Z", source_url: source }
];
const people = [
  { owner_name: "COOK TIMOTHY D", owner_cik: "0001214156", ticker: "AAPL", filings: 3, last_transaction_date: "2026-09-12" },
  { owner_name: "HUANG JEN HSUN", owner_cik: "0001049502", ticker: "NVDA", filings: 2, last_transaction_date: "2026-09-10" },
  { owner_name: "NADELLA SATYA", owner_cik: "0001513142", ticker: "MSFT", filings: 1, last_transaction_date: "2026-09-08" },
  { owner_name: "OTHER PUBLIC FILER", owner_cik: "0000067890", ticker: "AAPL", filings: 1, last_transaction_date: "2026-09-01" }
];
const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, currentPeriodEnd: "2026-11-14T00:00:00Z" } };
const FULL = {
  "/v1/me": me,
  "/v1/transactions": { items: trades },
  "/v1/filings": { items: filings },
  "/v1/status": { engine: "online", sec: "configured", filings: 1234, lastIngest: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:12:00Z", status: "success" }, paid: false },
  "/v1/me/watchlist": { items: [{ ticker: "AAPL", created_at: "2026-09-01T00:00:00Z" }, { ticker: "NVDA", created_at: "2026-08-01T00:00:00Z" }, { ticker: "TSLA", created_at: "2026-08-01T00:00:00Z" }, { ticker: "IBM", created_at: "2026-07-01T00:00:00Z" }] },
  "/v1/me/research-decisions": { items: [{ ticker: "AAPL", review_status: "researching", notes: "Reading the latest 10-K before deciding.", created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }, { ticker: "BRK.B", review_status: "watching", notes: "Annual letter first.", created_at: "2026-08-02T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" }] },
  "/v1/insiders": { items: people },
  "/v1/me/people": { items: [{ ...people[0], created_at: "2026-09-03T00:00:00Z" }] },
  "/v1/search": { items: [] }
};
const EMPTY = {
  "/v1/me": me, "/v1/transactions": { items: [] }, "/v1/filings": { items: [] }, "/v1/status": { engine: "online", sec: "configured", filings: 0, lastIngest: null },
  "/v1/me/watchlist": { items: [] }, "/v1/me/research-decisions": { items: [] }, "/v1/insiders": { items: [] }, "/v1/me/people": { items: [] }, "/v1/search": { items: [] }
};

/* ---------- harness ---------- */
const server = createServer((req, res) => { serveStatic(req, res).then(found => { if (!found) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });

/* routes: a function (path, method) → {status, body} */
async function open(width, respond, { path = "/dashboard.html", reducedMotion = "no-preference", blockImages = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion });
  const api = [];
  await context.route("**/v1/**", async route => {
    const url = new URL(route.request().url());
    api.push(route.request().method() + " " + url.pathname + url.search);
    const out = respond(url.pathname, route.request().method(), url);
    await route.fulfill({ status: out.status, contentType: "application/json", body: JSON.stringify(out.body) });
  });
  // Commons thumbnails: an image with the real thumbnail's pixel size (250px wide), so sharpness is measurable offline.
  await context.route(/upload\.wikimedia\.org|thumb\.wikimedia\.org/, route => {
    if (blockImages) return route.abort("blockedbyclient");
    const w = Number((/\/(\d+)px-[^/]+$/.exec(route.request().url()) || [])[1]) || 2000;
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(w * 1.3)}" viewBox="0 0 10 13"><rect width="10" height="13" fill="#555"/></svg>` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push("HTTP " + r.status() + " " + r.url().replace(base, "")); });
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { context, page, errors, api };
}
/* Mirrors the API's query handling: /v1/transactions?ticker=X&limit=N filters every record,
   /v1/insiders?q= matches names like the server's ILIKE '%q%'. */
const fixture = data => (path, method, url) => {
  if (method !== "GET") return { status: 200, body: { saved: true } };
  const q = url?.searchParams;
  if (path === "/v1/transactions" && q?.has("ticker")) {
    const all = [...(data["/v1/transactions"]?.items || []), ...(data.older || [])].filter(x => x.ticker === q.get("ticker"));
    return { status: 200, body: { items: all.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, Number(q.get("limit")) || 30) } };
  }
  if (path === "/v1/insiders" && q?.get("q")) return { status: 200, body: { items: (data[path]?.items || []).filter(p => p.owner_name.toUpperCase().includes(q.get("q").toUpperCase())) } };
  return path in data ? { status: 200, body: data[path] } : { status: 404, body: { error: "Not found" } };
};
FULL.older = olderTrades;
// A large directory for the paging check (mock only).
const MANY = { ...FULL, "/v1/insiders": { items: Array.from({ length: 100 }, (_, i) => ({ owner_name: "FIXTURE FILER " + String(i + 1).padStart(3, "0"), owner_cik: String(9000000 + i), ticker: ["AAPL", "NVDA", "MSFT", "TSLA"][i % 4], filings: 1, last_transaction_date: "2026-09-01" })) } };
const settle = async page => {
  await page.waitForFunction(() => !/Loading/.test(document.querySelector("#v3-trades")?.textContent || "Loading") && !/Loading/.test(document.querySelector("#v3-filings")?.textContent || "Loading") && !/Loading|Checking/.test(document.querySelector("#v3-watchlist")?.textContent || "Loading") && !/Loading/.test(document.querySelector("#v10-people-preview")?.textContent || "Loading") && !/Checking/.test(document.querySelector("#v4-filing-count")?.textContent || "Checking"), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
};
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "");

try {
  /* ---------- 1. Full data at 1440 ---------- */
  {
    const { context, page, errors, api } = await open(1440, fixture(FULL));
    await settle(page);
    const H = await page.evaluate(() => ({
      greeting: document.querySelector("[data-greeting]")?.textContent || "",
      date: document.querySelector("#v3-current-date")?.textContent || "",
      search: !!document.querySelector("#v3-search #v3-ticker") && getComputedStyle(document.querySelector("#v3-ticker")).visibility !== "hidden",
      shortcuts: [...document.querySelectorAll(".rd-shortcuts a")].map(a => a.getAttribute("href")),
      order: [...document.querySelectorAll("#rd-kpis,#rd-daily-chart,#rd-companies,#rd-largest,#v3-watchlist,#v3-notes,#v3-trades,#v3-filings,#v4-data-state,#v10-people-preview")].map(e => e.id),
      decorativePhotos: document.querySelectorAll('.app-main img[src*="assets/img/"]').length
    }));
    check(/^Good (morning|afternoon|evening)\.$/.test(H.greeting), "greeting is set from the reader's local time", H.greeting);
    check(/\d{4}/.test(H.date), "topline shows today's date", H.date);
    check(H.search, "company search is on the page");
    check(JSON.stringify(H.shortcuts) === JSON.stringify(["explore.html", "filings.html", "people.html", "watchlist.html", "alerts.html", "research.html"]), "shortcut row links Companies, SEC filings, People, Watchlist, Alerts, Research desk", H.shortcuts);
    check(JSON.stringify(H.order) === JSON.stringify(["rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-watchlist", "v3-notes", "v3-trades", "v3-filings", "v4-data-state", "v10-people-preview"]), "sections appear in reading order: flow (totals, by date, by company, largest), watchlist, notes, transactions, filings, status, people", H.order);
    check(H.decorativePhotos === 0, "no decorative photographs on the dashboard", H.decorativePhotos);
    for (const route of ["/v1/transactions?limit=100", "/v1/filings?limit=12", "/v1/me/watchlist", "/v1/me/research-decisions", "/v1/status", "/v1/insiders"]) check(api.some(a => a.endsWith(" " + route) || a.includes(" " + route)), "dashboard requests " + route, api);

    // Watchlist: each saved ticker → company report, with its latest imported transaction.
    const watch = await page.$$eval("#v3-watchlist .rd-row", rows => rows.map(r => ({ href: r.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ") })));
    check(watch.length === 4, "watchlist shows every saved ticker (4)", watch);
    check(watch[0]?.href === "company.html?ticker=AAPL" && /Sale/i.test(watch[0]?.text) && /Timothy D\. Cook/.test(watch[0]?.text) && /Sep 12, 2026/.test(watch[0]?.text) && /\$325,000/.test(watch[0]?.text), "AAPL watchlist row links its report and shows its latest transaction (Cook sale, Sep 12, 2026, $325,000)", watch[0]);
    check(/12,500 sh × \$26\.00/.test(watch[0]?.text) && /filed Sep 14, 2026 \(\+2 days\)/.test(watch[0]?.text), "watchlist row prints shares × price and the filing date with its lag", watch[0]?.text);
    check(watch[1]?.href === "company.html?ticker=NVDA" && /Purchase/i.test(watch[1]?.text) && /Huang/.test(watch[1]?.text), "NVDA watchlist row shows its latest transaction (Huang purchase)", watch[1]);
    check(watch[2]?.href === "company.html?ticker=TSLA" && /Sale/i.test(watch[2]?.text) && /Elon Musk/.test(watch[2]?.text) && /Jun 2, 2026/.test(watch[2]?.text) && /\$250,000/.test(watch[2]?.text), "a watched ticker outside the market-wide feed shows its own latest transaction (Musk sale, Jun 2, 2026)", watch[2]);
    check(watch[3]?.href === "company.html?ticker=IBM" && /No imported insider transactions yet/.test(watch[3]?.text), "a watched ticker with no records at all says so plainly", watch[3]);
    const lookups = api.filter(a => /\/v1\/transactions\?ticker=/.test(a));
    check(JSON.stringify(lookups.sort()) === JSON.stringify(["GET /v1/transactions?ticker=IBM&limit=1", "GET /v1/transactions?ticker=TSLA&limit=1"]), "per-ticker lookups only for watched tickers missing from the market-wide feed (TSLA, IBM)", lookups);

    // Research notes.
    const notes = await page.$$eval("#v3-notes .rd-row", rows => rows.map(r => ({ href: r.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ") })));
    check(notes.length === 2 && notes[0].href === "research.html?ticker=AAPL" && /Researching/i.test(notes[0].text) && /latest 10-K/.test(notes[0].text) && /Sep 2, 2026/.test(notes[0].text), "research note row shows status, note text and date and opens the research desk", notes);
    const noteX = await page.$$eval("#v3-notes .rd-row__detail", d => d.map(e => Math.round(e.getBoundingClientRect().left)));
    check(noteX.length === 2 && noteX[0] === noteX[1], "research-note text starts at the same x on every row", noteX);

    // Latest filings.
    const fil = await page.$$eval("#v3-filings tr", rows => rows.map(r => ({ links: [...r.querySelectorAll("a")].map(a => a.getAttribute("href")), text: r.innerText.replace(/\s+/g, " ") })));
    check(fil.length === 3, "latest filings lists the 3 fixture filings", fil.length);
    check(fil[0]?.links.includes("company.html?ticker=AAPL") && fil[0]?.links.includes("filing.html?accession=000032019326000001") && fil[0]?.links.includes(source), "filing row links the company report, the filing page and the SEC original", fil[0]);
    check(/Apple Inc\./.test(fil[0]?.text) && /Timothy D\. Cook/.test(fil[0]?.text) && /Sep 14, 2026/.test(fil[0]?.text), "filing row names issuer, reporting person and publication date", fil[0]?.text);
    check(/amended/.test(fil[2]?.text || ""), "amended filings are marked", fil[2]?.text);

    // Insider activity and its filters.
    const rows = async () => page.$$eval("#v3-trades tr", r => r.map(x => x.innerText.replace(/\s+/g, " ")));
    let t = await rows();
    check(t.length === 4, "insider transactions show all 4 fixture transactions", t);
    check(/Timothy D\. Cook/.test(t[0]) && /AAPL/.test(t[0]) && /Sep 12, 2026/.test(t[0]) && /Sale · S/i.test(t[0]) && /\$325,000/.test(t[0]), "transaction row: person, ticker, trade date, type + code, value", t[0]);
    check(/\u221212,500/.test(t[0]) && /\$26\.00/.test(t[0]) && /Sep 14, 2026/.test(t[0]) && /\+2 days/.test(t[0]), "transaction row prints signed shares (−12,500), the price per share ($26.00), the filing date and the lag (+2 days)", t[0]);
    check(/No price/.test(t[2]) && /Not reported/.test(t[2]) && / 900 /.test(t[2]), "a transaction without a price says so instead of inventing a value (and a share count with no reported direction carries no sign)", t[2]);
    const codeTitle = await page.getAttribute("#v3-trades tr:first-child .rd-type", "title");
    check(codeTitle === "S — Open market or private sale", "the code carries its SEC meaning", codeTitle);
    const tradeLinks = await page.$$eval("#v3-trades tr:first-child a", a => a.map(x => x.getAttribute("href")));
    check(tradeLinks.includes("people.html?q=COOK%20TIMOTHY%20D#v10-directory") && tradeLinks.includes("company.html?ticker=AAPL") && tradeLinks.includes("filing.html?accession=000032019326000001"), "transaction row links the person, the company and the filing", tradeLinks);
    check((await text(page, '[data-filter="all"]')).includes("4") && (await text(page, '[data-filter="reported_purchase"]')).includes("1") && (await text(page, '[data-filter="reported_sale"]')).includes("2") && (await text(page, '[data-filter="other"]')).includes("1"), "filter buttons show real counts (4 / 1 / 2 / 1)");
    await page.click('[data-filter="reported_purchase"]');
    t = await rows();
    check(t.length === 1 && /NVDA/.test(t[0]) && /Purchase/i.test(t[0]), "Purchases filter shows only purchases", t);
    check(await page.getAttribute('[data-filter="reported_purchase"]', "aria-pressed") === "true", "pressed filter is announced with aria-pressed");
    await page.click('[data-filter="reported_sale"]');
    t = await rows();
    check(t.length === 2 && t.every(r => /Sale/i.test(r)), "Sales filter shows only sales", t);
    await page.click('[data-filter="other"]');
    t = await rows();
    check(t.length === 1 && /MSFT/.test(t[0]) && /Other · A/i.test(t[0]), "Other codes filter shows the grant (code A)", t);
    await page.click('[data-filter="all"]');
    check((await rows()).length === 4, "All restores every row");

    // Insider flow: exact totals from the four fixture rows.
    const flow = await page.evaluate(() => ({
      scope: document.getElementById("rd-flow-scope").textContent,
      kpis: Object.fromEntries([...document.querySelectorAll(".rd-kpi")].map(k => [k.querySelector(".rd-kpi__label").textContent.trim(), k.querySelector(".rd-kpi__value").textContent.trim() + " | " + k.querySelector(".rd-kpi__note").textContent.trim()])),
      days: [...document.querySelectorAll("#rd-daily-chart .rd-day")].map(d => d.getAttribute("aria-label")),
      up: [...document.querySelectorAll("#rd-daily-chart .rd-day__bar--up")].map(b => getComputedStyle(b).backgroundColor),
      down: [...document.querySelectorAll("#rd-daily-chart .rd-day__bar--down")].map(b => getComputedStyle(b).backgroundColor),
      zero: !!document.querySelector("#rd-daily-chart .rd-dchart__grid--zero"),
      companies: [...document.querySelectorAll("#rd-companies .rd-co__row")].map(r => r.innerText.replace(/\s+/g, " ")),
      largest: [...document.querySelectorAll("#rd-largest .rd-big")].map(r => r.innerText.replace(/\s+/g, " "))
    }));
    check(flow.scope === "All 4 imported transactions · traded Sep 1 – Sep 12, 2026 · 3 companies · 4 reporting people.", "the flow names exactly which transactions it covers", flow.scope);
    check(flow.kpis.Purchases === "$42,000 | 1 purchase · 1,500 shares", "purchases total: value, count and shares", flow.kpis.Purchases);
    check(flow.kpis.Sales === "$327,000 | 2 sales · 12,600 shares", "sales total: value, count and shares", flow.kpis.Sales);
    check(flow.kpis["Net value"] === "\u2212$285,000 | Sales exceeded purchases", "net value is purchases minus sales, signed and explained", flow.kpis["Net value"]);
    check(flow.kpis["Other codes"] === "1 | Codes A (1)", "transactions under other codes are counted, not valued", flow.kpis["Other codes"]);
    check(flow.kpis["Filing lag"] === "2 days | Median, trade to SEC publication · range 2–9 days", "filing lag: median and range from trade date to SEC publication", flow.kpis["Filing lag"]);
    check(flow.days.length === 3 && flow.days[0] === "Sep 1, 2026: purchases $0 (0 transactions), sales $2,000 (1 transaction), net \u2212$2,000" && flow.days[2] === "Sep 12, 2026: purchases $0 (0 transactions), sales $325,000 (1 transaction), net \u2212$325,000", "value by trade date: one column per day with an exact accessible label", flow.days);
    check(flow.up.length === 1 && flow.up.every(c => c === "rgb(47, 153, 106)") && flow.down.length === 2 && flow.down.every(c => c === "rgb(249, 65, 68)") && flow.zero, "purchases are green bars above the zero line, sales red bars below it", flow);
    check(flow.companies.length === 2 && /^AAPL/.test(flow.companies[0]) && /\u2212\$327,000/.test(flow.companies[0]) && /Sold \$327,000 in 2 sales/.test(flow.companies[0]) && /^NVDA/.test(flow.companies[1]) && /\+\$42,000/.test(flow.companies[1]) && /Bought \$42,000 in 1 purchase/.test(flow.companies[1]), "by company: largest gross value first, with exact net, sold and bought values", flow.companies);
    check(flow.largest.length === 3 && /^01 \$325,000/.test(flow.largest[0]) && /12,500 sh × \$26\.00/.test(flow.largest[0]) && /filed Sep 14, 2026 \(\+2 days\)/.test(flow.largest[0]) && /^02 \$42,000/.test(flow.largest[1]) && /^03 \$2,000/.test(flow.largest[2]) && /\+9 days/.test(flow.largest[2]), "largest transactions ranked by value with shares × price, dates and lag", flow.largest);
    // Scroll first: scrolling closes the readout, as it should once the pointer leaves the column.
    await page.locator("#rd-daily-chart").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.hover("#rd-daily-chart .rd-day:last-child");
    await page.waitForTimeout(150);
    const tip = await page.evaluate(() => { const t = document.getElementById("rd-tip"); return { hidden: t.hidden, text: t.innerText.replace(/\s+/g, " ") }; });
    check(!tip.hidden && /Sep 12, 2026/i.test(tip.text) && /\$325,000 Sales · 1/.test(tip.text) && /Net \u2212\$325,000/.test(tip.text), "hovering a day shows its exact values", tip);
    await page.mouse.move(0, 0);
    await page.focus("#rd-daily-chart .rd-day:first-child");
    check(await page.evaluate(() => !document.getElementById("rd-tip").hidden && /Sep 1, 2026/i.test(document.getElementById("rd-tip").innerText)), "keyboard focus on a day shows the same readout");
    await page.keyboard.press("Escape");
    await page.click("#rd-daily-toggle");
    const dt = await page.evaluate(() => ({ expanded: document.getElementById("rd-daily-toggle").getAttribute("aria-expanded"), hidden: document.getElementById("rd-daily-table").hidden, rows: [...document.querySelectorAll("#rd-daily-table tbody tr")].map(r => r.innerText.replace(/\s+/g, " ")) }));
    check(dt.expanded === "true" && !dt.hidden && dt.rows.length === 3 && /Sep 12, 2026 \$0 \(0\) \$325,000 \(1\) \u2212\$325,000/.test(dt.rows[0]), "Show the numbers opens a table of every trade day", dt);
    // Colour: green and red carry direction; the orange accent is used only by the logo's full stop.
    const orange = await page.evaluate(() => {
      const warm = c => /^rgba?\(233, 118, 43/.test(c);
      return [...document.querySelectorAll("body *")].filter(e => !e.closest(".v13-dot")).filter(e => {
        const cs = getComputedStyle(e);
        const border = ["Top", "Right", "Bottom", "Left"].some(side => parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none" && warm(cs["border" + side + "Color"]));
        return border || [cs.backgroundColor, cs.fill, cs.stroke].some(warm) || (warm(cs.color) && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()));
      }).slice(0, 8).map(e => e.tagName.toLowerCase() + "." + [...e.classList].join("."));
    });
    check(orange.length === 0, "no orange on the dashboard except the logo's full stop", orange);
    const badges = await page.evaluate(() => ({ sale: getComputedStyle(document.querySelector("#v3-trades .rd-type--sell")).color, buy: getComputedStyle(document.querySelector("#v3-trades .rd-type--buy")).color }));
    check(badges.sale === "rgb(249, 65, 68)" && badges.buy === "rgb(47, 153, 106)", "sale badges are red and purchase badges green", badges);
    const status = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".rd-status > div")].map(d => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
    check(status.Status === "Online" && status["Parsed filings"] === "1,234 parsed" && status["Last import"] === "Oct 14, 2026, 09:12 UTC" && status["Latest publication"] === "Sep 14, 2026", "data source panel shows status, parsed count, last import (a 'success' run reads as plain time) and latest publication", status);
    // Every status src/ingest.mjs writes: running → success | partial | error.
    const runs = {};
    for (const [key, run] of Object.entries({ partial: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:12:00Z", status: "partial" }, running: { started_at: "2026-10-14T09:00:00Z", finished_at: null, status: "running" }, error: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:03:00Z", status: "error" }, success: FULL["/v1/status"].lastIngest })) {
      runs[key] = await page.evaluate(run => { document.dispatchEvent(new CustomEvent("insidir:status-loaded", { detail: { engine: "online", sec: "configured", filings: 1234, lastIngest: run } })); return document.getElementById("v4-last-import").textContent; }, run);
    }
    check(runs.partial === "Oct 14, 2026, 09:12 UTC · partial import" && runs.running === "Started Oct 14, 2026, 09:00 UTC · in progress" && runs.error === "Oct 14, 2026, 09:03 UTC · import failed" && runs.success === "Oct 14, 2026, 09:12 UTC", "last import reads partial, running, error and success runs in plain words", runs);

    // Reporting people: portraits for verified matches, monogram initials otherwise.
    const ppl = await page.evaluate(() => [...document.querySelectorAll("#v10-people-preview .v10-person-card")].map(c => ({ name: c.querySelector("strong")?.innerText, href: c.querySelector("strong a")?.getAttribute("href"), img: !!c.querySelector(".ins-media img"), mono: c.querySelector(".ins-media__monogram text")?.textContent || "", greyDisc: !!c.querySelector(".ins-media > svg:not(.ins-media__monogram)") })));
    check(ppl.length === 4, "reporting people preview lists the fixture people", ppl.length);
    check(ppl[0]?.name === "Timothy D. Cook" && ppl[0]?.href === "people.html?q=COOK%20TIMOTHY%20D#v10-directory" && ppl[0]?.img, "person card shows the readable name, links to the people page and uses the verified portrait", ppl[0]);
    check(ppl[3]?.mono === "PO" && !ppl[3]?.img, "a person without a verified portrait gets monogram initials", ppl[3]);
    check(ppl.every(p => !p.greyDisc), "no grey placeholder silhouettes", ppl);
    const ini = await page.evaluate(() => ["Alexandra Catherine Elizabeth Vanderbilt-Worthington III", "Mary-Kate O'Brien", "O'BRIEN MARY-KATE", "COOK TIMOTHY D", "SMITH JOHN JR", "BERKSHIRE HATHAWAY INC"].map(n => window.InsidirMedia.initials(n)));
    check(JSON.stringify(ini) === JSON.stringify(["AV", "MO", "MO", "TC", "JS", "BH"]), "initials use the first and last name word, keeping hyphenated and apostrophe surnames whole", ini);

    // Links: every same-origin link returns 200 and none goes to the landing page.
    const links = await page.$$eval("a[href]", as => as.map(a => ({ raw: a.getAttribute("href"), abs: a.href })));
    const internal = [...new Set(links.filter(l => l.abs.startsWith(base + "/")).map(l => l.abs.split("#")[0]))];
    let bad = [];
    for (const href of internal) { const r = await fetch(href); if (r.status !== 200) bad.push(href + " → " + r.status); }
    check(bad.length === 0, "all " + internal.length + " internal links return 200", bad);
    const landing = links.filter(l => /^(\/|\/?index\.html)([?#].*)?$/.test(l.raw) || /^#/.test(l.raw) && l.raw !== "#Content");
    check(landing.length === 0, "no link points to the landing page or an in-page anchor", landing);
    const external = links.filter(l => /^https?:/.test(l.raw) && !l.abs.startsWith(base));
    check(external.every(l => /^https:\/\/(www\.sec\.gov|sec\.gov|commons\.wikimedia\.org)\//.test(l.raw)), "external links only go to the SEC or Wikimedia Commons over https", external.map(l => l.raw));

    check(errors.length === 0, "no console, page or HTTP errors with full data", errors);

    // Search submits to the company report.
    await page.fill("#v3-ticker", "$$");
    await page.click("#v3-search button[type=submit]");
    await page.waitForTimeout(250);
    check(new URL(page.url()).pathname === "/dashboard.html", "an invalid ticker is refused in place");
    await page.fill("#v3-ticker", " msft ");
    await Promise.all([page.waitForURL(/company\.html\?ticker=MSFT$/, { timeout: 10000 }).catch(() => {}), page.click("#v3-search button[type=submit]")]);
    check(/\/company\.html\?ticker=MSFT$/.test(page.url()), "search submits to company.html?ticker=MSFT", page.url());
    await context.close();
  }

  /* ---------- 2. Every width: overflow, sharp images, no errors ---------- */
  for (const width of WIDTHS) {
    const { context, page, errors } = await open(width, fixture(FULL));
    await settle(page);
    // Walk down the page so lazy images load, then wait for every image to finish.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const blurry = [];
      for (const img of document.images) {
        const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
        if (r.width < 2 || cs.display === "none" || cs.visibility === "hidden" || /\.svg(\?|$)/i.test(img.currentSrc)) continue;
        if (!img.naturalWidth) { blurry.push({ src: img.currentSrc, natural: 0 }); continue; }
        const scale = cs.objectFit === "cover" ? Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) : Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
        if (scale * 2 > 1.0001) blurry.push({ src: img.currentSrc.split("/").pop(), rendered: Math.round(r.width) + "x" + Math.round(r.height), natural: img.naturalWidth + "x" + img.naturalHeight });
      }
      const wide = [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest(".rd-table-wrap")).slice(0, 5).map(e => e.tagName.toLowerCase() + "." + [...e.classList].join("."));
      // Standalone links and buttons (not inline in a sentence) must be at least 24px tall (WCAG 2.5.8).
      const small = [...document.querySelectorAll("main a[href], main button")].filter(e => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return r.width > 0 && cs.visibility !== "hidden" && !e.closest("p, td.rd-empty") && r.height < 24;
      }).map(e => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30) + " " + Math.round(e.getBoundingClientRect().height) + "px");
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, blurry, wide, small, h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize), tracking: getComputedStyle(document.querySelector("h1")).letterSpacing };
    });
    check(m.overflow <= 1, width + "px: no horizontal overflow", m);
    check(m.blurry.length === 0, width + "px: no upscaled raster image", m.blurry);
    check(m.h1 >= 30 && m.h1 <= 72, width + "px: greeting heading size within the type scale (" + m.h1 + "px)");
    if (width < 600) check(m.small.length === 0, width + "px: every standalone link and button is at least 24px tall", m.small);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `dashboard-${width}.png`), fullPage: true });
    check(errors.length === 0, width + "px: no console or page errors", errors);
    await context.close();
  }

  /* ---------- 3. Empty account and empty import ---------- */
  {
    const { context, page, errors } = await open(390, fixture(EMPTY));
    await settle(page);
    const e = await page.evaluate(() => ({
      watch: document.querySelector("#v3-watchlist").innerText, notes: document.querySelector("#v3-notes").innerText,
      filings: document.querySelector("#v3-filings").innerText, trades: document.querySelector("#v3-trades").innerText,
      chart: document.querySelector("#rd-daily-chart").innerText, kpis: document.querySelector("#rd-kpis").innerText, companies: document.querySelector("#rd-companies").innerText, largest: document.querySelector("#rd-largest").innerText, people: document.querySelector("#v10-people-preview").innerText,
      count: document.querySelector("#v4-filing-count").innerText, last: document.querySelector("#v4-last-import").innerText, latest: document.querySelector("#v4-latest-filing-date").innerText,
      watchLink: document.querySelector('#v3-watchlist a[href="watchlist.html"]') !== null
    }));
    check(/watchlist is empty/i.test(e.watch) && e.watchLink, "empty watchlist explains itself and links to watchlist.html", e.watch);
    check(/No research notes yet/.test(e.notes), "empty notes state", e.notes);
    check(/No imported SEC filings yet/.test(e.filings), "empty filings state", e.filings);
    check(/No imported Form 4 transactions yet/.test(e.trades), "empty transactions state", e.trades);
    check(/No dated transactions to chart yet/.test(e.chart), "empty chart state", e.chart);
    check(/No imported Form 4 transactions yet/.test(e.kpis) && /No companies yet/.test(e.companies) && /No imported transactions yet/.test(e.largest), "empty flow states", e);
    check(await page.locator("#rd-daily-toggle").isHidden(), "no table toggle without data");
    check(/No reporting people/.test(e.people), "empty people state", e.people);
    check(e.count === "0 parsed" && /No import recorded yet/.test(e.last) && /No filings imported yet/.test(e.latest), "empty data source panel", e);
    await page.click('[data-filter="reported_sale"]');
    check(/No imported Form 4 transactions yet/.test(await text(page, "#v3-trades")), "filters on an empty import do not crash");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-empty-390.png"), fullPage: true });
    check(errors.length === 0, "no errors with empty data", errors);
    await context.close();
  }

  /* ---------- 4. Service errors (503), then recovery via "Try again" ---------- */
  {
    let healthy = false;
    const respond = (path, method) => {
      if (path === "/v1/me") return { status: 200, body: me };
      if (!healthy) return { status: 503, body: { error: "Service unavailable" } };
      return fixture(FULL)(path, method);
    };
    const { context, page, errors } = await open(1024, respond);
    await page.waitForFunction(() => /unavailable/.test(document.querySelector("#v3-trades")?.textContent || "") && /unavailable/i.test(document.querySelector("#v4-data-state")?.textContent || "") && /unavailable/.test(document.querySelector("#v10-people-preview")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
    const s = await page.evaluate(() => Object.fromEntries(["rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-watchlist", "v3-notes", "v3-filings", "v3-trades", "v10-people-preview", "v4-data-state"].map(id => [id, document.getElementById(id).innerText.replace(/\s+/g, " ")])));
    for (const [id, msg] of Object.entries(s)) check(/unavailable/i.test(msg) && !/Loading|Checking/.test(msg), "503: #" + id + " shows a clear unavailable message", msg);
    check(await page.locator("button[data-retry]").count() >= 4, "503: modules offer Try again");
    check(await page.locator("#v10-people-preview button[data-people-retry]").count() === 1, "503: reporting people offer their own Try again");
    check(await page.locator('#v4-data-state button[data-retry="status"]').count() === 1, "503: the data source panel offers its own Try again");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-error-1024.png"), fullPage: true });
    healthy = true;
    await page.click('#v3-trades button[data-retry="trades"]');
    await page.waitForFunction(() => document.querySelectorAll("#v3-trades tr").length === 4 && document.querySelectorAll("#rd-daily-chart .rd-day").length === 3, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v3-trades tr").count() === 4 && await page.locator("#rd-daily-chart .rd-day").count() === 3 && await page.locator("#rd-kpis .rd-kpi").count() === 5, "Try again reloads the transactions, the totals and the chart");
    await page.click('#v3-filings button[data-retry="filings"]');
    await page.waitForFunction(() => document.querySelectorAll("#v3-filings tr").length === 3 && /parsed/.test(document.querySelector("#v4-filing-count").textContent), null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v3-filings tr").count() === 3, "Try again reloads latest filings and the data source panel");
    await page.click("#v10-people-preview button[data-people-retry]");
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-preview .v10-person-card").length === 4, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v10-people-preview .v10-person-card").count() === 4, "Try again reloads the reporting people");
    if (await page.locator('#v4-data-state button[data-retry="status"]').count()) await page.click('#v4-data-state button[data-retry="status"]');
    await page.waitForFunction(() => document.getElementById("v4-data-state").textContent === "Online", null, { timeout: 10000 }).catch(() => {});
    check(await text(page, "#v4-data-state") === "Online", "the data source panel recovers (its own Try again, or the filings one)", await text(page, "#v4-data-state"));
    const unexpected = errors.filter(e => !/^HTTP 503 \/v1\/|status of 503/.test(e));
    check(unexpected.length === 0, "503: no script errors (only the expected failed requests)", unexpected);
    await context.close();
  }


  /* ---------- 5. Person links land on the search result, not the top of the people page ---------- */
  const landed = async page => {
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length === 1, null, { timeout: 10000 });
    await page.waitForTimeout(150);
    await page.waitForFunction(() => new Promise(r => { const y = scrollY; setTimeout(() => r(Math.abs(scrollY - y) < 1), 400); }), null, { timeout: 10000 });
    return page.evaluate(() => {
      const c = document.querySelector("#v10-people-results .v10-person-card"), r = c.getBoundingClientRect();
      return { top: Math.round(r.top), vh: innerHeight, scrollY: Math.round(scrollY), focus: document.activeElement?.id || document.activeElement?.tagName, name: c.querySelector("strong")?.innerText, cards: document.querySelectorAll("#v10-people-results .v10-person-card").length, input: document.getElementById("v10-person-query").value, url: location.pathname + location.search + location.hash, stay: window.__stay === 1 };
    });
  };
  for (const [width, reducedMotion] of [[1440, "no-preference"], [390, "reduce"]]) {
    const { context, page, errors } = await open(width, fixture(FULL), { reducedMotion });
    await settle(page);
    await Promise.all([page.waitForURL(/\/people\.html\?q=/, { timeout: 10000 }), page.click("#v3-trades tr:first-child .rd-entity > a")]);
    const at = await landed(page);
    check(at.url === "/people.html?q=COOK%20TIMOTHY%20D#v10-directory" && at.cards === 1 && at.name === "Timothy D. Cook", width + "px: a dashboard person link opens people.html with that person's search result", at);
    check(at.top >= 70 && at.top < at.vh - 80 && at.scrollY > 0, width + "px: the result is inside the viewport below the sticky header (" + reducedMotion + " motion)", at);
    check(at.focus === "v10-people-status", width + "px: focus moves to the directory's status line", at.focus);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `people-from-dashboard-${width}.png`) });
    check(errors.length === 0, width + "px: no errors following a person link", errors);
    await context.close();
  }

  /* ---------- 6. Familiar faces search in place ---------- */
  for (const width of [1440, 390]) {
    const { context, page, errors } = await open(width, fixture(FULL), { path: "/people.html" });
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length === 4, null, { timeout: 10000 });
    await page.evaluate(() => { window.__stay = 1; });
    const faces = await page.$$eval(".v10-known__grid a", a => a.map(x => ({ href: x.getAttribute("href"), img: !!x.querySelector("img[data-real-image]"), mono: x.querySelector(".ins-media__monogram text")?.textContent })));
    check(faces.length === 4 && faces.every(f => /^people\.html\?q=[^#]+#v10-directory$/.test(f.href) && f.img && /^[A-Z]{2}$/.test(f.mono || "")), width + "px: Familiar faces link to the directory search and carry a monogram fallback", faces);
    await page.click(".v10-known__grid a >> nth=0");
    const at = await landed(page);
    check(at.stay, width + "px: a Familiar faces tile searches without reloading the page", at);
    check(at.url === "/people.html?q=Cook%20Timothy#v10-directory" && at.input === "Cook Timothy" && at.cards === 1 && at.name === "Timothy D. Cook", width + "px: the tile fills the search box and shows the matching record", at);
    check(at.top >= 70 && at.top < at.vh - 80, width + "px: the Familiar faces result is inside the viewport", at);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `people-face-${width}.png`) });
    check(errors.length === 0, width + "px: no errors on the people page", errors);
    await context.close();
  }

  /* ---------- 7. Wikimedia unreachable: initials, never broken images ---------- */
  for (const [width, path] of [[1440, "/people.html"], [390, "/dashboard.html"]]) {
    const { context, page, errors } = await open(width, fixture(FULL), { path, blockImages: true });
    await page.waitForFunction(() => document.querySelectorAll(".v10-person-card").length >= 4, null, { timeout: 10000 });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      broken: [...document.images].filter(i => i.complete && !i.naturalWidth && !/\.svg/.test(i.src) && i.getBoundingClientRect().width > 0).map(i => i.src.split("/").pop()),
      tiles: [...document.querySelectorAll(".ins-media--person")].filter(t => t.getBoundingClientRect().width > 0).map(t => ({ mono: t.querySelector(".ins-media__monogram text")?.textContent || "", shown: !!t.querySelector(".ins-media__monogram") && getComputedStyle(t.querySelector(".ins-media__monogram")).display !== "none" }))
    }));
    check(r.broken.length === 0, width + "px " + path + ": no broken-image icons when Wikimedia is unreachable", r.broken);
    check(r.tiles.length > 0 && r.tiles.every(t => t.shown && /^[A-Z]{1,2}$/.test(t.mono)), width + "px " + path + ": every portrait tile falls back to visible initials", r.tiles);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `no-wikimedia-${path.slice(1, -5)}-${width}.png`) });
    const unexpected = errors.filter(e => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(e));
    check(unexpected.length === 0, width + "px " + path + ": no script errors without Wikimedia", unexpected);
    await context.close();
  }

  /* ---------- 8. People directory pages 24 at a time ---------- */
  {
    const { context, page, errors } = await open(1440, fixture(MANY), { path: "/people.html" });
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length > 0, null, { timeout: 10000 });
    const count = () => page.locator("#v10-people-results .v10-person-card").count();
    check(await count() === 24 && await text(page, "#v10-people-count") === "The first 100 reporting people · 24 shown", "directory shows 24 of 100 people with an honest count", await text(page, "#v10-people-count"));
    if (SHOTS) { await page.locator("button[data-people-more]").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, "people-paging-1440.png") }); }
    const more = (await text(page, "button[data-people-more]")).replace(/\s+/g, " ");
    check(/Show more people · 76 more/i.test(more), "a Show more button says how many remain", more);
    await page.click("button[data-people-more]");
    const focus = await page.evaluate(() => [...document.querySelectorAll("#v10-people-results .v10-person-card")].indexOf(document.activeElement?.closest(".v10-person-card")));
    check(await count() === 48 && focus === 24, "Show more adds 24 people and moves focus to the first new one", { cards: await count(), focus });
    for (let i = 0; i < 3; i++) if (await page.locator("button[data-people-more]").count()) await page.click("button[data-people-more]");
    check(await count() === 100 && await page.locator("button[data-people-more]").count() === 0 && await text(page, "#v10-people-count") === "The first 100 reporting people", "the button disappears once all 100 are shown");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.fill("#v10-person-query", "FILER 00");
    await page.press("#v10-person-query", "Enter");
    await page.waitForFunction(() => /results? for/.test(document.getElementById("v10-people-status").textContent), null, { timeout: 10000 });
    check(await count() === 9 && /9 results for “FILER 00”/.test(await text(page, "#v10-people-status")), "a new search starts again from the first page", await text(page, "#v10-people-status"));
    check(errors.length === 0, "no errors while paging", { errors, height });
    await context.close();
  }

  /* ---------- 9. Paywall: 401 → sign in, 402 → subscribe ---------- */
  for (const [status, target] of [[401, /\/signin\.html\?next=dashboard\.html$/], [402, /\/subscribe\.html\?next=dashboard\.html$/]]) {
    const body = status === 401 ? { error: "Sign in required", signin: "/signin.html" } : { error: "An active Insidir subscription is required", subscribe: "/subscribe.html" };
    const { context, page } = await open(390, (path) => path === "/v1/me" && status === 402 ? { status: 200, body: { ...me, access: { ...me.access, active: false, plan: "none", status: null } } } : path.startsWith("/v1/billing") ? { status: 200, body: {} } : { status, body });
    await page.waitForURL(target, { timeout: 10000 }).catch(() => {});
    check(target.test(page.url()), status + " sends the reader to " + (status === 401 ? "signin" : "subscribe") + ".html?next=dashboard.html", page.url());
    await context.close();
  }
} catch (e) {
  failed.push("harness: " + (e && e.stack || e));
} finally {
  await browser.close();
  await new Promise(ok => server.close(ok));
}

for (const p of passed) console.log("  ok   " + p);
for (const f of failed) console.log("  FAIL " + f);
console.log(`\nDashboard check: ${passed.length} passed, ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;

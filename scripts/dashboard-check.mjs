/* Insidir overview (dashboard.html) browser test.

   Opens the dashboard in headless Chromium against mocked /v1 responses and verifies that it makes sense to a
   paying reader, from the top down:
     - Today: the greeting and date, what changed since the last visit (counted from a seeded
       localStorage["insidir:overview:last-seen"] against each row's created_at), what the latest imported trades
       add up to (the same figures as 03), and how fresh the import is;
     - 01 People you follow (GET /v1/me/people/updates): the feed's exact lines (badge, then the deal without a
       repeated verb), New markers only on rows imported after the last visit, every loaded line reachable ("Show N
       more trades" opens the rest in place), the followed list (read before the feed, at every width) with each
       person's last 30 days, suggestions that exclude followed people; following and unfollowing live, with no
       reload: the button flips at once at a fixed width, the new person and their trades appear, rows already on
       screen slide on the spring (never jump, New markers never pop again), nothing under the pointer moves (also
       at 390 with a slow server), an unfollowed person dims with an Undo of at least 24px, a refused follow is
       reverted with the reason; the empty state (message kept current after each follow, suggestions with Follow)
       and the error state (message, Try again);
     - describe(): the plain-English wording of every Form 4 code shown (P, S, A, M, F, G and the rest), each line
       of an option exercise as what it is (units given up, common shares received), verb-led sentences;
     - Today agrees with the modules below: the watchlist count is the number of rows marked New in 02;
     - 02 Your watchlist and notes: each saved company's latest purchase or sale (looked up per ticker when the
       100-row window has none: its latest purchase and sale anywhere in the import, ?category=…&limit=1, and its
       latest 20 lines only when there is neither), "Also filed since" with that person's tile, the empty state's
       Save buttons (POST /v1/me/watchlist) and a message that says what was saved;
     - 03 Across the market: exact totals, the day chart (one tab stop, arrow keys, a readout on hover and focus),
       the Chart | Table switch inside its fixed frame, by company and the biggest trades;
     - 04 All recent trades: exact rows, word + code badges, the code legend, filters that crossfade without
       changing the page height or any column's width (disabled, with no counts, while there are no rows to filter);
       phone records that say "no price reported" and keep the security and qualifiers; 05 About this data, each fact
       said once;
     - the header search: every company and person in its results carries a tile;
     - a logo or headshot tile beside every person and company the page names, identified by SEC CIK;
     - layout: no load shift (the header shell holds its 70px; skeletons hold the content's space) with staggered
       latency, also on a return visit whose Today sentence is longer than the last one's; no horizontal overflow and
       no text cut off mid-word at 360–1440px, touch targets, sharp images, no orange anywhere;
     - motion: atoms written per frame during a scroll never exceed the atoms on screen (plus a few settling);
     - links: every internal link returns 200, none goes to the landing page, external links only to the SEC or
       Wikimedia Commons; 503 everywhere then recovery through each "Try again"; 401 → sign in, 402 → subscribe;
     - person links: every person named on the overview (feed, followed list, suggestions, watchlist, biggest trades,
       the trades table) and in the header search opens their own file, person.html?cik=<owner CIK without leading
       zeros>, and the file opens (GET /v1/people/<cik>, mocked from the same lines); a name without a CIK still lands
       on the people directory's search result;
     - joint filings (owner_cik null, owners [{cik, name}] in filing order, as the API sends them): a followed person who
       is the tenth of ten owners is the one the feed row names, links, pictures and counts (their 'N new', Today's
       count of people, dimming after an unfollow); everywhere else a joint line is one label, a person and then
       'and N others' (the filing), with nothing cut off beside it; a line with no owners list never shows its joined
       names as one person;
     - the people page (v10-people.js): directory cards and followed rows link each name to its file, Familiar faces
       open verified files (SEC CIKs checked on EDGAR), paging, and tiles that fall back to a stand-in logo or visible
       initials when image sources are unreachable.
   Every scroll-reveal block is shown at load (InsidirMotion.revealAll) except where reveal timing is the point,
   and measurements wait for the motion layer's atoms to be home. The clock is fixed at 2026-10-14 21:00 UTC and
   the browser runs in UTC, so dates and "since your last visit" read the same on every machine.

   Usage: node scripts/dashboard-check.mjs [--shots dir] [--widths 360,390,768,1024,1440]
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const WIDTHS = opt("widths", "360,390,768,1024,1440").split(",").map(Number).filter(Boolean);
const SHOTS = opt("shots", "");
const NOW = new Date("2026-10-14T21:00:00Z");
const passed = [], failed = [];
const check = (ok, label, detail) => { if (ok) passed.push(label); else failed.push(label + (detail === undefined ? "" : " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)))); return ok; };

/* ---------- fixtures (mock only; production reads the real routes) ---------- */
const source = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
const T = (o) => ({ source_url: source, is_amendment: false, derivative: false, security_title: "Common Stock", direct_ownership: "D", ...o });
const COOK = "0001214156", HUANG = "0001049502", MUSK = "0001494730", NADELLA = "0001513142", OTHER = "0000067890", KRESS = "0001580197";
// The market-wide window (/v1/transactions?limit=100), newest trade date first.
const trades = [
  T({ id: 11, accession: "000032019326000001", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "COOK TIMOTHY D", owner_cik: COOK, transaction_date: "2026-09-12", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 12500, price_per_share: 26, estimated_value: 325000, published_at: "2026-09-14T20:00:00Z", created_at: "2026-09-14T20:05:00Z" }),
  T({ id: 15, accession: "000104581026000005", ticker: "NVDA", issuer_name: "NVIDIA CORP", issuer_cik: "0001045810", owner_name: "KRESS COLETTE", owner_cik: KRESS, transaction_date: "2026-09-11", transaction_code: "M", acquired_disposed: "A", category: "other", derivative: true, security_title: "Restricted Stock Units", shares: 3300, price_per_share: null, estimated_value: null, published_at: "2026-09-12T21:00:00Z", created_at: "2026-09-12T21:04:00Z" }),
  T({ id: 12, accession: "000104581026000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", issuer_cik: "0001045810", owner_name: "HUANG JEN HSUN", owner_cik: HUANG, transaction_date: "2026-09-10", transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", shares: 1500, price_per_share: 28, estimated_value: 42000, published_at: "2026-09-12T20:00:00Z", created_at: "2026-09-12T20:05:00Z" }),
  T({ id: 13, accession: "000078901926000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", issuer_cik: "0000789019", owner_name: "NADELLA SATYA", owner_cik: NADELLA, transaction_date: "2026-09-08", transaction_code: "A", category: "other", shares: 900, price_per_share: null, estimated_value: null, published_at: "2026-09-10T20:00:00Z", created_at: "2026-09-10T20:05:00Z" }),
  T({ id: 14, accession: "000032019326000004", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "OTHER PUBLIC FILER", owner_cik: OTHER, transaction_date: "2026-09-01", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 100, price_per_share: 20, estimated_value: 2000, published_at: "2026-09-10T20:00:00Z", created_at: "2026-09-10T20:06:00Z" })
];
// Older lines a ticker lookup reaches (not in the window): this TSLA sale is only reachable through ?ticker=TSLA.
const olderTrades = [
  T({ id: 9, accession: "000131860526000009", ticker: "TSLA", issuer_name: "Tesla, Inc.", issuer_cik: "0001318605", owner_name: "MUSK ELON", owner_cik: MUSK, transaction_date: "2026-06-02", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 1000, price_per_share: 250, estimated_value: 250000, published_at: "2026-06-04T20:00:00Z", created_at: "2026-06-04T20:10:00Z" }),
  T({ id: 30, accession: "000032019326000030", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "COOK TIMOTHY D", owner_cik: COOK, transaction_date: "2026-08-20", transaction_code: "G", acquired_disposed: "D", category: "other", shares: 5000, price_per_share: null, estimated_value: null, published_at: "2026-08-22T20:00:00Z", created_at: "2026-08-22T20:03:00Z" }),
  T({ id: 31, accession: "000032019326000031", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "COOK TIMOTHY D", owner_cik: COOK, transaction_date: "2026-08-15", transaction_code: "F", acquired_disposed: "D", category: "other", shares: 2000, price_per_share: 230.5, estimated_value: 461000, published_at: "2026-08-18T20:00:00Z", created_at: "2026-08-18T20:02:00Z" })
];
const ALL_LINES = [...trades, ...olderTrades];
/* GET /v1/me/people/updates for a follow set, the way src/api.mjs builds it: people most recently active first,
   items (Form 4 lines of followed people) newest filing first. 30-day figures are counted back from the mock
   server's clock, which answers as of Oct 14 00:00 UTC (so the window opens Sep 14 00:00 UTC). */
const PERSON = { [COOK]: ["COOK TIMOTHY D", "AAPL", "Apple Inc."], [HUANG]: ["HUANG JEN HSUN", "NVDA", "NVIDIA CORP"], [MUSK]: ["MUSK ELON", "TSLA", "Tesla, Inc."], [NADELLA]: ["NADELLA SATYA", "MSFT", "MICROSOFT CORP"], [OTHER]: ["OTHER PUBLIC FILER", "AAPL", "Apple Inc."], [KRESS]: ["KRESS COLETTE", "NVDA", "NVIDIA CORP"] };
const SERVER_NOW = Date.parse("2026-10-14T00:00:00Z");
function updatesFor(ciks, lines = ALL_LINES) {
  const since = SERVER_NOW - 30 * 86400000;
  const byPub = (a, b) => b.published_at.localeCompare(a.published_at) || b.transaction_date.localeCompare(a.transaction_date);
  // As the server's followSql: a person's own lines, plus joint lines (owner_cik null) whose owners list them.
  const theirs = (x, list) => list.includes(x.owner_cik) || (x.owner_cik == null && Array.isArray(x.owners) && x.owners.some(o => list.includes(o.cik)));
  const items = lines.filter(x => theirs(x, ciks)).sort(byPub);
  const people = ciks.map(cik => {
    const rows = items.filter(x => theirs(x, [cik])), recent = rows.filter(x => Date.parse(x.published_at) >= since), last = rows[0] || null;
    return { owner_cik: cik, owner_name: PERSON[cik][0], followed_at: "2026-09-01T00:00:00Z", ticker: PERSON[cik][1], issuer_name: PERSON[cik][2], last, last_published_at: last?.published_at ?? null, last_transaction_date: last?.transaction_date ?? null,
      filings_30d: new Set(recent.map(x => x.accession)).size, transactions_30d: recent.length,
      purchases_30d_value: recent.filter(x => x.category === "reported_purchase").reduce((s, x) => s + x.estimated_value, 0), sales_30d_value: recent.filter(x => x.category === "reported_sale").reduce((s, x) => s + x.estimated_value, 0) };
  }).sort((a, b) => String(b.last_published_at).localeCompare(String(a.last_published_at)));
  return { people, items: items.slice(0, 40), following: ciks.length, source: "SEC Form 4", disclaimer: "Reported purchases and sales are not recommendations or predictive signals." };
}
/* GET /v1/people/<cik> for one owner, the way src/person-profile.mjs answers it (no 4/As in these lines). */
function personFile(cik, lines = ALL_LINES) {
  const rows = lines.filter(x => Number(x.owner_cik) === Number(cik)).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.published_at.localeCompare(a.published_at));
  if (!rows.length) return null;
  const since = SERVER_NOW - 30 * 86400000;
  const totals = list => {
    const part = cat => { const r = list.filter(x => x.category === cat); return { count: r.length, shares: r.reduce((n, x) => n + Number(x.shares), 0), value: r.reduce((n, x) => n + Number(x.estimated_value || 0), 0) }; };
    const dates = list.map(x => x.transaction_date).sort(), pub = list.map(x => x.published_at).sort();
    return { transactions: list.length, superseded: 0, filings: new Set(list.map(x => x.accession)).size, purchases: part("reported_purchase"), sales: part("reported_sale"), other: { count: list.filter(x => x.category === "other").length },
      first_transaction_date: dates[0] || null, last_transaction_date: dates.at(-1) || null, last_published_at: pub.at(-1) || null };
  };
  const issuers = [...new Set(rows.map(x => x.issuer_cik))];
  return {
    person: { cik: rows[0].owner_cik, name: rows[0].owner_name, filed_names: [rows[0].owner_name] },
    companies: issuers.map(ic => { const r = rows.filter(x => x.issuer_cik === ic); return { ticker: r[0].ticker, issuer_cik: ic, issuer_name: r[0].issuer_name, roles: ic === "0000320193" ? ["Chief Executive Officer", "Director"] : [], first_transaction_date: r.at(-1).transaction_date, last_transaction_date: r[0].transaction_date, last_published_at: r.map(x => x.published_at).sort().at(-1), transactions: r.length, purchases_value: r.filter(x => x.category === "reported_purchase").reduce((n, x) => n + x.estimated_value, 0), sales_value: r.filter(x => x.category === "reported_sale").reduce((n, x) => n + x.estimated_value, 0) }; }),
    totals: { all: totals(rows), d30: totals(rows.filter(x => Date.parse(x.published_at) >= since)) },
    transactions: rows.map(x => ({ ...x, shares: String(x.shares), price_per_share: x.price_per_share === null ? null : String(x.price_per_share), estimated_value: x.estimated_value === null ? null : String(x.estimated_value), superseded: false })),
    filings: [...new Set(rows.map(x => x.accession))].map(a => { const r = rows.filter(x => x.accession === a); return { accession: a, form_type: "4", ticker: r[0].ticker, issuer_cik: r[0].issuer_cik, issuer_name: r[0].issuer_name, published_at: r[0].published_at, source_url: source, lines: r.length }; }),
    other_issuers: [], edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + String(cik).padStart(10, "0") + "&type=4&dateb=&owner=include&count=40",
    source: "SEC Form 4", disclaimer: "Public SEC records. Not a recommendation or a prediction."
  };
}
const filings = [{ accession: "000032019326000001", ticker: "AAPL", issuer_name: "Apple Inc.", form_type: "4", published_at: "2026-09-14T20:00:00Z", source_url: source, is_amendment: false, owner_names: ["COOK TIMOTHY D"] }];
const insiders = [COOK, HUANG, NADELLA, OTHER].map(cik => ({ owner_name: PERSON[cik][0], owner_cik: cik, ticker: PERSON[cik][1], filings: 1, last_transaction_date: "2026-09-12" }));
const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, currentPeriodEnd: "2026-11-14T00:00:00Z" } };
const STATUS = { engine: "online", sec: "configured", filings: 1234, lastIngest: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:12:00Z", status: "success" }, paid: false };
const FOLLOWED = [COOK, HUANG, MUSK];
const FULL = {
  "/v1/me": me, "/v1/transactions": { items: trades }, "/v1/filings": { items: filings }, "/v1/status": STATUS,
  "/v1/me/watchlist": { items: ["AAPL", "NVDA", "TSLA", "IBM"].map(t => ({ ticker: t, created_at: "2026-09-01T00:00:00Z" })) },
  "/v1/me/research-decisions": { items: [{ ticker: "AAPL", review_status: "researching", notes: "Reading the latest 10-K before deciding.", created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }, { ticker: "BRK.B", review_status: "watching", notes: "Annual letter first.", created_at: "2026-08-02T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" }] },
  "/v1/insiders": { items: insiders }, "/v1/search": { items: [] }, follows: FOLLOWED, older: olderTrades
};
// A member whose followed people filed more lines than the feed's first eight rows (seven more Cook sales in July).
const MORELINES = { ...FULL, older: [...olderTrades, ...Array.from({ length: 7 }, (_, i) => T({ id: 40 + i, accession: "0000320193260000" + (40 + i), ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "COOK TIMOTHY D", owner_cik: COOK, transaction_date: "2026-07-" + String(10 + i).padStart(2, "0"), transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 1000 + i, price_per_share: 200, estimated_value: (1000 + i) * 200, published_at: "2026-07-" + String(12 + i).padStart(2, "0") + "T20:00:00Z", created_at: "2026-07-" + String(12 + i).padStart(2, "0") + "T20:05:00Z" }))] };
// A first-time member: the import is there, their own account is empty.
const FIRST = { ...FULL, "/v1/me/watchlist": { items: [] }, "/v1/me/research-decisions": { items: [] }, follows: [] };
const EMPTY = { "/v1/me": me, "/v1/transactions": { items: [] }, "/v1/filings": { items: [] }, "/v1/status": { engine: "online", sec: "configured", filings: 0, lastIngest: null },
  "/v1/me/watchlist": { items: [] }, "/v1/me/research-decisions": { items: [] }, "/v1/insiders": { items: [] }, "/v1/search": { items: [] }, follows: [], older: [] };
const SEEN = "2026-09-01T00:00:00.000Z"; // the last visit, for "new since"

/* Media (entity-media.js v2 batch, GET /v1/media): logos for some tickers, a photo for Tim Cook, nothing for the rest.
   Images are generated here, for the test only (never shipped). */
const PNG = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 90, g: 90, b: 86 } } }).png().toBuffer();
const WEBP = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 110, g: 110, b: 104 } } }).webp().toBuffer();
const SHA = n => n.repeat(64).slice(0, 64);
const MEDIA_LOGOS = { AAPL: SHA("a"), NVDA: SHA("b"), MSFT: SHA("c"), TSLA: SHA("d") };
function mediaBatch(url) {
  const tickers = (url.searchParams.get("tickers") || "").split(",").filter(Boolean);
  const people = (url.searchParams.get("people") || "").split(",").filter(Boolean);
  const logos = {}, photos = {};
  for (const t of [...tickers, ...people.map(p => p.split(":")[1])].filter(Boolean)) logos[t] = MEDIA_LOGOS[t] ? { src: "/v1/media/" + MEDIA_LOGOS[t] + ".png", w: 300, h: 300, source: "fixture", name: t } : null;
  for (const p of people) { const cik = String(Number(p.split(":")[0])); photos[cik] = cik === String(Number(COOK)) ? { src: "/v1/media/" + SHA("e") + ".webp", w: 256, h: 256, source: "commons", credit: "Fixture Photographer · CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture.jpg", name: "Tim Cook" } : null; }
  return { logos, photos, owners: {}, pending: { logos: [], photos: [] }, retryAfter: 8, invalid: [] };
}

/* ---------- harness ---------- */
const server = createServer((req, res) => { serveStatic(req, res).then(found => { if (!found) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });

/* respond: (path, method, url, body) → {status, body} | {status, buffer, type}. */
async function open(width, respond, { path = "/dashboard.html", reducedMotion = "no-preference", blockImages = false, reveal = true, seen = SEEN, latency = null, init = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion, timezoneId: "UTC" });
  // A member who has already dismissed app.js's dated product announcement; the banner is not what this check covers.
  await context.addInitScript(() => { try { localStorage.setItem("insidir:announcement:dismissed:features-2026-10-19", "1"); } catch {} });
  if (seen) await context.addInitScript(seenAt => { try { if (!sessionStorage.getItem("check:seeded")) { localStorage.setItem("insidir:overview:last-seen", seenAt); sessionStorage.setItem("check:seeded", "1"); } } catch {} }, seen);
  // Tools that measure the page see every scroll-reveal block in place (v13-motion.js holds blocks below the fold back until they scroll in).
  if (reveal) await context.addInitScript(() => {
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
  if (init) await context.addInitScript(init);
  const api = [];
  await context.route("**/v1/**", async route => {
    const req = route.request(), url = new URL(req.url());
    api.push(req.method() + " " + url.pathname + url.search);
    const wait = latency ? (latency[url.pathname] ?? latency["*"] ?? 0) : 0;
    if (wait) await new Promise(ok => setTimeout(ok, wait));
    const out = await respond(url.pathname, req.method(), url, req.postData());
    if (out.buffer) return route.fulfill({ status: out.status, contentType: out.type, body: out.buffer }).catch(() => {});
    await route.fulfill({ status: out.status, contentType: "application/json", body: JSON.stringify(out.body) }).catch(() => {});
  });
  // Commons thumbnails: an image with the real thumbnail's pixel size (250px wide), so sharpness is measurable offline.
  await context.route(/upload\.wikimedia\.org|thumb\.wikimedia\.org/, route => {
    if (blockImages) return route.abort("blockedbyclient");
    const w = Number((/\/(\d+)px-[^/]+$/.exec(route.request().url()) || [])[1]) || 2000;
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(w * 1.3)}" viewBox="0 0 10 13"><rect width="10" height="13" fill="#555"/></svg>` });
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push("HTTP " + r.status() + " " + r.url().replace(base, "")); });
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { context, page, errors, api };
}
/* A stateful mock of the API: /v1/transactions?ticker= filters every line, /v1/insiders?q= matches names like
   ILIKE, follows and saves change what later reads return, and /v1/media answers in the v2 contract. */
function fixture(data, { blockMedia = false, followFails = null } = {}) {
  const state = { follows: [...(data.follows || [])], saved: (data["/v1/me/watchlist"]?.items || []).map(x => x.ticker), posts: [] };
  const fn = (path, method, url, body) => {
    const q = url?.searchParams;
    if (path.startsWith("/v1/media/")) return blockMedia ? { status: 404, body: { error: "Not found" } } : { status: 200, buffer: path.endsWith(".webp") ? WEBP : PNG, type: path.endsWith(".webp") ? "image/webp" : "image/png" };
    if (path === "/v1/media") return blockMedia ? { status: 503, body: { error: "Service unavailable" } } : { status: 200, body: mediaBatch(url) };
    if (path === "/v1/company/logo") return { status: 404, body: { error: "No logo" } };
    if (path === "/v1/company/photos") return { status: 200, body: { photos: {}, complete: true } };
    if (method === "POST" && path === "/v1/me/people") {
      const cik = JSON.parse(body || "{}").owner_cik; state.posts.push("follow " + cik);
      if (followFails && followFails(cik)) return { status: 409, body: { error: "150 people maximum; unfollow someone first" } };
      if (!state.follows.includes(cik)) state.follows.push(cik); return { status: 200, body: { saved: true, owner_cik: cik } };
    }
    if (method === "DELETE" && path.startsWith("/v1/me/people/")) { const cik = decodeURIComponent(path.split("/").pop()); state.posts.push("unfollow " + cik); state.follows = state.follows.filter(c => c !== cik); return { status: 200, body: { deleted: true, owner_cik: cik } }; }
    if (method === "POST" && path === "/v1/me/watchlist") { const t = JSON.parse(body || "{}").ticker; state.posts.push("save " + t); state.saved.push(t); return { status: 200, body: { saved: true, ticker: t } }; }
    if (method !== "GET") return { status: 200, body: { saved: true } };
    if (path === "/v1/me/people/updates") return { status: 200, body: updatesFor(state.follows, [...(data["/v1/transactions"]?.items || []), ...(data.older || [])]) };
    if (path.startsWith("/v1/people/")) { const f = personFile(decodeURIComponent(path.split("/").pop()), [...(data["/v1/transactions"]?.items || []), ...(data.older || [])]); return f ? { status: 200, body: f } : { status: 404, body: { error: "Reporting person not found in imported SEC records" } }; }
    if (path === "/v1/me/people") return { status: 200, body: { items: state.follows.map(cik => ({ owner_cik: cik, owner_name: PERSON[cik]?.[0] || "FIXTURE FILER", ticker: PERSON[cik]?.[1] || null, last_transaction_date: "2026-09-12", created_at: "2026-09-01T00:00:00Z" })) } };
    if (path === "/v1/transactions" && q?.has("ticker")) {
      const all = [...(data["/v1/transactions"]?.items || []), ...(data.older || [])].filter(x => x.ticker === q.get("ticker") && (!q.get("category") || x.category === q.get("category")));
      return { status: 200, body: { items: all.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, Number(q.get("limit")) || 30) } };
    }
    if (path === "/v1/filings" && q?.get("limit")) return { status: 200, body: { items: (data["/v1/filings"]?.items || []).slice(0, Number(q.get("limit"))) } };
    if (path === "/v1/insiders" && q?.get("q")) return { status: 200, body: { items: (data[path]?.items || []).filter(p => p.owner_name.toUpperCase().includes(q.get("q").toUpperCase())) } };
    return path in data ? { status: 200, body: data[path] } : { status: 404, body: { error: "Not found" } };
  };
  fn.state = state;
  return fn;
}
// A large directory for the people page's paging check (mock only).
const MANY = { ...FULL, "/v1/insiders": { items: Array.from({ length: 100 }, (_, i) => ({ owner_name: "FIXTURE FILER " + String(i + 1).padStart(3, "0"), owner_cik: String(9000000 + i), ticker: ["AAPL", "NVDA", "MSFT", "TSLA"][i % 4], filings: 1, last_transaction_date: "2026-09-01" })) } };
const settle = async page => {
  await page.waitForFunction(() => {
    const busy = document.querySelector('main [aria-busy="true"], main .is-skeleton');
    return !busy && !/checking/i.test(document.getElementById("v4-filing-count")?.textContent || "checking");
  }, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(350);
  // Measurements see every atom at home: none still trailing a scroll or pushed by the pointer (v13-motion.js).
  await page.waitForFunction(() => ![...document.querySelectorAll("[data-hf-atom]")].some(e => e.style.getPropertyValue("--hf-dx") || e.style.getPropertyValue("--hf-dy") || e.style.getPropertyValue("--hf-s")), null, { timeout: 3000 }).catch(() => {});
};
/* Layout, not motion: the pointer leaves, then the motion layer's atoms and every finite animation inside `sel` come to
   rest, so positions compare what the layout did, not where a spring happens to be. */
const rest = async (page, sel = "main") => {
  await page.mouse.move(0, 0);
  await page.waitForFunction(sel => ![...document.querySelectorAll("[data-hf-atom]")].some(e => e.style.getPropertyValue("--hf-dx") || e.style.getPropertyValue("--hf-dy") || e.style.getPropertyValue("--hf-s")) &&
    document.getAnimations().every(a => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity || !a.effect?.target?.closest?.(sel)), sel, { timeout: 4000 }).catch(() => {});
};
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1);
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "");
// What the markup says, before CSS (text-transform: uppercase on labels, badges and buttons) changes its case.
const said = (page, sel) => page.locator(sel).first().evaluate(e => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const flat = s => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
/* Every person and company the page names has a tile of the right kind in its group (a name with its tile, a row). */
const tileAudit = page => page.evaluate(() => {
  const GROUP = ".rd-ent, .rd-co__id, .rd-row--watch, .rd-fl, .rd-sg, .rd-feed__row";
  const names = [...document.querySelectorAll("main [data-ent]")].filter(e => e.getClientRects().length);
  const missing = [];
  for (const e of names) {
    const kind = e.dataset.ent, g = e.closest(GROUP);
    const tile = g && [...g.querySelectorAll(".ins-media")].find(t => t.classList.contains("ins-media--" + kind) || t.dataset.media === kind);
    if (!tile) missing.push(kind + ": " + e.textContent.trim());
  }
  const people = [...document.querySelectorAll('main a[href^="people.html?q="], main a[href^="person.html?cik="]')].filter(a => !a.matches("[data-ent]")).map(a => a.textContent.trim());
  const companies = [...document.querySelectorAll('main a[href^="company.html?ticker="]')].filter(a => !a.matches("[data-ent]") && !a.querySelector("[data-ent]")).map(a => a.textContent.trim());
  return { names: names.length, missing, unmarkedPeople: people, unmarkedCompanies: companies };
});

try {
  /* ---------- 1. A member who follows three people, at 1440 ---------- */
  {
    const fx = fixture(FULL);
    const { context, page, errors, api } = await open(1440, fx);
    await settle(page);
    const H = await page.evaluate(() => ({
      greeting: document.querySelector("[data-greeting]")?.textContent || "",
      date: document.getElementById("rd-today-date")?.textContent || "",
      heroSearch: !!document.querySelector("#v3-search, #v3-ticker"), shortcuts: document.querySelectorAll(".rd-shortcuts").length, filingsModule: !!document.getElementById("v3-filings"),
      headerSearch: !!document.querySelector("#app-search-input"),
      order: [...document.querySelectorAll("#rd-today,#v10-follow-feed,#v10-follow-list,#v3-watchlist,#v3-notes,#rd-kpis,#rd-daily-chart,#rd-companies,#rd-largest,#v3-trades,#v4-data-state")].map(e => e.id),
      watchNew: document.querySelectorAll("#v3-watchlist .rd-row--watch .rd-new").length,
      decorativePhotos: document.querySelectorAll('.app-main img[src*="assets/img/"]').length,
      credits: !!document.querySelector("[data-media-credits]"),
      today: ["rd-today-you", "rd-today-market", "rd-today-fresh"].map(id => document.getElementById(id)?.textContent.replace(/\s+/g, " ").trim())
    }));
    check(H.greeting === "Good evening.", "greeting is set from the reader's local time (21:00)", H.greeting);
    check(H.date === "Overview · Wed, Oct 14, 2026", "Today's eyebrow names the day", H.date);
    check(!H.heroSearch && !H.shortcuts && !H.filingsModule, "no duplicate hero search, no shortcut row, no Latest filings module", H);
    check(H.headerSearch, "the header search (⌘K, /) is the page's one search");
    check(JSON.stringify(H.order) === JSON.stringify(["rd-today", "v10-follow-list", "v10-follow-feed", "v3-watchlist", "v3-notes", "rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-trades", "v4-data-state"]), "reading and tab order: Today, people you follow (who you follow, then their trades: the order phones and tablets show), watchlist, notes, across the market, all recent trades, about this data", H.order);
    check(H.watchNew === 2 && /2 companies on your watchlist have new trades\.$/.test(H.today[0]), "Today's watchlist count is the number of rows marked New in 02 (" + H.watchNew + ")", [H.watchNew, H.today[0]]);
    check(H.decorativePhotos === 0, "no decorative photographs on the dashboard", H.decorativePhotos);
    check(H.credits, "a media credits footnote ([data-media-credits]) is on the page");
    check(H.today[0] === "Since your last visit on Sep 1 at 12:00 AM: 2 new trades from 2 of the 3 people you follow. 2 companies on your watchlist have new trades.", "Today says what is new since the last visit, from the people followed and the watchlist", H.today[0]);
    check(H.today[1] === "Across all 5 trades imported from SEC filings (traded Sep 1 – Sep 12, 2026), insiders bought $42,000 and sold $327,000 of their own companies' stock.", "Today sums the latest imported trades with exact figures (the same as 03)", H.today[1]);
    check(H.today[2] === "SEC feed checked Oct 14, 2026, 09:12 UTC · newest filing published Sep 14, 2026.", "Today says how fresh the import is", H.today[2]);
    for (const route of ["/v1/me/people/updates?limit=40", "/v1/transactions?limit=100", "/v1/filings?limit=1", "/v1/me/watchlist", "/v1/me/research-decisions", "/v1/status"]) check(api.includes("GET " + route), "dashboard requests " + route, api);
    check(!api.some(a => /GET \/v1\/me\/people(\?|$)/.test(a)) && !api.some(a => /GET \/v1\/insiders/.test(a)) && !api.some(a => /\/v1\/filings\?limit=12/.test(a)), "no /v1/me/people list, no /v1/insiders (following 3 or more), no 12-filing list", api);

    // 01: the feed, in words, newest filing first; New only on rows imported after the last visit.
    const feed = await page.$$eval("#v10-follow-feed .rd-feed__row", rows => rows.map(r => ({ text: r.innerText.replace(/\s+/g, " ").trim(), owner: r.dataset.owner, isNew: !!r.querySelector(".rd-new"), label: r.getAttribute("aria-label"), filing: r.querySelector('a[href^="filing.html"]')?.getAttribute("href"), tiles: [...r.querySelectorAll(".ins-media")].map(t => t.classList.contains("ins-media--person") ? "person" : "company") })));
    check(feed.length === 5, "the feed shows every line the followed people filed (5)", feed.length);
    check(/^Timothy D\. Cook Sold · S 12,500 AAPL shares at \$26\.00 = \$325,000 New since your last visit Apple Inc\. · traded Sep 12, 2026 · filed Sep 14, 2026 \(2 days later\) · Filing ↗$/i.test(feed[0]?.text), "feed row 1: who, what (word + code), then shares × price = value without repeating the verb, company, trade and filing dates with the lag", feed[0]?.text);
    check(/^Jen Hsun Huang Bought · P 1,500 NVDA shares at \$28\.00 = \$42,000 New since your last visit NVIDIA Corp · /i.test(feed[1]?.text), "feed row 2: a purchase, marked New", feed[1]?.text);
    check(/Gift · G 5,000 AAPL shares given Apple Inc\./i.test(feed[2]?.text) && !feed[2]?.isNew, "a gift reads as a gift, not new (imported before the last visit)", feed[2]);
    check(/Tax withholding · F 2,000 AAPL shares withheld for tax or the exercise price/i.test(feed[3]?.text), "a code F line reads as tax withholding", feed[3]?.text);
    check(/^Elon Musk Sold · S 1,000 TSLA shares at \$250\.00 = \$250,000/i.test(feed[4]?.text) && /traded Jun 2, 2026 · filed Jun 4, 2026/.test(feed[4]?.text), "an older sale from a followed person", feed[4]?.text);
    check(!/(Sold · S sold|Bought · P bought|Grant · A received|Gift · G (gave|received))/i.test(feed.map(r => r.text).join(" ")), "no feed line repeats its badge's verb");
    check(await said(page, "#v10-follow-more") === "", "every loaded line is on screen, so there is no Show more", await said(page, "#v10-follow-more"));
    check(feed.filter(r => r.isNew).length === 2 && feed[0].isNew && feed[1].isNew, "New marks exactly the rows imported after the seeded last visit", feed.map(r => r.isNew));
    check(feed[0]?.label === "Timothy D. Cook sold 12,500 Apple Inc. shares at $26.00, worth $325,000. Traded Sep 12, 2026, filed Sep 14, 2026. New since your last visit.", "each feed row's label is the full sentence", feed[0]?.label);
    check(feed.every(r => /^filing\.html\?accession=\d{18}$/.test(r.filing || "")) && feed.every(r => r.tiles.includes("person") && r.tiles.includes("company")), "each feed row links its filing and carries a headshot tile and a logo tile", feed);
    const list = await page.$$eval("#v10-follow-list .rd-fl", rows => rows.map(r => ({ text: r.innerText.replace(/\s+/g, " ").trim(), owner: r.dataset.owner, btn: r.querySelector("button[data-follow]")?.textContent, pressed: r.querySelector("button[data-follow]")?.getAttribute("aria-pressed"), label: r.querySelector("button[data-follow]")?.getAttribute("aria-label") })));
    check(await said(page, "#rd-list-label") === "Following · 3" && list.length === 3, "the followed list names everyone followed (Following · 3)", list);
    check(/^Timothy D\. Cook AAPL · 1 new 30 days: bought \$0 · sold \$325,000 in 1 trade Following ✓$/i.test(list[0]?.text) && list[0]?.pressed === "true" && list[0]?.label === "Unfollow Timothy D. Cook", "a followed person: ticker, how many lines are new, the last 30 days in exact dollars, a Following ✓ button that says what it does", list[0]);
    check(list.some(l => /^Elon Musk TSLA No trades in 30 days · last filed Jun 4, 2026 Following ✓$/i.test(l.text)), "a quiet person says when they last filed", list.map(l => l.text));
    const sugg = await page.$$eval("#v10-follow-suggest-list .rd-sg", rows => rows.map(r => ({ owner: r.dataset.owner, text: r.innerText.replace(/\s+/g, " ").trim(), btn: r.querySelector("button")?.textContent, label: r.querySelector("button")?.getAttribute("aria-label") })));
    check(sugg.length >= 2 && sugg.every(s => ![COOK, HUANG, MUSK].includes(s.owner)) && sugg.every(s => s.btn === "Follow +" && /^Follow /.test(s.label)), "suggestions exclude followed people and each has Follow +", sugg);
    check(/^Public Filer Other Files for AAPL · Apple Inc\. Sold \$2,000 in 1 trade Follow \+$/i.test(sugg[0]?.text), "suggestions are ranked by priced value in the latest imports and say what the person traded", sugg[0]?.text);
    check(await page.locator("#v10-follow-suggest.is-compact").count() === 1 && /^More people to follow/.test(await said(page, "#v10-follow-suggest-title")), await said(page, "#v10-follow-suggest-title"), "when following people, suggestions are one compact row");

    // describe(): every code in words.
    const words = await page.evaluate(() => {
      const D = window.InsidirDesk, d = x => { const r = D.describe(x); return r.word + " | " + r.text + (D.valueText(x) ? " | " + D.valueText(x) : "") + (r.suffix ? " | " + r.suffix : ""); };
      const base = { ticker: "TSLA", issuer_name: "Tesla, Inc.", security_title: "Common Stock" };
      return {
        P: d({ ...base, transaction_code: "P", category: "reported_purchase", acquired_disposed: "A", shares: 150000, price_per_share: 249, estimated_value: 37350000 }),
        S: d({ ...base, transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: "12500", price_per_share: "26", estimated_value: "325000", direct_ownership: "I" }),
        Snoprice: d({ ...base, transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: 100, price_per_share: null, estimated_value: null }),
        A: d({ ...base, transaction_code: "A", category: "other", acquired_disposed: "A", shares: 900 }),
        M: d({ ...base, transaction_code: "M", category: "other", acquired_disposed: "A", derivative: true, security_title: "Restricted Stock Units", shares: 3300 }),
        F: d({ ...base, transaction_code: "F", category: "other", acquired_disposed: "D", shares: 2000, price_per_share: 230.5, estimated_value: 461000 }),
        Gd: d({ ...base, transaction_code: "G", category: "other", acquired_disposed: "D", shares: 5000 }),
        Ga: d({ ...base, transaction_code: "G", category: "other", acquired_disposed: "A", shares: 5000 }),
        C: d({ ...base, transaction_code: "C", category: "other", acquired_disposed: "A", security_title: "Series A Preferred", shares: 10 }),
        D: d({ ...base, transaction_code: "D", category: "other", acquired_disposed: "D", shares: 40 }),
        Pderiv: d({ ...base, transaction_code: "P", category: "other", acquired_disposed: "A", derivative: true, security_title: "Call Option", shares: 10 }),
        amended: d({ ...base, transaction_code: "P", category: "reported_purchase", acquired_disposed: "A", shares: 1, price_per_share: 2, estimated_value: 2, is_amendment: true }),
        // The Table I line of an option exercise or RSU vesting: the common shares received (or given up), not "derivative securities".
        Mcommon: d({ ...base, transaction_code: "M", category: "other", acquired_disposed: "A", derivative: false, shares: 3300 }),
        McommonD: d({ ...base, transaction_code: "M", category: "other", acquired_disposed: "D", derivative: false, shares: 3300 }),
        Ccommon: d({ ...base, transaction_code: "C", category: "other", acquired_disposed: "A", derivative: false, shares: 10 }),
        // Exact figures as filed (form4-words.js, shared with the personnel file): every decimal of shares and price up to 8, values to the cent.
        exact: d({ ...base, transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: "1200.12345678", price_per_share: "2622.54298031", estimated_value: "3147051.58" }),
        exactDash: [D.price("41.53210000"), D.money("1132000.00"), D.money(3147051.58), D.qty("0.00000001"), D.signedMoney(-285000), D.signedMoney(0.1 + 0.2)].join(" | "),
        same: window.InsidirForm4 && window.InsidirForm4.describe === undefined ? "missing" : typeof window.InsidirForm4?.describe,
        // A joint filing (several reporting owners, no single owner CIK): each owner is named and linked to their own file.
        joint: (() => { const x = { ...base, owner_cik: null, owner_name: "COOK TIMOTHY D, OTHER PUBLIC FILER", owners: [{ cik: "0001214156", name: "COOK TIMOTHY D" }, { cik: "0000067890", name: "OTHER PUBLIC FILER" }], transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: 10, price_per_share: 5, estimated_value: 50, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" };
          const box = document.createElement("div"); box.innerHTML = D.personName(x); return [...box.querySelectorAll("a[data-ent=person]")].map(a => a.getAttribute("href") + " " + a.textContent).join(" | ") + " [" + (box.querySelector(".rd-who__more")?.textContent || "") + "] || " + D.sentence(x); })(),
        // Imported before the owners were recorded: owner_name only. And a line whose owners list holds one CIK.
        jointNoList: (() => { const x = { ...base, owner_cik: null, owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L", transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: 10, price_per_share: 5, estimated_value: 50, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" };
          const box = document.createElement("div"); box.innerHTML = D.personName(x); return [...box.querySelectorAll("a[data-ent=person]")].map(a => a.getAttribute("href") + " " + a.textContent).join(" | ") + " [" + (box.querySelector(".rd-who__more")?.textContent || "") + "] || " + D.sentence(x); })(),
        jointOneCik: (() => { const x = { ...base, owner_cik: null, owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L", owners: [{ cik: "0001214156", name: "COOK TIMOTHY D" }], transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: 10, price_per_share: 5, estimated_value: 50, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" };
          const box = document.createElement("div"); box.innerHTML = D.personName(x); return [...box.querySelectorAll("a[data-ent=person]")].map(a => a.getAttribute("href") + " " + a.textContent).join(" | ") + " [" + (box.querySelector(".rd-who__more")?.textContent || "") + "] || " + D.sentence(x); })(),
        coNames: ["OCCIDENTAL PETROLEUM CORP /DE/", "FOO BANCORP INC /NEW/", "Already Written Co /de/x", "JPMORGAN CHASE & CO /MD"].map(n => D.companyName(n)).join(" | "),
        unshared: d({ ...base, transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: null, price_per_share: 5, estimated_value: null }),
        zero: d({ ...base, transaction_code: "P", category: "reported_purchase", acquired_disposed: "A", shares: 10, price_per_share: 0, estimated_value: 0 }),
        // Sentences for screen readers: the name, then a verb; qualifiers as their own capitalised sentences.
        sJ: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "J", category: "other", acquired_disposed: "A", shares: 7, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        sE: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "E", category: "other", acquired_disposed: "D", derivative: true, security_title: "Put Option", shares: 1000, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        sK: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "K", category: "other", acquired_disposed: "A", shares: 5, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        sL: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "L", category: "other", acquired_disposed: "A", shares: 5, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        sH: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "H", category: "other", acquired_disposed: "D", derivative: true, security_title: "", shares: 5, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        sIndirect: D.sentence({ ...base, owner_name: "COOK TIMOTHY D", transaction_code: "S", category: "reported_sale", acquired_disposed: "D", shares: 1, price_per_share: 2, estimated_value: 2, direct_ownership: "I", is_amendment: true, transaction_date: "2026-09-01", published_at: "2026-09-03T20:00:00Z" }),
        endName: D.endName("James D. Farley Jr.") + "|" + D.endName("Timothy D. Cook")
      };
    });
    check(words.P === "Bought | bought 150,000 TSLA shares at $249.00 | = $37,350,000", "describe P: bought N shares at $p = $v", words.P);
    check(words.S === "Sold | sold 12,500 TSLA shares at $26.00 | = $325,000 | · held indirectly (by a trust or family member, for example)", "describe S: sold N shares at $p = $v, held indirectly in words", words.S);
    check(words.Snoprice === "Sold | sold 100 TSLA shares (no price reported) | value not reported", "describe S without a price says so", words.Snoprice);
    check(words.A === "Grant | received 900 TSLA shares as a grant or award", "describe A: received N shares as a grant or award", words.A);
    check(words.M === "Option exercise | exercised or converted 3,300 Restricted Stock Units", "describe M: exercised or converted N units", words.M);
    check(words.F === "Tax withholding | had 2,000 TSLA shares withheld to pay tax or the exercise price", "describe F: shares withheld for tax, no value counted", words.F);
    check(words.Gd === "Gift | gave 5,000 TSLA shares as a gift" && words.Ga === "Gift | received 5,000 TSLA shares as a gift", "describe G: gave or received N shares as a gift", [words.Gd, words.Ga]);
    check(words.C === "Conversion | converted 10 Series A Preferred into TSLA shares" && words.D === "Returned | returned 40 shares to TSLA" && words.Pderiv === "Bought | bought 10 Call Option", "describe C, D and a derivative P", [words.C, words.D, words.Pderiv]);
    check(/· amended filing \(4\/A\)$/.test(words.amended), "describe marks an amended filing (4/A)", words.amended);
    check(words.Mcommon === "Option exercise | acquired 3,300 TSLA shares by exercising or converting derivative securities" && words.McommonD === "Option exercise | disposed of 3,300 TSLA shares by exercising or converting derivative securities" && words.Ccommon === "Conversion | acquired 10 TSLA shares by converting a derivative security", "describe M/C on the common-stock line: the shares received or given up, not 'N derivative securities' (the wording the personnel file uses)", [words.Mcommon, words.McommonD, words.Ccommon]);
    check(words.exact === "Sold | sold 1,200.12345678 TSLA shares at $2,622.54298031 | = $3,147,051.58" && words.exactDash === "$41.5321 | $1,132,000 | $3,147,051.58 | 0.00000001 | −$285,000 | +$0.30" && words.same === "function", "figures are written from their digits as filed (shares and prices to 8 decimals, values to the cent), by the shared form4-words.js", [words.exact, words.exactDash, words.same]);
    check(words.unshared === "Sold | sold an unreported number of TSLA shares at $5.00 | value not reported" && words.zero === "Bought | bought 10 TSLA shares at $0.00 | = $0", "a priced sale with no share count reads 'value not reported'; '= $0' only for a $0.00 price on a known share count", [words.unshared, words.zero]);
    check(words.sJ === "Timothy D. Cook acquired 7 Tesla, Inc. shares in another kind of transaction, described in the filing. Traded Sep 1, 2026, filed Sep 3, 2026." &&
      words.sE === "Timothy D. Cook let a Put Option position of 1,000 expire. Traded Sep 1, 2026, filed Sep 3, 2026." &&
      words.sK === "Timothy D. Cook acquired 5 Tesla, Inc. shares through an equity swap. Traded Sep 1, 2026, filed Sep 3, 2026." &&
      words.sL === "Timothy D. Cook made a small acquisition of 5 Tesla, Inc. shares. Traded Sep 1, 2026, filed Sep 3, 2026." &&
      words.sH === "Timothy D. Cook had a derivative position of 5 expire or be cancelled, with value received. Traded Sep 1, 2026, filed Sep 3, 2026.", "J, K, L, E and H read as sentences led by a verb", [words.sJ, words.sE, words.sK, words.sL, words.sH]);
    check(words.sIndirect === "Timothy D. Cook sold 1 Tesla, Inc. shares at $2.00, worth $2. Traded Sep 1, 2026, filed Sep 3, 2026. An amended filing (Form 4/A) restating an earlier one. Held indirectly (by a trust or family member, for example).", "qualifiers are their own capitalised sentences for screen readers", words.sIndirect);
    check(words.endName === "James D. Farley Jr|Timothy D. Cook", "a name that ends in a full stop takes no second one in a notice", words.endName);
    check(words.joint === "person.html?cik=1214156 Timothy D. Cook [and 1 other] || Timothy D. Cook and Public Filer Other sold 10 Tesla, Inc. shares at $5.00, worth $50. Traded Sep 1, 2026, filed Sep 3, 2026.", "a joint filing is one label: its first person linked to their own file, then 'and 1 other'; the sentence names both owners", words.joint);
    check(words.jointNoList === "people.html?q=COOK%20TIMOTHY%20D#v10-directory Timothy D. Cook [and 1 other] || Timothy D. Cook and Katherine L. Adams sold 10 Tesla, Inc. shares at $5.00, worth $50. Traded Sep 1, 2026, filed Sep 3, 2026." &&
      words.jointOneCik === "person.html?cik=1214156 Timothy D. Cook [and 1 other] || Timothy D. Cook and Katherine L. Adams sold 10 Tesla, Inc. shares at $5.00, worth $50. Traded Sep 1, 2026, filed Sep 3, 2026.",
      "a joint line with no owners list (or one owner's CIK only) names each owner on their own, never the joined owner_name as one person; a CIK is linked whenever the line lists it", [words.jointNoList, words.jointOneCik]);
    check(words.coNames === "Occidental Petroleum Corp | Foo Bancorp Inc. | Already Written Co /de/x | JPMorgan Chase & Co", "issuer names drop EDGAR's state and series tags (/DE/, /NEW/, /MD)", words.coNames);

    // 02: watchlist and notes.
    const watch = await page.$$eval("#v3-watchlist .rd-row--watch", rows => rows.map(r => ({ href: r.querySelector("a.rd-row__link")?.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ").trim(), isNew: !!r.querySelector(".rd-new") })));
    check(watch.length === 4, "watchlist shows every saved company (4)", watch);
    check(watch[0]?.href === "company.html?ticker=AAPL" && /Timothy D\. Cook sold 12,500 shares at \$26\.00 = \$325,000 · traded Sep 12, filed Sep 14 \(2 days later\)/.test(watch[0]?.text) && watch[0]?.isNew, "AAPL: its latest purchase or sale in a sentence, with the filing lag, marked New", watch[0]);
    check(/Jen Hsun Huang bought 1,500 shares at \$28\.00 = \$42,000/.test(watch[1]?.text) && /Also filed since: option exercise by Colette Kress \(Sep 11\)/.test(watch[1]?.text), "NVDA: the latest purchase, then a later option exercise as 'Also filed since'", watch[1]?.text);
    check(/Elon Musk sold 1,000 shares at \$250\.00 = \$250,000 · traded Jun 2, filed Jun 4 \(2 days later\)/.test(watch[2]?.text), "a watched ticker outside the window shows its own latest sale (looked up)", watch[2]?.text);
    check(/IBM.*No insider filings imported yet/.test(watch[3]?.text), "a watched ticker with no records says so plainly", watch[3]?.text);
    const lookups = api.filter(a => /\/v1\/transactions\?ticker=/.test(a)).sort();
    check(JSON.stringify(lookups) === JSON.stringify(["GET /v1/transactions?ticker=IBM&category=reported_purchase&limit=1", "GET /v1/transactions?ticker=IBM&category=reported_sale&limit=1", "GET /v1/transactions?ticker=IBM&limit=20", "GET /v1/transactions?ticker=TSLA&category=reported_purchase&limit=1", "GET /v1/transactions?ticker=TSLA&category=reported_sale&limit=1"]),
      "per-ticker lookups only for watched tickers with no purchase or sale in the window: the latest purchase and sale anywhere in the import, then the latest 20 lines only when there is neither; each asked once (Today and 02 share them)", lookups);
    const notes = await page.$$eval("#v3-notes .rd-row--note", rows => rows.map(r => ({ href: r.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ").trim(), logo: !!r.querySelector(".ins-media--company") })));
    check(notes.length === 2 && notes[0].href === "research.html?ticker=AAPL" && /Researching/.test(notes[0].text) && /latest 10-K/.test(notes[0].text) && /Sep 2, 2026/.test(notes[0].text) && notes.every(n => n.logo), "notes: status, text, date, a logo on each row, linking the research desk", notes);
    const noteX = await page.$$eval("#v3-notes .rd-row__detail", d => d.map(e => Math.round(e.getBoundingClientRect().left)));
    check(noteX.length === 2 && noteX[0] === noteX[1], "note text starts at the same x on every row", noteX);

    // 03: exact totals.
    const flow = await page.evaluate(() => ({
      scope: document.getElementById("rd-flow-scope").textContent,
      kpis: Object.fromEntries([...document.querySelectorAll(".rd-kpi")].map(k => [[...k.querySelector(".rd-kpi__label").childNodes].filter(n => n.nodeType === 3 || getComputedStyle(n).display !== "none").map(n => n.textContent).join("").trim(), k.querySelector(".rd-kpi__value").textContent.trim() + " | " + k.querySelector(".rd-kpi__note").textContent.replace(/ /g, " ").trim()])),
      days: [...document.querySelectorAll("#rd-daily-chart .rd-day")].map(d => d.getAttribute("aria-label")),
      tabStops: [...document.querySelectorAll("#rd-daily-chart .rd-day")].filter(d => d.tabIndex === 0).length,
      up: [...document.querySelectorAll("#rd-daily-chart .rd-day__bar--up")].map(b => getComputedStyle(b).backgroundColor),
      down: [...document.querySelectorAll("#rd-daily-chart .rd-day__bar--down")].map(b => getComputedStyle(b).backgroundColor),
      zero: !!document.querySelector("#rd-daily-chart .rd-dchart__grid--zero"),
      companies: [...document.querySelectorAll("#rd-companies .rd-co__row")].map(r => r.innerText.replace(/\s+/g, " ")),
      largest: [...document.querySelectorAll("#rd-largest .rd-big")].map(r => r.innerText.replace(/\s+/g, " "))
    }));
    check(flow.scope === "All 5 trades imported from SEC Form 4 filings: traded Sep 1 – Sep 12, 2026 · 3 companies · 5 people.", "03 names exactly which trades it covers", flow.scope);
    check(flow.kpis.Bought === "$42,000 | 1 purchase · 1,500 shares", "Bought: value, count and shares", flow.kpis.Bought);
    check(flow.kpis.Sold === "$327,000 | 2 sales · 12,600 shares", "Sold: value, count and shares", flow.kpis.Sold);
    check(flow.kpis["Bought minus sold"] === "−$285,000 | More sold than bought", "Bought minus sold, signed and explained", flow.kpis["Bought minus sold"]);
    check(flow.kpis["Not a purchase or sale"] === "2 | Grant (1), option exercise (1). No dollar value counted.", "lines that are not purchases or sales are counted, named in words and never valued", flow.kpis["Not a purchase or sale"]);
    check(flow.kpis["Days to report"] === "2 days | Median from trade to SEC filing · range 1–9 days", "days to report: median and range", flow.kpis["Days to report"]);
    check(flow.days.length === 3 && flow.days[0] === "Sep 1, 2026: bought $0 (0 trades), sold $2,000 (1 trade), net −$2,000" && flow.days[2] === "Sep 12, 2026: bought $0 (0 trades), sold $325,000 (1 trade), net −$325,000", "by trade date: one column per day with an exact label", flow.days);
    check(flow.tabStops === 1, "the chart is one tab stop", flow.tabStops);
    check(flow.up.length === 1 && flow.up.every(c => c === "rgb(47, 153, 106)") && flow.down.length === 2 && flow.down.every(c => c === "rgb(249, 65, 68)") && flow.zero, "bought is green above the zero line, sold red below", flow);
    check(flow.companies.length === 2 && /^AAPL/.test(flow.companies[0]) && /−\$327,000/.test(flow.companies[0]) && /Sold \$327,000 in 2 sales/.test(flow.companies[0]) && /^NVDA/.test(flow.companies[1]) && /Bought \$42,000 in 1 purchase/.test(flow.companies[1]), "by company: largest total first, exact net and values", flow.companies);
    check(flow.largest.length === 3 && /^01 \$325,000/.test(flow.largest[0]) && /12,500 shares × \$26\.00/.test(flow.largest[0]) && /filed Sep 14 \(2 days later\)/.test(flow.largest[0]) && /^03 \$2,000/.test(flow.largest[2]) && /9 days later/.test(flow.largest[2]), "biggest trades ranked by value with shares × price and the lag", flow.largest);
    await page.locator("#rd-daily-chart").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.hover("#rd-daily-chart .rd-day:last-child");
    await page.waitForTimeout(150);
    const tip = await page.evaluate(() => { const t = document.getElementById("rd-tip"); return { hidden: t.hidden, text: t.innerText.replace(/\s+/g, " ") }; });
    check(!tip.hidden && /Sep 12, 2026/i.test(tip.text) && /\$325,000 Sold · 1/.test(tip.text) && /Net −\$325,000/.test(tip.text), "hovering a day shows its exact values", tip);
    await page.mouse.move(0, 0);
    await page.focus("#rd-daily-chart .rd-day[tabindex='0']");
    await page.keyboard.press("Home");
    await page.waitForTimeout(80);
    check(await page.evaluate(() => !document.getElementById("rd-tip").hidden && /Sep 1, 2026/i.test(document.getElementById("rd-tip").innerText) && document.activeElement?.dataset.day === "0"), "the arrow keys move between days and the readout follows focus");
    await page.keyboard.press("Escape");
    const h0 = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.click('#rd-daily-switch button[data-view="table"]');
    await page.waitForTimeout(300);
    const dt = await page.evaluate(() => ({ pressed: document.querySelector('#rd-daily-switch button[data-view="table"]').getAttribute("aria-pressed"), active: document.getElementById("rd-daily-table").classList.contains("is-active"), chartInert: document.getElementById("rd-daily-chart").inert, rows: [...document.querySelectorAll("#rd-daily-table tbody tr")].map(r => r.innerText.replace(/\s+/g, " ")), h: document.documentElement.scrollHeight }));
    check(dt.pressed === "true" && dt.active && dt.chartInert && dt.rows.length === 3 && /Sep 12, 2026 \$0 \(0\) \$325,000 \(1\) −\$325,000/.test(dt.rows[0]), "Chart | Table: the table of every trade day, in the same frame", dt);
    check(dt.h === h0, "switching to the table does not change the page height", [h0, dt.h]);
    await page.click('#rd-daily-switch button[data-view="chart"]');

    // 04: every recent trade, in words and figures.
    const rows = async () => page.$$eval("#v3-trades tr", r => r.map(x => x.innerText.replace(/\s+/g, " ")));
    let t = await rows();
    check(t.length === 5, "all recent trades show the 5 fixture lines", t);
    check(/Timothy D\. Cook/.test(t[0]) && /AAPL/.test(t[0]) && /Apple Inc\./.test(t[0]) && /Sold · S/i.test(t[0]) && /−12,500/.test(t[0]) && /\$26\.00/.test(t[0]) && /\$325,000/.test(t[0]) && /Sep 12, 2026/.test(t[0]) && /Sep 14, 2026/.test(t[0]) && /2 days later/.test(t[0]), "a trade row: person, company, Sold · S, signed shares, price, value, traded, filed and the lag in words", t[0]);
    check(/Option exercise · M/i.test(t[1]) && /Restricted Stock Units/.test(t[1]) && /No price/.test(t[1]) && /Not counted/.test(t[1]), "an option exercise: no price, no value counted", t[1]);
    check(/Grant · A/i.test(t[3]) && / 900 /.test(t[3]), "a grant reads Grant · A; a share count with no reported direction carries no sign", t[3]);
    check(await page.getAttribute("#v3-trades tr:first-child .rd-type", "title") === "S — Open market or private sale", "each code keeps its SEC meaning in the badge title");
    const tradeLinks = await page.$$eval("#v3-trades tr:first-child a", a => a.map(x => x.getAttribute("href")));
    check(tradeLinks.includes("person.html?cik=1214156") && tradeLinks.includes("company.html?ticker=AAPL") && tradeLinks.includes("filing.html?accession=000032019326000001"), "a trade row links the person's file (by SEC CIK), the company and the filing", tradeLinks);
    // Every person named on the overview opens their own file: feed, followed list, suggestions, watchlist, biggest trades, trades table.
    const named = await page.evaluate(() => {
      const where = { feed: "#v10-follow-feed", list: "#v10-follow-list", suggest: "#v10-follow-suggest-list", watch: "#v3-watchlist", big: "#rd-largest", trades: "#v3-trades" };
      const out = {};
      for (const [k, sel] of Object.entries(where)) out[k] = [...document.querySelectorAll(sel + " [data-ent=person]")].map(e => e.tagName === "A" ? e.getAttribute("href") : "(not a link) " + e.textContent.trim());
      return out;
    });
    const allNamed = Object.values(named).flat();
    check(Object.values(named).every(l => l.length > 0) && allNamed.every(h => /^person\.html\?cik=[1-9]\d{0,9}$/.test(h)), "every person named on the overview links to person.html?cik=<owner CIK without leading zeros> (" + allNamed.length + " names in 6 modules)", named);
    check(named.feed[0] === "person.html?cik=1214156" && named.watch.includes("person.html?cik=1214156") && named.watch.includes("person.html?cik=1580197") && named.big.includes("person.html?cik=1049502"), "the CIK in each link is the line's own owner (Cook, the 'Also filed since' person, the biggest trades)", named);
    // Headshots are asked for with the company's CIK too (entity-media.js uses it when a row has no ticker).
    const issuerCiks = await page.$$eval("#v3-trades [data-media=person], #v10-follow-feed [data-media=person], #v10-follow-list [data-media=person], #rd-largest [data-media=person]", t => t.map(e => e.dataset.issuerCik || ""));
    check(issuerCiks.length >= 10 && issuerCiks.every(c => /^\d+$/.test(c)), "every headshot tile in the feed, the followed list, the biggest trades and the table names the person's company by SEC CIK (issuerCik)", issuerCiks);
    const linkEdges = await page.$$eval("#v3-trades .rd-links a", a => [...new Set(a.map(x => Math.round(x.getBoundingClientRect().right)))]);
    check(linkEdges.length === 1, "every Filing ↗ link in the table ends at the same right edge (rows with and without a security note alike)", linkEdges);
    const foot = flat(await text(page, "#v3-trades-foot"));
    check(foot === "Showing all 5 trades. Browse every filing ↗ Codes: P bought on the market, S sold on the market, A grant or award, M option exercise.", "the foot says what is shown and explains only the codes on screen", foot);
    const chips = [];
    for (const f of ["all", "reported_purchase", "reported_sale", "other"]) chips.push(await said(page, `[data-filter="${f}"]`));
    check(JSON.stringify(chips) === JSON.stringify(["All 5", "Purchases 1", "Sales 2", "Grants, exercises & gifts 2"]), "filters name what they hold, with real counts (5 / 1 / 2 / 2)", chips);
    await page.locator(".rd-filters").scrollIntoViewIfNeeded();
    const hBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    const heights = [], colsOf = () => page.$$eval(".rd-table--trades thead th", t => t.map(th => { const r = th.getBoundingClientRect(); return Math.round(r.left * 10) / 10 + "+" + Math.round(r.width * 10) / 10; }).join(" ")), cols = [await colsOf()];
    await page.click('[data-filter="reported_purchase"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 1 && /NVDA/.test(t[0]) && /Bought · P/i.test(t[0]), "Purchases shows only purchases", t);
    check(await page.getAttribute('[data-filter="reported_purchase"]', "aria-pressed") === "true" && await text(page, "#v3-trades-status") === "Showing 1 purchase", "the pressed filter is announced (aria-pressed, live region)");
    await page.click('[data-filter="reported_sale"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 2 && t.every(r => /Sold · S/i.test(r)), "Sales shows only sales", t);
    await page.click('[data-filter="other"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 2 && /Option exercise · M/i.test(t[0]) && /Grant · A/i.test(t[1]), "Grants, exercises & gifts shows the other codes", t);
    cols.push(await colsOf());
    await page.click('[data-filter="all"]'); await page.waitForTimeout(400); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    cols.push(await colsOf());
    check((await rows()).length === 5, "All restores every row");
    check(new Set(cols).size === 1, "filtering never moves a column heading (the columns keep the widths All gave them)", cols);
    check(heights.every(h => h === hBefore), "filters never change the page height (the table keeps the height of All)", [hBefore, ...heights]);

    // Colour: green and red carry direction; nothing is orange.
    const orange = await page.evaluate(() => {
      const warm = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return false; const [r, g, b, a = 1] = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return a > 0.05 && r > 110 && r - g > 35 && g - b > 15 && r - b > 70; };
      const found = [];
      for (const e of document.querySelectorAll("body *")) {
        const txt = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
        for (const pe of [null, "::before", "::after"]) {
          const cs = getComputedStyle(e, pe);
          if (pe && (cs.content === "none" || cs.content === "normal")) continue;
          const border = ["Top", "Right", "Bottom", "Left"].some(side => parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none" && warm(cs["border" + side + "Color"]));
          if (border || [cs.backgroundColor, cs.fill, cs.stroke, cs.boxShadow, cs.outlineStyle !== "none" ? cs.outlineColor : ""].some(warm) || (warm(cs.color) && (pe ? cs.content !== '""' : txt))) found.push(e.tagName.toLowerCase() + "." + [...e.classList].join(".") + (pe || ""));
        }
      }
      return found.slice(0, 8);
    });
    check(orange.length === 0, "nothing on the dashboard is orange (the logo's full stop included)", orange);
    const badges = await page.evaluate(() => ({ sale: getComputedStyle(document.querySelector("#v3-trades .rd-type--sell")).color, buy: getComputedStyle(document.querySelector("#v3-trades .rd-type--buy")).color, newMark: getComputedStyle(document.querySelector(".rd-new")).color }));
    check(badges.sale === "rgb(249, 65, 68)" && badges.buy === "rgb(47, 153, 106)" && badges.newMark === "rgb(233, 228, 218)", "sold is red, bought green, New is ink (not a colour)", badges);

    // 05: about this data.
    // The line as drawn: visible labels, values, and the " · " separators and full stop CSS puts between them.
    const about = await page.evaluate(() => {
      const pseudo = (e, p) => { const c = getComputedStyle(e, p).content; return c && c !== "none" && c !== "normal" ? c.replace(/^"|"$/g, "") : ""; };
      return { shown: [...document.querySelectorAll("#rd-about > li")].map(d => pseudo(d, "::before") + d.textContent.replace(/\s+/g, " ").trim() + pseudo(d, "::after")).join(""), hidden: document.querySelectorAll("#rd-about .sr-only").length, items: document.querySelectorAll("#rd-about > li").length };
    });
    check(about.shown === "Source: SEC EDGAR, Form 4 · Status: Online · 1,234 filings imported · last SEC feed check Oct 14, 2026, 09:12 UTC · newest filing published Sep 14, 2026." && about.items === 5, "about this data reads as one line with exact figures", about);
    check(about.hidden === 0, "about this data says each fact once to a screen reader (no hidden label repeating the words shown)", about);

    // Tiles: every name has its logo or headshot.
    const tiles = await tileAudit(page);
    check(tiles.names >= 30 && tiles.missing.length === 0, "every person and company named on the page has a tile of the right kind (" + tiles.names + " names)", tiles.missing);
    check(tiles.unmarkedPeople.length === 0 && tiles.unmarkedCompanies.length === 0, "every person and company link is a named entity with a tile", tiles);
    const personTiles = await page.$$eval("#v3-trades .ins-media--person, #v10-follow-feed .ins-media--person", t => t.length);
    check(personTiles >= 10, "headshot tiles are drawn for every person in the feed and the table", personTiles);

    // Links: every same-origin link returns 200, none goes to the landing page.
    const links = await page.$$eval("a[href]", as => as.map(a => ({ raw: a.getAttribute("href"), abs: a.href })));
    const internal = [...new Set(links.filter(l => l.abs.startsWith(base + "/")).map(l => l.abs.split("#")[0]))];
    const bad = [];
    for (const href of internal) { const r = await fetch(href); if (r.status !== 200) bad.push(href + " → " + r.status); }
    check(bad.length === 0, "all " + internal.length + " internal links return 200", bad);
    const landing = links.filter(l => /^(\/|\/?index\.html)([?#].*)?$/.test(l.raw) || /^#/.test(l.raw) && l.raw !== "#Content");
    check(landing.length === 0, "no link points to the landing page or an in-page anchor", landing);
    const external = links.filter(l => /^https?:/.test(l.raw) && !l.abs.startsWith(base));
    check(external.every(l => /^https:\/\/(www\.sec\.gov|sec\.gov|commons\.wikimedia\.org)\//.test(l.raw)), "external links only go to the SEC or Wikimedia Commons over https", external.map(l => l.raw));
    check(errors.length === 0, "no console, page or HTTP errors with full data", errors);
    await context.close();
  }

  /* ---------- 1b. First visit in this browser: nothing is marked New, and the visit is remembered ---------- */
  {
    const { context, page, errors } = await open(1440, fixture(FULL), { seen: null });
    await settle(page);
    const r = await page.evaluate(() => ({ you: document.getElementById("rd-today-you").textContent.trim(), marks: document.querySelectorAll(".rd-new").length, newCounts: document.querySelectorAll(".rd-fl__new").length }));
    check(r.you === "You follow 3 people. Trades they file from now on are marked New." && r.marks === 0 && r.newCounts === 0, "first visit: no New markers, and Today says what will be marked", r);
    await page.waitForTimeout(4100);
    const saved = await page.evaluate(() => { dispatchEvent(new Event("pagehide")); return localStorage.getItem("insidir:overview:last-seen"); });
    check(saved === "2026-10-14T21:00:00.000Z", "after 4 s on the page, leaving records the time of this visit (not of leaving)", saved);
    const counts = await page.evaluate(() => JSON.parse(localStorage.getItem("insidir:overview:counts") || "{}"));
    check(counts.feed === 5 && counts.follows === 3 && counts.watch === 4 && counts.notes === 2 && counts.heights && counts.heights.w === 1440, "row counts and module heights are kept for the next visit's skeletons", counts);
    check(errors.length === 0, "no errors on a first visit", errors);
    await context.close();
  }

  /* ---------- 1c. Follow, unfollow and Undo, live, with nothing moving under the pointer ---------- */
  {
    const fx = fixture(FULL, { followFails: cik => cik === NADELLA });
    const { context, page, errors, api } = await open(1440, fx);
    await settle(page);
    const btn = page.locator(`#v10-follow-suggest-list button[data-follow="${OTHER}"]`);
    await btn.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
    const [y0, w0] = await btn.evaluate(b => [b.getBoundingClientRect().top, b.getBoundingClientRect().width]);
    // Watch the feed for 2.5 s from the click: each row's translate per frame, New markers popping again, the notice.
    await page.evaluate(() => {
      const W = window.__watch = { tr: {}, pops: 0, toast: "" };
      document.querySelectorAll("#v10-follow-feed .rd-new").forEach(e => { e.dataset.was = "1"; });
      addEventListener("animationstart", e => { if (e.animationName === "rd-pop" && e.target.dataset?.was) W.pops++; }, true);
      const box = document.getElementById("rd-toast");
      new MutationObserver(() => { const t = box.textContent.replace(/\s+/g, " ").trim(); if (t && !W.toast) W.toast = t; }).observe(box, { childList: true, characterData: true, subtree: true });
      const t0 = performance.now();
      const loop = () => { for (const el of document.querySelectorAll("#v10-follow-feed > .rd-feed__row")) (W.tr[el.dataset.key] = W.tr[el.dataset.key] || []).push(getComputedStyle(el).translate); if (performance.now() - t0 < 2500) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const toastSeen = async () => { await page.waitForFunction(() => !!window.__watch.toast, null, { timeout: 4000 }).catch(() => {}); const t = await page.evaluate(() => window.__watch.toast); await page.evaluate(() => { window.__watch.toast = ""; }); return t; };
    await btn.click();
    const flipped = await btn.evaluate(b => [b.textContent, b.getAttribute("aria-pressed"), b.getAttribute("aria-label")]);
    check(flipped[0] === "Following ✓" && flipped[1] === "true" && flipped[2] === "Unfollow Public Filer Other", "Follow flips the button at once (optimistic)", flipped);
    const followToast = await toastSeen();
    await page.waitForFunction(o => !!document.querySelector(`#v10-follow-list .rd-fl[data-owner="${o}"]`), OTHER, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await rest(page, "#rd-follow");
    const after = await page.evaluate(o => ({ label: document.getElementById("rd-list-label").textContent, inList: !!document.querySelector(`#v10-follow-list .rd-fl[data-owner="${o}"]`), inFeed: !!document.querySelector(`#v10-follow-feed .rd-feed__row[data-owner="${o}"]`), focus: document.activeElement?.dataset?.follow, toast: "" }), OTHER);
    after.toast = followToast;
    const [y1, w1] = await btn.evaluate(b => [b.getBoundingClientRect().top, b.getBoundingClientRect().width]);
    const flip = await page.evaluate(() => { const W = window.__watch; return { pops: W.pops, slid: Object.entries(W.tr).map(([k, v]) => [k, new Set(v.filter(t => t !== "none" && t !== "0px")).size]) }; });
    check(flip.slid.some(([, n]) => n >= 3), "rows already in the feed slide to their new places on the spring (several positions per row, not a jump)", flip.slid);
    check(flip.pops === 0, "New markers already on screen do not pop again when the feed updates", flip.pops);
    check(Math.abs(w1 - w0) < 0.5, "the Follow button keeps its width when its label becomes Following ✓ (" + w0.toFixed(1) + " → " + w1.toFixed(1) + "px)", [w0, w1]);
    check(fx.state.posts.includes("follow " + OTHER) && api.filter(a => a === "GET /v1/me/people/updates?limit=40").length === 2, "following POSTs the CIK and reads the updates again, without reloading the page", [fx.state.posts, api.filter(a => /updates/.test(a))]);
    check(after.label === "Following · 4" && after.inList && after.inFeed, "the new person joins the followed list and their trade the feed, live", after);
    check(after.focus === OTHER && Math.abs(y1 - y0) < 1, "focus stays on the button, which has not moved", [after.focus, y0, y1]);
    check(/^Following Public Filer Other\./.test(after.toast), "the result is announced (role=status)", after.toast);
    // Unfollow from the list: the person dims in place with Undo; Undo follows again.
    const lb = page.locator(`#v10-follow-list button[data-follow="${COOK}"]`);
    await lb.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
    const rowsBefore = await page.$$eval("#v10-follow-list .rd-fl", r => r.map(x => x.getBoundingClientRect().top));
    await lb.click(); const unToast = await toastSeen(); await page.waitForTimeout(200); await rest(page, "#rd-follow");
    const un = await page.evaluate(c => { const u = document.querySelector("#rd-toast button[data-undo]")?.getBoundingClientRect(); return { dim: document.querySelector(`#v10-follow-list .rd-fl[data-owner="${c}"]`)?.classList.contains("is-dropped"), feedDim: [...document.querySelectorAll(`#v10-follow-feed .rd-feed__row[data-owner="${c}"]`)].every(r => r.classList.contains("is-dropped")), btn: document.querySelector(`#v10-follow-list button[data-follow="${c}"]`)?.textContent, toast: "", undo: !!u, undoSize: u ? [Math.round(u.width), Math.round(u.height)] : null, rows: [...document.querySelectorAll("#v10-follow-list .rd-fl")].map(x => x.getBoundingClientRect().top) }; }, COOK);
    un.toast = unToast;
    check(un.undoSize && un.undoSize[0] >= 24 && un.undoSize[1] >= 24, "Undo is a target of at least 24 × 24px", un.undoSize);
    check(fx.state.posts.includes("unfollow " + COOK) && un.dim && un.feedDim && un.btn === "Follow +", "Unfollow: DELETE, the person and their rows dim where they are, the button reads Follow +", un);
    check(/^Unfollowed Timothy D\. Cook\. Undo$/i.test(un.toast) && un.undo && near(un.rows, rowsBefore), "an Undo button appears and nothing in the list moves", { ...un, rowsBefore });
    await page.click("#rd-toast button[data-undo]"); await page.waitForTimeout(500);
    const undone = await page.evaluate(c => ({ dim: document.querySelector(`#v10-follow-list .rd-fl[data-owner="${c}"]`)?.classList.contains("is-dropped"), btn: document.querySelector(`#v10-follow-list button[data-follow="${c}"]`)?.textContent }), COOK);
    check(!undone.dim && undone.btn === "Following ✓" && fx.state.follows.includes(COOK), "Undo follows again and restores the person", undone);
    // A refused follow is reverted, with the server's reason.
    const nb = page.locator(`#v10-follow-suggest-list button[data-follow="${NADELLA}"]`);
    await nb.scrollIntoViewIfNeeded(); await nb.click(); await page.waitForTimeout(500);
    const refused = await page.evaluate(c => ({ btn: document.querySelector(`#v10-follow-suggest-list button[data-follow="${c}"]`)?.textContent, toast: document.getElementById("rd-toast").textContent }), NADELLA);
    check(refused.btn === "Follow +" && refused.toast === "Could not follow Satya Nadella: 150 people maximum; unfollow someone first. Nothing was changed.", "a refused follow flips back and says why", refused);
    const unexpected = errors.filter(e => !/409/.test(e));
    check(unexpected.length === 0, "no errors following and unfollowing", unexpected);
    await context.close();
  }

  /* ---------- 1d. Every loaded line is reachable: "Show N more trades" opens the rest in place ---------- */
  {
    const { context, page, errors } = await open(1440, fixture(MORELINES));
    await settle(page);
    const more = page.locator("#v10-follow-more button[data-feed-more]");
    const m0 = await page.evaluate(() => ({ rows: document.querySelectorAll("#v10-follow-feed .rd-feed__row").length, text: document.getElementById("v10-follow-more").textContent.trim(), firstTop: document.querySelector("#v10-follow-feed .rd-feed__row").getBoundingClientRect().top + scrollY }));
    check(m0.rows === 8 && m0.text === "Show 4 more trades", "the feed shows its first 8 rows and says how many more it holds (Show 4 more trades)", m0);
    await more.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
    await more.click(); await page.waitForTimeout(150);
    const m1 = await page.evaluate(() => ({ rows: document.querySelectorAll("#v10-follow-feed .rd-feed__row").length, rising: document.querySelectorAll("#v10-follow-feed .rd-feed__row.rd-rise").length, focusRow: [...document.querySelectorAll("#v10-follow-feed .rd-feed__row")].indexOf(document.activeElement?.closest(".rd-feed__row")), text: document.getElementById("v10-follow-more").textContent.trim(), firstTop: document.querySelector("#v10-follow-feed .rd-feed__row").getBoundingClientRect().top + scrollY, live: document.getElementById("v10-follow-live").textContent }));
    const tiles = await page.$$eval("#v10-follow-feed .rd-feed__row", r => r.slice(8).every(x => x.querySelector(".ins-media--person") && x.querySelector(".ins-media--company")));
    check(m1.rows === 12 && m1.text === "" && Math.abs(m1.firstTop - m0.firstTop) < 1, "Show more opens the 4 other lines in place below the rows on screen; nothing above them moves", { m0, m1 });
    check(m1.rising === 4 && m1.focusRow === 8 && /Showing all 12 latest trades/.test(m1.live), "the opened rows rise in a beat apart, focus continues at the first of them, and the change is announced", m1);
    check(tiles, "every opened row carries a headshot tile and a logo tile");
    check(errors.length === 0, "no errors opening more of the feed", errors);
    await context.close();
  }

  /* ---------- 1e. 390 with a slow server: following from the suggestions moves nothing under the finger ---------- */
  {
    const shifts = () => { window.__shifts = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__shifts.push({ v: e.value, input: e.hadRecentInput, t: Math.round(e.startTime) }); }).observe({ type: "layout-shift", buffered: true }); };
    const { context, page, errors } = await open(390, fixture(FULL), { latency: { "/v1/me/people": 700 }, init: shifts });
    await settle(page);
    const fb = page.locator(`#v10-follow-suggest-list button[data-follow="${OTHER}"]`);
    await fb.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
    const at = () => fb.evaluate(b => { const r = b.getBoundingClientRect(); return [Math.round((r.top + scrollY) * 10) / 10, Math.round(r.width * 10) / 10]; });
    const before = await at(), t0 = await page.evaluate(() => performance.now());
    await fb.tap();
    await page.waitForFunction(o => !!document.querySelector(`#v10-follow-feed .rd-feed__row[data-owner="${o}"]`), OTHER, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1400); await rest(page, "#rd-follow");
    const after = await at();
    const late = await page.evaluate(t => window.__shifts.filter(s => s.t > t), t0);
    check(Math.abs(after[0] - before[0]) < 1 && Math.abs(after[1] - before[1]) < 0.5, "390px: the pressed Follow button stays where it was, at the same width, after the feed takes the new person's trades", { before, after });
    check(late.filter(s => !s.input).reduce((a, s) => a + s.v, 0) === 0, "390px: a follow answered after 700 ms shifts nothing on screen", late);
    check(errors.length === 0, "390px: no errors following from the suggestions", errors);
    await context.close();
  }

  /* ---------- 1f. Joint filings: the followed person is the tenth of ten reporting owners ----------
     The server sends a joint line once, with owner_cik null and owners [{cik, name}] in filing order (here nine
     fixture entities, then Elon Musk, whom the reader follows), and an older joint line with no owners list at all. */
  {
    const ENT = Array.from({ length: 9 }, (_, i) => ({ cik: String(1900101 + i).padStart(10, "0"), name: i % 3 === 2 ? "FIXTURE FAMILY TRUST " + (i + 1) : "FIXTURE HOLDINGS " + (i + 1) + " LLC" }));
    const TJ = T({ id: 950, accession: "000149473026000950", ticker: "TSLA", issuer_name: "Tesla, Inc.", issuer_cik: "0001318605", owner_cik: null, owner_name: [...ENT.map(o => o.name), "MUSK ELON"].join(", "), owners: [...ENT, { cik: MUSK, name: "MUSK ELON" }], transaction_date: "2026-10-12", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 50000, price_per_share: 250.1, estimated_value: 12505000, published_at: "2026-10-14T20:00:00Z", created_at: "2026-10-14T20:05:00Z" });
    const AJ = T({ id: 951, accession: "000032019326000951", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_cik: null, owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L", transaction_date: "2026-09-13", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 100, price_per_share: 230, estimated_value: 23000, published_at: "2026-09-15T21:00:00Z", created_at: "2026-09-15T21:05:00Z" });
    const JOINT = { ...FULL, "/v1/transactions": { items: [TJ, AJ, ...trades] } };
    for (const width of [1440, 390]) {
      const fx = fixture(JOINT);
      const { context, page, errors } = await open(width, fx);
      await settle(page);
      const j = await page.evaluate(({ musk }) => {
        const flatT = e => (e?.innerText || "").replace(/\s+/g, " ").trim();
        const row = document.querySelector('#v10-follow-feed .rd-feed__row[data-key="950"]'), tile = row?.querySelector(":scope>.ins-media");
        const more = row?.querySelector(".rd-who__more");
        const fresh = [...document.querySelectorAll("#v10-follow-feed .rd-feed__row")].filter(r => r.querySelector(".rd-new"));
        const trade = [...document.querySelectorAll("#v3-trades tr")].find(r => r.querySelector('a[href="filing.html?accession=000149473026000950"]'));
        const old = [...document.querySelectorAll("#v3-trades tr")].find(r => r.querySelector('a[href="filing.html?accession=000032019326000951"]'));
        const big = [...document.querySelectorAll("#rd-largest .rd-big")].find(r => r.querySelector('a[href="filing.html?accession=000149473026000950"]'));
        const clipped = big ? [...big.querySelectorAll(".rd-big__what [data-ent], .rd-big__what a")].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()) : ["(no row)"];
        const l1 = [...document.querySelectorAll("#v10-follow-feed .rd-feed__row")].map(r => Math.round(r.getBoundingClientRect().height));
        return {
          name: [...(row?.querySelectorAll("a[data-ent=person]") || [])].map(a => a.getAttribute("href") + " " + a.textContent.trim()),
          more: more ? [more.textContent.trim(), more.getAttribute("href"), more.getAttribute("title")] : null,
          owner: row?.dataset.owner, tile: tile ? [tile.dataset.cik, tile.dataset.issuerCik] : null, aria: row?.getAttribute("aria-label") || "",
          entry: flatT(document.querySelector(`#v10-follow-list .rd-fl[data-owner="${musk}"] .rd-fl__meta`)),
          today: document.getElementById("rd-today-you")?.textContent.replace(/\s+/g, " ").trim() || "",
          freshPeople: new Set(fresh.flatMap(r => r.dataset.owner.split(" ").filter(Boolean))).size, freshRows: fresh.length,
          trade: trade ? [flatT(trade.querySelector(".rd-td-who")), [...trade.querySelectorAll(".rd-td-who a[data-ent=person]")].map(a => a.getAttribute("href"))] : null,
          old: old ? [flatT(old.querySelector(".rd-td-who")), [...old.querySelectorAll(".rd-td-who a")].map(a => a.getAttribute("href"))] : null,
          big: big ? flatT(big.querySelector(".rd-big__what")) : null, clipped, heights: l1
        };
      }, { musk: MUSK });
      check(JSON.stringify(j.name) === JSON.stringify(["person.html?cik=1494730 Elon Musk"]) && j.more?.[0] === "and 9 others" && j.more?.[1] === "filing.html?accession=000149473026000950" && /^Filed jointly with Fixture Holdings 1 LLC, .*Fixture Family Trust 9$/.test(j.more?.[2] || ""),
        width + "px: a joint line in the followed feed is shown under the followed person (the 10th of 10 owners), linked to their file, then 'and 9 others' opening the filing, with every other owner in its title", j);
      check(j.owner === MUSK && j.tile?.[0] === "1494730" && j.tile?.[1] === "1318605" && /^Elon Musk and 9 other reporting owners sold 50,000 Tesla, Inc\. shares at \$250\.10, worth \$12,505,000\./.test(j.aria),
        width + "px: the row is the followed person's (data-owner), pictured by their own CIK with the issuer's for the logo, and read aloud with them as its subject", { owner: j.owner, tile: j.tile, aria: j.aria });
      const m = /from (\d+) of the 3 people you follow/.exec(j.today);
      check(/(^|· )1 new$/.test(j.entry) && m && Number(m[1]) === j.freshPeople && j.freshPeople <= 3 && new RegExp("^Since your last visit on Sep 1 at 12:00 AM: " + j.freshRows + " new trades").test(j.today),
        width + "px: the joint line counts toward the followed person's 'N new' and Today's count of people (never 'of the' more than they follow)", { entry: j.entry, today: j.today, freshPeople: j.freshPeople, freshRows: j.freshRows });
      check(j.trade?.[0] === "Elon Musk and 9 others" && JSON.stringify(j.trade?.[1]) === JSON.stringify(["person.html?cik=1494730"]) && j.big === "SOLD · S TSLA Elon Musk and 9 others" && j.clipped.length === 0,
        width + "px: in All recent trades and Biggest trades the joint line is one label (a person, then 'and 9 others'), with nothing cut off beside it", { trade: j.trade, big: j.big, clipped: j.clipped });
      check(j.old?.[0] === "Timothy D. Cook and 1 other" && j.old?.[1]?.[0] === "people.html?q=COOK%20TIMOTHY%20D#v10-directory" && !j.old[1].some(h => /ADAMS/i.test(h) && /COOK/i.test(h)),
        width + "px: a joint line with no owners list names one owner with their own directory search, never the joined names as one person", j.old);
      if (width === 1440) check(new Set(j.heights).size === 1, "1440px: every feed row, joint ones included, keeps the same two-line height", j.heights);
      if (width === 1440) {
        // Unfollowing the person dims their joint row too; Undo brings it back.
        const ub = page.locator(`#v10-follow-list button[data-follow="${MUSK}"]`);
        await ub.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
        await ub.click(); await page.waitForTimeout(400);
        const dimmed = await page.evaluate(() => document.querySelector('#v10-follow-feed .rd-feed__row[data-key="950"]')?.classList.contains("is-dropped"));
        await page.locator("#rd-toast button[data-undo]").click(); await page.waitForTimeout(500);
        const back = await page.evaluate(() => document.querySelector('#v10-follow-feed .rd-feed__row[data-key="950"]')?.classList.contains("is-dropped"));
        check(dimmed === true && back === false && fx.state.posts.join() === "unfollow " + MUSK + ",follow " + MUSK, "1440px: unfollowing the person dims their joint row with their own; Undo restores it", { dimmed, back, posts: fx.state.posts });
      }
      check(errors.length === 0, width + "px: no errors with joint filings on the overview", errors);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "joint-" + width + ".png"), fullPage: true });
      await context.close();
    }
  }

  /* ---------- 2. Every width: overflow, tiles, sharp images, touch targets, no errors ---------- */
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
      const wide = [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest(".rd-table-wrap,.rd-flist,.rd-sglist,.rd-dtable")).slice(0, 5).map(e => e.tagName.toLowerCase() + "." + [...e.classList].join("."));
      // Standalone links and buttons (not inline in a sentence) must be at least 24px tall (WCAG 2.5.8). A stretched
      // link (an ::after laid over its row with inset: 0) is as big as the row it covers.
      const target = e => {
        const a = getComputedStyle(e, "::after");
        if (a.content !== "none" && a.position === "absolute" && a.top === "0px" && a.bottom === "0px") { let p = e.parentElement; while (p && getComputedStyle(p).position === "static") p = p.parentElement; if (p) return p.getBoundingClientRect(); }
        return e.getBoundingClientRect();
      };
      const small = [...document.querySelectorAll("main a[href], main button")].filter(e => {
        const r = target(e), cs = getComputedStyle(e);
        return r.width > 0 && cs.visibility !== "hidden" && !e.closest("p, td.rd-empty, .rd-toast") && r.height < 24;
      }).map(e => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30) + " " + Math.round(target(e).height) + "px");
      // Text cut off mid-word: a box that hides its overflow, holds text wider than itself and shows no ellipsis (an
      // ellipsis does not apply to a flex or grid box's text).
      const clipped = [...document.querySelectorAll("main *")].filter(e => {
        if (!e.getClientRects().length || !e.textContent.trim() || e.closest(".ins-media,svg,.rd-table-wrap,.rd-flist,.rd-dtable,.sr-only")) return false;
        const cs = getComputedStyle(e);
        if (!/hidden|clip/.test(cs.overflowX) || e.scrollWidth <= e.clientWidth + 1) return false;
        return !(cs.textOverflow === "ellipsis" && !/flex|grid/.test(cs.display));
      }).slice(0, 6).map(e => e.tagName.toLowerCase() + "." + [...e.classList].join(".") + " “" + e.textContent.trim().slice(0, 40) + "” " + e.scrollWidth + ">" + e.clientWidth);
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, blurry, wide, small, clipped, h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize) };
    });
    check(m.clipped.length === 0, width + "px: no text is cut off mid-word (labels fit, or end in an ellipsis)", m.clipped);
    check(m.overflow <= 1 && m.wide.length === 0, width + "px: no horizontal overflow", m);
    check(m.blurry.length === 0, width + "px: no upscaled raster image", m.blurry);
    check(m.h1 >= 30 && m.h1 <= 44, width + "px: the greeting stays small (" + m.h1 + "px)");
    if (width < 600) check(m.small.length === 0, width + "px: every standalone link and button is at least 24px tall", m.small);
    const tiles = await tileAudit(page);
    check(tiles.missing.length === 0, width + "px: every named person and company has a tile", tiles.missing);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `dashboard-${width}.png`), fullPage: true });
    check(errors.length === 0, width + "px: no console or page errors", errors);
    await context.close();
  }

  /* ---------- 2b. Edge cases the figures must survive ---------- */
  {
    const big = { ...FULL, follows: [], "/v1/transactions": { items: [
      // An original filing and its 4/A restating the same line: counted once, the lag from the original.
      T({ id: 21, accession: "000000000026000021", ticker: "ACME", issuer_cik: "0000000001", issuer_name: "ACME CORP", owner_name: "DOE JANE", owner_cik: "0000000009", transaction_date: "2026-09-10", transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", shares: 50000, price_per_share: 20, estimated_value: 1000000, published_at: "2026-09-12T20:00:00Z" }),
      T({ id: 22, accession: "000000000026000022", ticker: "ACME", issuer_cik: "0000000001", issuer_name: "ACME CORP", owner_name: "DOE JANE", owner_cik: "0000000009", transaction_date: "2026-09-10", transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", shares: 50000, price_per_share: 20, estimated_value: 1000000, published_at: "2026-09-20T20:00:00Z", is_amendment: true }),
      // A second 4/A restating the same line again (issuer CIK written without its zeros): still one purchase, counted from the latest copy.
      T({ id: 28, accession: "000000000026000028", ticker: "ACME", issuer_cik: "1", issuer_name: "ACME CORP", owner_name: "DOE JANE", owner_cik: "9", transaction_date: "2026-09-10", transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", shares: "50000.00000000", price_per_share: "20.00000000", estimated_value: "1000000.00", published_at: "2026-09-25T20:00:00Z", is_amendment: true }),
      // Filed at 9:30 p.m. Eastern: the SEC filing day is Sep 14, though it is Sep 15 in UTC. A four-decimal weighted price.
      T({ id: 23, accession: "000000000026000023", ticker: "BIGC", issuer_cik: "0000000002", issuer_name: "BIG CO", owner_name: "ROE RICHARD", owner_cik: "0000000008", transaction_date: "2026-09-10", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: "60000000", price_per_share: "41.5321", estimated_value: "2491926000", published_at: "2026-09-15T01:30:00.000Z" }),
      // A grant filed at $0.00, and two different issuers that both put the placeholder "NONE" in the ticker field.
      T({ id: 24, accession: "000000000026000024", ticker: "NONE", issuer_cik: "0000000003", issuer_name: "PRIVATE ONE LLC", owner_name: "POE EDGAR", owner_cik: "0000000007", transaction_date: "2026-09-09", transaction_code: "A", acquired_disposed: "A", category: "other", shares: 5000, price_per_share: 0, estimated_value: 0, published_at: "2026-09-11T20:00:00Z" }),
      T({ id: 25, accession: "000000000026000025", ticker: "NONE", issuer_cik: "0000000004", issuer_name: "PRIVATE TWO INC", owner_name: "LOE ANN", owner_cik: "0000000006", transaction_date: "2026-09-09", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 100, price_per_share: 10, estimated_value: 1000, published_at: "2026-09-11T20:00:00Z" }),
      T({ id: 26, accession: "000000000026000026", ticker: "NONE", issuer_cik: "0000000005", issuer_name: "PRIVATE THREE CO", owner_name: "MOE MAX", owner_cik: "0000000005", transaction_date: "2026-09-09", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 200, price_per_share: 10, estimated_value: 2000, published_at: "2026-09-11T20:00:00Z" }),
      // A sale filed with no price, held indirectly: the phone record still says both.
      T({ id: 27, accession: "000000000026000027", ticker: "ACME", issuer_cik: "0000000001", issuer_name: "ACME CORP", owner_name: "WOODS DARREN W", owner_cik: "0000000010", transaction_date: "2026-09-10", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 800, price_per_share: null, estimated_value: null, direct_ownership: "I", published_at: "2026-09-14T20:00:00Z" })
    ] } };
    for (const width of [1440, 390]) {
      const { context, page, errors } = await open(width, fixture(big));
      await settle(page);
      const e = await page.evaluate(() => {
        const kpi = Object.fromEntries([...document.querySelectorAll(".rd-kpi")].map(k => [[...k.querySelector(".rd-kpi__label").childNodes].filter(n => n.nodeType === 3 || getComputedStyle(n).display !== "none").map(n => n.textContent).join("").trim(), k.querySelector(".rd-kpi__value").textContent.trim() + " | " + k.querySelector(".rd-kpi__note").textContent.replace(/ /g, " ").trim()]));
        const tiles = [...document.querySelectorAll(".rd-kpi")].map(k => { const v = k.querySelector(".rd-kpi__value"), r = k.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(v); const tr = range.getBoundingClientRect(); return { fits: tr.right <= r.right + 1 && tr.left >= r.left - 1 }; });
        return {
          kpi, tiles, scope: document.getElementById("rd-flow-scope").textContent,
          rows: [...document.querySelectorAll("#v3-trades tr")].map(r => r.innerText.replace(/\s+/g, " ")),
          companies: [...document.querySelectorAll("#rd-companies .rd-co__row")].map(r => r.innerText.replace(/\s+/g, " ")),
          // The name as labelled (a tile in front of it may show initials once a logo is confirmed absent).
          coNames: [...document.querySelectorAll("#rd-companies .rd-co__row [data-ent=company]")].map(e => e.textContent.trim()),
          coStarts: [...document.querySelectorAll("#rd-companies .rd-co__track--buy")].map(t => Math.round(t.getBoundingClientRect().left)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      check(e.kpi.Bought.startsWith("$1,000,000 | 1 purchase"), width + "px: an amended 4/A replaces the line it restates instead of doubling it", e.kpi.Bought);
      check(/2 lines restated by a later 4\/A, counted once/.test(e.scope), width + "px: the scope says how many lines a later 4/A restates (the original and the first 4/A), each counted once", e.scope);
      const restatedRows = e.rows.filter(r => /restated by a later 4\/A, not counted/.test(r));
      check(restatedRows.length === 2 && e.rows.filter(r => /Jane Doe/.test(r)).length === 3, width + "px: the table lists all three copies and marks the two restated ones 'not counted'", restatedRows);
      check(e.kpi.Sold.startsWith("$2,491,929,000 | 4 sales") && /1 without a price/.test(e.kpi.Sold), width + "px: sold total to the dollar; a sale with no price is counted and named", e.kpi.Sold);
      const woods = e.rows.find(r => /Darren W\. Woods/.test(r)) || "";
      if (width < 760) check(/−800 no price reported/.test(woods) && /held indirectly/.test(woods) && !/Not reported|No price\b/.test(woods), width + "px: a phone record says when no price was reported and keeps 'held indirectly'", woods);
      else check(/No price/.test(woods) && /Not reported/.test(woods) && /held indirectly/.test(woods), width + "px: the row says no price and no value were reported, and that the shares are held indirectly", woods);
      check(e.tiles.every(t => t.fits) && e.overflow <= 1, width + "px: ten-digit totals fit their tiles", e);
      const bigRow = e.rows.find(r => /BIGC/.test(r)) || "";
      check(/\$41\.5321/.test(bigRow) && /Sep 14/.test(bigRow) && /4 days later/.test(bigRow), width + "px: a four-decimal price prints as filed and an evening filing keeps its SEC (Eastern) day and lag", bigRow);
      const grant = e.rows.find(r => /Private One/i.test(r)) || "";
      check(/\$0\.00/.test(grant) && (/No ticker/i.test(grant) || width < 760), width + "px: a $0.00 grant prints its price as filed; a placeholder ticker is not shown as a symbol", grant);
      check(e.companies.length === 4 && e.coNames.includes("Private Two Inc.") && e.coNames.includes("Private Three Co") && e.companies.filter(c => /No ticker/.test(c)).length === (width < 760 ? 0 : 2), width + "px: by company groups by issuer, not by the placeholder ticker, and names an issuer without a ticker", [e.coNames, e.companies]);
      check(new Set(e.coStarts).size === 1, width + "px: every company row shares one zero line", e.coStarts);
      check(errors.length === 0, width + "px: no errors with edge-case data", errors);
      await context.close();
    }
    // Every ingest status src/ingest.mjs writes: running → success | partial | error.
    const runs = {};
    for (const [key, run] of Object.entries({ partial: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:12:00Z", status: "partial" }, running: { started_at: "2026-10-14T09:00:00Z", finished_at: null, status: "running" }, error: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:03:00Z", status: "error" } })) {
      const { context, page } = await open(1440, fixture({ ...FULL, "/v1/status": { ...STATUS, lastIngest: run } }));
      await page.waitForFunction(() => /import/.test(document.getElementById("v4-last-import")?.textContent || "") && !/checking/.test(document.getElementById("v4-last-import").textContent), null, { timeout: 10000 }).catch(() => {});
      runs[key] = await text(page, "#v4-last-import");
      await context.close();
    }
    check(runs.partial === "last SEC feed check Oct 14, 2026, 09:12 UTC · partial import" && runs.running === "SEC check started Oct 14, 2026, 09:00 UTC · in progress" && runs.error === "last SEC feed check Oct 14, 2026, 09:03 UTC · import failed", "about this data reads partial, running and failed imports in plain words", runs);
  }

  /* ---------- 3. A first-time member: suggestions to follow, companies to save ---------- */
  {
    const fx = fixture(FIRST);
    const { context, page, errors, api } = await open(1440, fx, { seen: null });
    await settle(page);
    const e = await page.evaluate(() => ({
      you: document.getElementById("rd-today-you").textContent.trim(),
      empty: document.getElementById("v10-follow-empty").textContent.trim(), emptyShown: getComputedStyle(document.getElementById("v10-follow-empty")).display !== "none",
      cards: [...document.querySelectorAll("#v10-follow-suggest-list .rd-sg")].map(r => ({ text: r.innerText.replace(/\s+/g, " "), btn: r.querySelector("button")?.textContent })),
      title: document.getElementById("v10-follow-suggest-title").textContent,
      foot: document.getElementById("v10-follow-suggest-foot").textContent,
      saves: [...document.querySelectorAll("#v3-watchlist button[data-save]")].map(b => b.textContent),
      watch: document.getElementById("v3-watchlist").innerText.replace(/\s+/g, " "),
      notes: document.getElementById("v3-notes").innerText.replace(/\s+/g, " "), notesLink: !!document.querySelector('#v3-notes a[href="research.html"]')
    }));
    check(e.you === "Follow insiders or save companies below. This line will then tell you what they filed since your last visit.", "Today tells a first-time member what to do", e.you);
    check(e.emptyShown && e.empty === "You are not following anyone yet. Follow an insider and every trade they file appears here, marked New until you have seen it.", "01 explains following in place of the feed", e.empty);
    check(e.title === "Most active in the latest imports" && e.cards.length >= 4 && e.cards.every(c => c.btn === "Follow +") && /^Timothy D\. Cook Files for AAPL · Apple Inc\. Sold \$325,000 in 1 trade Follow \+$/i.test(e.cards[0]?.text.trim()), "suggestions: the most active people in the latest imports, ranked by value, each with Follow +", e.cards);
    check(/Following is private to your account\./.test(e.foot), "suggestions say following is private", e.foot);
    check(api.some(a => /^GET \/v1\/insiders$/.test(a)), "/v1/insiders is asked only for readers following fewer than 3 people", api.filter(a => /insiders/.test(a)));
    check(/You have not saved any companies yet\. Save one to see its latest insider purchase or sale here\./.test(e.watch) && JSON.stringify(e.saves) === JSON.stringify(["Save AAPL +", "Save NVDA +", "Save MSFT +"]), "the empty watchlist offers Save buttons for the most-traded companies", e);
    check(/No notes yet\. Notes you write on the research desk appear here\./.test(e.notes) && e.notesLink, "the empty notes state links the research desk", e.notes);
    // Save: optimistic, POST /v1/me/watchlist, nothing moves.
    const sb = page.locator('#v3-watchlist button[data-save="NVDA"]');
    await sb.scrollIntoViewIfNeeded(); await rest(page);
    const [sy, sw, rowsY] = await sb.evaluate(b => [b.getBoundingClientRect().top, b.getBoundingClientRect().width, [...document.querySelectorAll("#v3-watchlist .rd-row--watch")].map(r => r.getBoundingClientRect().top)]);
    await sb.click();
    await page.waitForFunction(() => /Saved NVDA/.test(document.getElementById("rd-toast").textContent), null, { timeout: 4000 }).catch(() => {});
    const saveToast = await said(page, "#rd-toast");
    await page.waitForTimeout(500); await rest(page);
    const s = await sb.evaluate(b => [b.textContent, b.getAttribute("aria-pressed"), b.getBoundingClientRect().top, b.getBoundingClientRect().width]);
    check(fx.state.posts.includes("save NVDA") && s[0] === "Saved ✓" && s[1] === "true" && Math.abs(s[2] - sy) < 1 && s[3] >= sw - 0.5 && saveToast === "Saved NVDA to your watchlist.", "Save adds the company (POST) and the button says so, in place, without narrowing", [...s, sy, sw, saveToast]);
    const sv = await page.evaluate(() => ({ msg: document.getElementById("v3-watch-empty")?.textContent.replace(/\s+/g, " ").trim(), link: document.querySelector("#v3-watch-empty a")?.getAttribute("href"), rows: [...document.querySelectorAll("#v3-watchlist .rd-row--watch")].map(r => r.getBoundingClientRect().top), saved: JSON.parse(localStorage.getItem("insidir:overview:counts") || "{}").watch }));
    check(sv.msg === "On your watchlist now: NVDA. Manage your list on the watchlist page." && sv.link === "watchlist.html" && near(sv.rows, rowsY), "after a Save the module says what is on the watchlist now (not 'You have not saved any companies yet'), and no row moves", { ...sv, rowsY });
    check(sv.saved === 1, "the next visit's skeleton keeps a row for the saved company", sv.saved);
    // Follow from the empty state: the person and their trades appear below the suggestions; nothing above moves.
    const fb = page.locator(`#v10-follow-suggest-list button[data-follow="${COOK}"]`);
    await fb.scrollIntoViewIfNeeded(); await rest(page);
    const fy = await fb.evaluate(b => b.getBoundingClientRect().top);
    await fb.click();
    await page.waitForFunction(() => document.querySelectorAll("#v10-follow-feed .rd-feed__row").length > 0, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300); await rest(page);
    const f = await page.evaluate(c => ({ label: document.getElementById("rd-list-label").textContent, list: [...document.querySelectorAll("#v10-follow-list .rd-fl")].map(x => x.dataset.owner), feed: document.querySelectorAll("#v10-follow-feed .rd-feed__row").length, empty: document.getElementById("v10-follow-empty").textContent, y: document.querySelector(`#v10-follow-suggest-list button[data-follow="${c}"]`).getBoundingClientRect().top }), COOK);
    check(f.label === "Following · 1" && f.list.includes(COOK) && f.feed >= 1 && /^You follow 1 person now\./.test(f.empty), "the first follow: the person is listed, their trades open below, the message says what happened", f);
    check(Math.abs(f.y - fy) < 1, "the Follow button did not move", [fy, f.y]);
    // A second follow: the message and the count stay in step.
    const fb2 = page.locator(`#v10-follow-suggest-list button[data-follow="${OTHER}"]`);
    await fb2.scrollIntoViewIfNeeded(); await rest(page);
    await fb2.click();
    await page.waitForFunction(() => /Following · 2/.test(document.getElementById("rd-list-label").textContent), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const f2 = await page.evaluate(() => ({ label: document.getElementById("rd-list-label").textContent, empty: document.getElementById("v10-follow-empty").textContent }));
    check(f2.label === "Following · 2" && /^You follow 2 people now\./.test(f2.empty), "after a second follow the message says 2 people, as the label does", f2);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-first-time-1440.png"), fullPage: true });
    check(errors.length === 0, "no errors for a first-time member", errors);
    await context.close();
  }

  /* ---------- 3b. Empty account and empty import ---------- */
  {
    const { context, page, errors } = await open(390, fixture(EMPTY), { seen: null });
    await settle(page);
    const e = await page.evaluate(() => Object.fromEntries(["rd-today-you", "rd-today-market", "v3-watchlist", "v3-notes", "v10-follow-list", "v10-follow-suggest-list", "v3-trades", "rd-daily-chart", "rd-kpis", "rd-companies", "rd-largest", "rd-about"].map(id => [id, document.getElementById(id).innerText.replace(/\s+/g, " ").trim()])));
    check(/^Follow insiders or save companies below/.test(e["rd-today-you"]) && e["rd-today-market"] === "No trades have been imported yet. The first SEC import fills this page.", "Today with nothing imported", e);
    check(/You are not following anyone yet/.test(e["v10-follow-list"]), "390px: the followed strip carries the empty message", e["v10-follow-list"]);
    check(/Nobody new to suggest from the latest imports/.test(e["v10-follow-suggest-list"]), "no suggestions without an import, said plainly", e["v10-follow-suggest-list"]);
    check(/You have not saved any companies yet/.test(e["v3-watchlist"]) && /No notes yet/.test(e["v3-notes"]), "empty watchlist and notes", e);
    check(/No trades have been imported yet/.test(e["v3-trades"]) && /No dated trades to chart yet/.test(e["rd-daily-chart"]) && /No trades have been imported yet/.test(e["rd-kpis"]) && /No companies yet/.test(e["rd-companies"]) && /No trades have been imported yet/.test(e["rd-largest"]), "empty market states", e);
    check(await page.locator("#rd-daily-switch").isHidden(), "no Chart | Table switch without days to show");
    check(/0 filings imported/.test(e["rd-about"]) && /no SEC check recorded yet/.test(e["rd-about"]) && /no filings imported yet/.test(e["rd-about"]), "about this data with nothing imported", e["rd-about"]);
    await page.click('[data-filter="reported_sale"]'); await page.waitForTimeout(200);
    check(/No trades have been imported yet/.test(await text(page, "#v3-trades")), "filters on an empty import do not crash");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-empty-390.png"), fullPage: true });
    check(errors.length === 0, "no errors with empty data", errors);
    await context.close();
  }

  /* ---------- 4. Service errors (503), then recovery via each "Try again" ---------- */
  {
    let healthy = false;
    const fx = fixture(FULL);
    const respond = (path, method, url, body) => {
      if (path === "/v1/me" || path.startsWith("/v1/media") || path.startsWith("/v1/company")) return fx(path, method, url, body);
      if (!healthy) return { status: 503, body: { error: "Service unavailable" } };
      return fx(path, method, url, body);
    };
    const { context, page, errors } = await open(1024, respond);
    await page.waitForFunction(() => /could not be loaded/.test(document.querySelector("#v10-follow-feed")?.textContent || "") && /unavailable/i.test(document.querySelector("#v4-data-state")?.textContent || "") && /could not be loaded/.test(document.querySelector("#v3-trades")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => Object.fromEntries(["rd-today-you", "rd-today-market", "v10-follow-feed", "v3-watchlist", "v3-notes", "rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-trades", "v4-data-state"].map(id => [id, document.getElementById(id).innerText.replace(/\s+/g, " ")])));
    check(s["v10-follow-feed"].startsWith("Updates from the people you follow could not be loaded: The research service is unavailable right now (HTTP 503).") && await page.locator('#v10-follow-feed button[data-retry="follow"]').count() === 1, "503: the followed feed says what failed and offers Try again", s["v10-follow-feed"]);
    check(s["rd-today-you"] === "Updates from the people you follow could not be loaded." && /could not be loaded/.test(s["rd-today-market"]), "503: Today says what is missing", s);
    for (const id of ["v3-watchlist", "v3-notes", "rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-trades", "v4-data-state"]) check(/could not be loaded|unavailable/i.test(s[id]) && !/Loading|checking/i.test(s[id]), "503: #" + id + " shows a clear message", s[id]);
    check(await page.locator("button[data-retry]").count() >= 6, "503: every module offers Try again");
    check(await page.locator(".rd-follow.is-error .rd-follow__side").isHidden(), "503: the followed module keeps no room for a list that is not coming");
    const dead = await page.$$eval("button[data-filter]", b => b.map(x => x.disabled + ":" + x.querySelector("[data-count]")?.textContent));
    check(dead.length === 4 && dead.every(d => d === "true:" || d === "true:undefined"), "503: the four trade filters are disabled (out of the tab order) and show no counts", dead);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-error-1024.png"), fullPage: true });
    healthy = true;
    await page.click('#v10-follow-feed button[data-retry="follow"]');
    await page.waitForFunction(() => document.querySelectorAll("#v10-follow-feed .rd-feed__row").length === 5, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v10-follow-feed .rd-feed__row").count() === 5 && await page.locator("#v10-follow-list .rd-fl").count() === 3, "Try again reloads the people you follow");
    await page.click('#v3-trades button[data-retry="trades"]');
    await page.waitForFunction(() => document.querySelectorAll("#v3-trades tr.rd-trade").length === 5 && document.querySelectorAll("#rd-daily-chart .rd-day").length === 3, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v3-trades tr.rd-trade").count() === 5 && await page.locator("#rd-daily-chart .rd-day").count() === 3 && await page.locator("#rd-kpis .rd-kpi").count() === 5, "Try again reloads the trades, the totals and the chart");
    const alive = await page.$$eval("button[data-filter]", b => b.map(x => x.disabled + ":" + x.querySelector("[data-count]")?.textContent));
    check(JSON.stringify(alive) === JSON.stringify(["false:5", "false:1", "false:2", "false:2"]), "the filters come back, with their counts, once the trades load", alive);
    for (const key of ["watchlist", "notes"]) { const b = page.locator(`button[data-retry="${key}"]`); if (await b.count()) await b.click(); }
    await page.waitForFunction(() => document.querySelectorAll("#v3-watchlist .rd-row--watch").length === 4 && document.querySelectorAll("#v3-notes .rd-row--note").length === 2, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v3-watchlist .rd-row--watch").count() === 4 && await page.locator("#v3-notes .rd-row--note").count() === 2, "Try again reloads the watchlist and the notes");
    if (await page.locator('#v4-data-state button[data-retry="status"]').count()) await page.click('#v4-data-state button[data-retry="status"]');
    await page.waitForFunction(() => document.getElementById("v4-data-state").textContent === "Online", null, { timeout: 10000 }).catch(() => {});
    check(await text(page, "#v4-data-state") === "Online", "about this data recovers through its own Try again", await text(page, "#v4-data-state"));
    const unexpected = errors.filter(e => !/^HTTP 503 \/v1\/|status of 503/.test(e));
    check(unexpected.length === 0, "503: no script errors (only the expected failed requests)", unexpected);
    await context.close();
  }

  /* ---------- 5. Nothing moves while loading; the header holds its 70px; skeletons hold the content's space ---------- */
  {
    const latency = { "/v1/me": 90, "/v1/transactions": 420, "/v1/filings": 260, "/v1/status": 140, "/v1/me/watchlist": 160, "/v1/me/research-decisions": 210, "/v1/insiders": 380, "/v1/me/people/updates": 300, "*": 150 };
    const shifts = () => { window.__shifts = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__shifts.push({ v: e.value, input: e.hadRecentInput, src: (e.sources || []).map(s => s.node && s.node.nodeType === 1 ? s.node.tagName.toLowerCase() + (s.node.id ? "#" + s.node.id : "") + "." + [...s.node.classList].slice(0, 2).join(".") : "?") }); }).observe({ type: "layout-shift", buffered: true }); };
    // A first visit, then a returning one in the same browser: its saved counts and heights size the skeletons.
    for (const width of [1440, 390]) {
      const { context, page, errors } = await open(width, fixture(FULL), { latency, init: shifts, reveal: false });
      await settle(page);
      const first = await page.evaluate(() => ({ sum: window.__shifts.reduce((a, s) => a + s.v, 0), list: window.__shifts }));
      await page.waitForTimeout(1500); // the counts and heights are saved in idle time
      await page.reload({ waitUntil: "domcontentloaded" });
      const sk = await page.evaluate(() => ({ main: Math.round(document.getElementById("Content").getBoundingClientRect().top), header: Math.round(document.querySelector("header[data-app-header]").getBoundingClientRect().height), doc: document.documentElement.scrollHeight }));
      await settle(page);
      await page.waitForTimeout(400);
      const again = await page.evaluate(() => ({ sum: window.__shifts.reduce((a, s) => a + s.v, 0), list: window.__shifts, main: Math.round(document.getElementById("Content").getBoundingClientRect().top + scrollY), doc: document.documentElement.scrollHeight }));
      check(sk.header === 70 && sk.main === 70 && again.main === 70, width + "px: the header shell holds 70px from the first paint, so main never moves", { sk, again: again.main });
      check(first.sum <= 0.01, width + "px: loading with staggered latency shifts nothing (first visit, emulator-flagged shifts included: " + first.sum.toFixed(4) + ")", first.list);
      check(again.sum <= 0.01, width + "px: a returning visit shifts nothing (" + again.sum.toFixed(4) + ")", again.list);
      check(Math.abs(again.doc - sk.doc) <= 24, width + "px: a returning visit's skeleton is as tall as the page it becomes (" + sk.doc + " → " + again.doc + ")", { skeleton: sk.doc, loaded: again.doc });
      check(errors.length === 0, width + "px: no errors while loading slowly", errors);
      await context.close();
    }
  }

  /* ---------- 5b. A return visit whose Today sentence is longer than the last visit's shifts nothing ----------
     Visit 1 is a first visit ("You follow 3 people…"); visit 2 has new trades since then ("Since your last visit on …: 2 new
     trades from 2 of the 3 people you follow. 2 companies on your watchlist have new trades."). The room kept for Today
     never shrinks below the stylesheet's reserve for the longest usual sentence. */
  {
    const latency = { "/v1/me": 90, "/v1/transactions": 420, "/v1/filings": 260, "/v1/status": 140, "/v1/me/watchlist": 160, "/v1/me/research-decisions": 210, "/v1/insiders": 380, "/v1/me/people/updates": 300, "*": 150 };
    const init = () => {
      try { if (sessionStorage.getItem("check:force-seen")) { localStorage.setItem("insidir:overview:last-seen", "2026-09-01T00:00:00.000Z"); sessionStorage.removeItem("check:force-seen"); } } catch {}
      window.__shifts = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__shifts.push({ v: e.value, src: (e.sources || []).map(x => x.node && x.node.nodeType === 1 ? x.node.tagName.toLowerCase() + "." + [...x.node.classList].slice(0, 2).join(".") : "?") }); }).observe({ type: "layout-shift", buffered: true });
    };
    for (const width of [390, 1440]) {
      const { context, page, errors } = await open(width, fixture(FULL), { latency, init, seen: null, reveal: false });
      await settle(page);
      const v1 = await page.evaluate(() => document.getElementById("rd-today-you").textContent.trim());
      await page.waitForTimeout(4300); // seen for 4 s: leaving records this visit; the counts and heights are saved meanwhile
      await page.evaluate(() => sessionStorage.setItem("check:force-seen", "1"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await settle(page);
      await page.waitForTimeout(400);
      const v2 = await page.evaluate(() => ({ you: document.getElementById("rd-today-you").textContent.trim(), sum: window.__shifts.reduce((a, x) => a + x.v, 0), list: window.__shifts }));
      check(/^You follow 3 people\./.test(v1) && /^Since your last visit on Sep 1 at 12:00 AM: 2 new trades/.test(v2.you), width + "px: the second visit's Today sentence is the longer one", [v1, v2.you]);
      check(v2.sum <= 0.01, width + "px: a return visit with a longer Today sentence shifts nothing (" + v2.sum.toFixed(4) + ")", v2.list);
      check(errors.length === 0, width + "px: no errors on a return visit", errors);
      await context.close();
    }
  }

  /* ---------- 6. Motion: during a scroll the motion layer writes only the atoms on screen ---------- */
  {
    const watchWrites = () => {
      const w = window.__atomWrites = { frames: [], pending: new Set() };
      new MutationObserver(ms => { for (const m of ms) if (m.target.hasAttribute && m.target.hasAttribute("data-hf-atom")) w.pending.add(m.target); }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"] });
      const tick = () => {
        if (w.on) {
          const vh = innerHeight, vw = innerWidth;
          const onScreen = [...document.querySelectorAll("[data-hf-atom]")].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.bottom > -24 && r.top < vh + 24 && r.right > -24 && r.left < vw + 24; }).length;
          w.frames.push([w.pending.size, onScreen]);
        }
        w.pending.clear();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const { context, page, errors } = await open(1440, fixture(FULL), { init: watchWrites });
    await settle(page);
    await page.mouse.move(700, 450);
    await page.evaluate(() => { window.__atomWrites.on = true; });
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const f = window.__atomWrites.frames; return { frames: f.length, worst: Math.max(...f.map(([w, o]) => w - o)), maxWritten: Math.max(...f.map(([w]) => w)), atoms: document.querySelectorAll("[data-hf-atom]").length }; });
    check(r.frames > 20 && r.worst <= 4, "atoms written per frame never exceed the atoms on screen by more than a few (worst excess " + r.worst + ", at most " + r.maxWritten + " of " + r.atoms + " atoms in a frame)", r);
    check(errors.length === 0, "no errors while scrolling", errors);
    await context.close();
  }

  /* ---------- 7. A person's name opens their file (person.html?cik=), and the file opens ---------- */
  const fileOpen = async page => {
    await page.waitForFunction(() => { const st = document.getElementById("pf-state"); return !!st && (document.querySelector("main.pf")?.classList.contains("is-ready") || !st.hidden); }, null, { timeout: 15000 });
    await page.waitForTimeout(200);
    return page.evaluate(() => ({
      url: location.pathname + location.search, ready: document.querySelector("main.pf")?.classList.contains("is-ready"), state: document.getElementById("pf-state")?.hidden === false ? document.getElementById("pf-state").innerText.replace(/\s+/g, " ") : "",
      name: document.getElementById("pf-name")?.textContent.trim(), fileno: document.getElementById("pf-fileno")?.textContent.trim(),
      log: document.querySelectorAll("#pf-log .pf-log__row").length, follow: document.getElementById("pf-follow")?.textContent.trim(), followPressed: document.getElementById("pf-follow")?.getAttribute("aria-pressed"),
      photo: !!document.querySelector(".pf-photo [data-media=person]"), first: document.querySelector("#pf-log .pf-log__text")?.textContent.trim()
    }));
  };
  for (const [width, reducedMotion] of [[1440, "no-preference"], [390, "reduce"]]) {
    const { context, page, errors } = await open(width, fixture(FULL), { reducedMotion });
    await settle(page);
    await Promise.all([page.waitForURL(/\/person\.html\?cik=/, { timeout: 10000 }), page.click("#v10-follow-feed .rd-feed__row:first-child a[data-ent=person]")]);
    const at = await fileOpen(page);
    check(at.url === "/person.html?cik=1214156" && at.ready && at.name === "Timothy D. Cook" && at.fileno === "0001214156", width + "px: a person in the feed opens their personnel file by SEC CIK, and the file loads", at);
    check(at.log === 3 && at.first === "sold 12,500 AAPL shares at $26.00" && at.photo, width + "px: the file lists the person's lines in the dashboard's words, with the file photo tile", at);
    check(at.follow === "Following ✓" && at.followPressed === "true", width + "px: the file knows the reader already follows this person (the same CIK the overview follows)", at);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `person-from-dashboard-${width}.png`) });
    check(errors.length === 0, width + "px: no errors following a person link to the file", errors);
    await context.close();
  }
  // Every other place a name appears opens the same file: the followed list, a suggestion, the watchlist, the biggest trades, the table.
  {
    const { context, page, errors } = await open(1440, fixture(FULL));
    await settle(page);
    const targets = [["#v10-follow-list .rd-fl a[data-ent=person]", "/person.html?cik=1214156"], ["#v10-follow-suggest-list .rd-sg:first-child a[data-ent=person]", "/person.html?cik=67890"],
      ["#v3-watchlist .rd-row--watch:first-child a[data-ent=person]", "/person.html?cik=1214156"], ["#rd-largest .rd-big:first-child a[data-ent=person]", "/person.html?cik=1214156"], ["#v3-trades tr:nth-child(3) a[data-ent=person]", "/person.html?cik=1049502"]];
    for (const [sel, want] of targets) {
      await page.goto(base + "/dashboard.html", { waitUntil: "domcontentloaded" });
      await settle(page);
      const link = page.locator(sel).first();
      await link.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL(/\/person\.html\?cik=/, { timeout: 10000 }), link.click()]);
      const at = await fileOpen(page);
      check(at.url === want && at.ready && at.log > 0, "clicking " + sel.split(" ")[0] + "'s name opens " + want.slice(1) + " and the file loads", at);
    }
    check(errors.length === 0, "no errors opening files from every module", errors);
    await context.close();
  }
  // A file the import has no lines for says so, with the reason the API gives and the SEC link.
  {
    const { context, page, errors } = await open(390, fixture(FULL), { path: "/person.html?cik=999" });
    const at = await fileOpen(page);
    check(!at.ready && /No file for CIK 0000000999/.test(at.state) && /Insidir builds a file only from the Form 4 filings it has imported/.test(at.state) && /jointly/.test(at.state), "a CIK with no imported lines gets an honest 404 that mentions joint filings", at.state);
    check(errors.filter(e => !/HTTP 404 \/v1\/people\/999|Failed to load resource/.test(e)).length === 0, "no errors besides the 404 itself", errors);
    await context.close();
  }

  /* ---------- 7b. A name without a CIK lands on the directory's search result, not the top of the people page ---------- */
  const landed = async page => {
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length === 1, null, { timeout: 10000 });
    await page.waitForTimeout(150);
    await page.waitForFunction(() => new Promise(r => { const y = scrollY; setTimeout(() => r(Math.abs(scrollY - y) < 1), 400); }), null, { timeout: 10000 });
    return page.evaluate(() => {
      const c = document.querySelector("#v10-people-results .v10-person-card"), r = c.getBoundingClientRect();
      return { top: Math.round(r.top), vh: innerHeight, scrollY: Math.round(scrollY), focus: document.activeElement?.id || document.activeElement?.tagName, name: c.querySelector("strong")?.innerText, href: c.querySelector("strong a")?.getAttribute("href"), cards: document.querySelectorAll("#v10-people-results .v10-person-card").length, input: document.getElementById("v10-person-query").value, url: location.pathname + location.search + location.hash };
    });
  };
  for (const [width, reducedMotion] of [[1440, "no-preference"], [390, "reduce"]]) {
    const { context, page, errors } = await open(width, fixture(FULL), { reducedMotion, path: "/people.html?q=COOK%20TIMOTHY%20D#v10-directory" });
    const at = await landed(page);
    check(at.url === "/people.html?q=COOK%20TIMOTHY%20D#v10-directory" && at.cards === 1 && at.name === "Timothy D. Cook" && at.input === "COOK TIMOTHY D", width + "px: a people search link (a name with no CIK) shows that person's search result", at);
    check(at.top >= 70 && at.top < at.vh - 80 && at.scrollY > 0, width + "px: the result is inside the viewport below the sticky header (" + reducedMotion + " motion)", at);
    check(at.focus === "v10-people-status", width + "px: focus moves to the directory's status line", at.focus);
    check(at.href === "person.html?cik=1214156", width + "px: the directory card's name opens the person's file", at.href);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `people-search-${width}.png`) });
    check(errors.length === 0, width + "px: no errors on a people search link", errors);
    await context.close();
  }

  /* ---------- 8. People page: names and Familiar faces open personnel files ---------- */
  const FACES = ["/person.html?cik=1214156", "/person.html?cik=1513142", "/person.html?cik=1197649", "/person.html?cik=1494730"]; // Cook, Nadella, Huang, Musk: CIKs checked on SEC EDGAR
  for (const width of [1440, 390]) {
    const { context, page, errors } = await open(width, fixture(FULL), { path: "/people.html" });
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length === 4, null, { timeout: 10000 });
    // The company each person files for is named with its own logo tile, in the directory and in the followed list.
    await page.waitForFunction(() => document.querySelectorAll("#v10-followed-results .v10-follow-row").length === 3, null, { timeout: 10000 }).catch(() => {});
    const coTiles = await page.evaluate(() => ({ cards: [...document.querySelectorAll("#v10-people-results .v10-person-card")].map(c => !!c.querySelector(".v10-person-card__identity small .ins-inline [data-media=company]")), rows: [...document.querySelectorAll("#v10-followed-results .v10-follow-row")].map(r => !!r.querySelector("small .ins-inline [data-media=company]")) }));
    check(coTiles.cards.length === 4 && coTiles.cards.every(Boolean) && coTiles.rows.length === 3 && coTiles.rows.every(Boolean), width + "px: people.html names each person's company with its logo tile (directory cards and followed rows)", coTiles);
    const names = await page.evaluate(() => ({ cards: [...document.querySelectorAll("#v10-people-results .v10-person-card strong a")].map(a => a.getAttribute("href")), rows: [...document.querySelectorAll("#v10-followed-results .v10-follow-row strong a")].map(a => a.getAttribute("href")) }));
    check(names.cards.length === 4 && names.rows.length === 3 && [...names.cards, ...names.rows].every(h => /^person\.html\?cik=[1-9]\d{0,9}$/.test(h)) && names.rows.includes("person.html?cik=1494730"), width + "px: every directory card and followed row links the name to the person's file by SEC CIK", names);
    const faces = await page.$$eval(".v10-known__grid a", a => a.map(x => ({ href: x.getAttribute("href"), tile: !!x.querySelector(".ins-media, img") })));
    check(faces.length === 4 && faces.every((f, i) => "/" + f.href === FACES[i] && f.tile), width + "px: Familiar faces open each person's file (CIKs verified on SEC EDGAR), each with a portrait", faces);
    await Promise.all([page.waitForURL(/\/person\.html\?cik=1214156$/, { timeout: 10000 }), page.click(".v10-known__grid a >> nth=0")]);
    const at = await fileOpen(page);
    check(at.ready && at.name === "Timothy D. Cook", width + "px: the first Familiar face opens Tim Cook's file", at);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `person-${width}.png`), fullPage: true });
    check(errors.length === 0, width + "px: no errors on the people page or the file", errors);
    await context.close();
  }

  /* ---------- 9. Image sources unreachable: a logo stands in for a person, then initials; never a broken image ---------- */
  for (const [width, path] of [[1440, "/people.html"], [390, "/dashboard.html"]]) {
    const { context, page, errors } = await open(width, fixture(FULL, { blockMedia: true }), { path, blockImages: true });
    await page.waitForFunction(() => document.querySelectorAll(".ins-media--person").length >= 4, null, { timeout: 10000 });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({
      broken: [...document.images].filter(i => i.complete && !i.naturalWidth && !/\.svg/.test(i.src) && i.getBoundingClientRect().width > 0 && getComputedStyle(i).display !== "none" && getComputedStyle(i).visibility !== "hidden" && getComputedStyle(i).opacity !== "0").map(i => i.src.split("/").pop() || i.outerHTML.slice(0, 80)),
      tiles: [...document.querySelectorAll(".ins-media--person")].filter(t => t.getBoundingClientRect().width > 0).map(t => {
        const img = [...t.querySelectorAll("img")].find(i => getComputedStyle(i).display !== "none" && i.complete && i.naturalWidth > 0);
        const svg = [...t.querySelectorAll("svg")].find(s => getComputedStyle(s).display !== "none");
        const mono = svg?.querySelector("text")?.textContent || "";
        return { ok: !!img || /^[A-Z]{1,2}$/.test(mono), mono };
      })
    }));
    check(r.broken.length === 0, width + "px " + path + ": no broken-image icons when image sources are unreachable", r.broken);
    check(r.tiles.length > 0 && r.tiles.every(t => t.ok), width + "px " + path + ": every person tile shows a stand-in logo or visible initials", r.tiles.filter(t => !t.ok));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `no-images-${path.slice(1, -5)}-${width}.png`) });
    const unexpected = errors.filter(e => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource|HTTP (404|503) /.test(e));
    check(unexpected.length === 0, width + "px " + path + ": no script errors without images", unexpected);
    await context.close();
  }

  /* ---------- 10. People directory pages 24 at a time ---------- */
  {
    const { context, page, errors } = await open(1440, fixture(MANY), { path: "/people.html" });
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length > 0, null, { timeout: 10000 });
    const count = () => page.locator("#v10-people-results .v10-person-card").count();
    check(await count() === 24 && await text(page, "#v10-people-count") === "The first 100 reporting people · 24 shown", "directory shows 24 of 100 people with an honest count", await text(page, "#v10-people-count"));
    const more = (await text(page, "button[data-people-more]")).replace(/\s+/g, " ");
    check(/Show more people · 76 more/i.test(more), "a Show more button says how many remain", more);
    await page.click("button[data-people-more]");
    const focus = await page.evaluate(() => [...document.querySelectorAll("#v10-people-results .v10-person-card")].indexOf(document.activeElement?.closest(".v10-person-card")));
    check(await count() === 48 && focus === 24, "Show more adds 24 people and moves focus to the first new one", { cards: await count(), focus });
    for (let i = 0; i < 3; i++) if (await page.locator("button[data-people-more]").count()) await page.click("button[data-people-more]");
    check(await count() === 100 && await page.locator("button[data-people-more]").count() === 0 && await text(page, "#v10-people-count") === "The first 100 reporting people", "the button disappears once all 100 are shown");
    await page.fill("#v10-person-query", "FILER 00");
    await page.press("#v10-person-query", "Enter");
    await page.waitForFunction(() => /results? for/.test(document.getElementById("v10-people-status").textContent), null, { timeout: 10000 });
    check(await count() === 9 && /9 results for “FILER 00”/.test(await text(page, "#v10-people-status")), "a new search starts again from the first page", await text(page, "#v10-people-status"));
    check(errors.length === 0, "no errors while paging", errors);
    await context.close();
  }

  /* ---------- 11. Paywall: 401 → sign in, 402 → subscribe ---------- */
  for (const [status, target] of [[401, /\/signin\.html\?next=dashboard\.html$/], [402, /\/subscribe\.html\?next=dashboard\.html$/]]) {
    const body = status === 401 ? { error: "Sign in required", signin: "/signin.html" } : { error: "An active Insidir subscription is required", subscribe: "/subscribe.html" };
    const { context, page } = await open(390, (path) => path === "/v1/me" && status === 402 ? { status: 200, body: { ...me, access: { ...me.access, active: false, plan: "none", status: null } } } : path.startsWith("/v1/billing") ? { status: 200, body: {} } : { status, body });
    await page.waitForURL(target, { timeout: 10000 }).catch(() => {});
    check(target.test(page.url()), status + " sends the reader to " + (status === 401 ? "signin" : "subscribe") + ".html?next=dashboard.html", page.url());
    await context.close();
  }
  /* ---------- 12. The header search (the page's one search): every company and person in its results has a tile ---------- */
  for (const width of [1440, 390]) {
    const data = { ...FULL, "/v1/search": { items: [{ ticker: "AAPL", name: "Apple Inc." }, { ticker: "COST", name: "Costco Wholesale Corp" }] } };
    const { context, page, errors } = await open(width, fixture(data));
    await settle(page);
    const input = page.locator("#app-search-input");
    if (!(await input.isVisible())) { const t = page.locator(".app-search input, .app-search__toggle, button[aria-label*=earch]").first(); if (await t.count()) await t.click().catch(() => {}); await page.waitForTimeout(300); }
    await input.click(); await input.fill("coo");
    await page.waitForFunction(() => document.querySelectorAll(".app-search__option").length >= 3, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const opts = await page.$$eval(".app-search__option", o => o.map(a => ({ href: a.getAttribute("href"), label: a.querySelector(".app-search__label")?.textContent, meta: a.querySelector(".app-search__meta")?.textContent, tile: a.querySelector(".ins-media")?.dataset.media || "", hidden: a.querySelector(".ins-media")?.getAttribute("aria-hidden"), nested: a.querySelectorAll("a").length })));
    check(opts.length === 3 && opts.every(o => o.tile && o.hidden === "true" && !o.nested), width + "px: every header-search result carries its identity tile (aria-hidden, no link inside the option)", opts);
    check(opts[0]?.tile === "company" && opts[0]?.meta === "AAPL · Company" && opts[2]?.tile === "person" && opts[2]?.label === "Timothy D. Cook" && opts[2]?.meta === "Insider · AAPL", width + "px: companies get a logo tile with the ticker beside the name; people a headshot tile and their name as written", opts);
    check(opts[2]?.href === "person.html?cik=1214156" && opts[0]?.href === "company.html?ticker=AAPL", width + "px: a person in the header search opens their file by SEC CIK", opts.map(o => o.href));
    const panel = await page.evaluate(() => { const r = document.querySelector(".app-search__results").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth]; });
    check(panel[0] >= 0 && panel[1] <= panel[2], width + "px: the search results stay inside the screen", panel);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `dashboard-search-${width}.png`) });
    check(errors.length === 0, width + "px: no errors searching", errors);
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

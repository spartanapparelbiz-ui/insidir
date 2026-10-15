/* Insidir overview (dashboard.html) browser test.

   Opens the dashboard in headless Chromium against mocked /v1 responses and verifies that it makes sense to a
   paying reader, from the top down:
     - Today: the greeting and date, what changed since the last visit (counted from a seeded
       localStorage["insidir:overview:last-seen"] against each row's created_at), what the latest imported trades
       add up to (the same figures as 03), and how fresh the import is;
     - 01 People you follow (GET /v1/me/people/updates): the feed's exact sentences, New markers only on rows
       imported after the last visit, the followed list with each person's last 30 days, suggestions that exclude
       followed people; following and unfollowing live, with no reload: the button flips at once, the new person
       and their trades appear, an unfollowed person dims with Undo, a refused follow is reverted with the reason;
       the empty state (message, suggestions with Follow) and the error state (message, Try again);
     - describe(): the plain-English wording of every Form 4 code shown (P, S, A, M, F, G and the rest);
     - 02 Your watchlist and notes: each saved company's latest purchase or sale (looked up per ticker,
       /v1/transactions?ticker=X&limit=20, when the 100-row window has none), "Also filed since", the empty state's
       Save buttons (POST /v1/me/watchlist);
     - 03 Across the market: exact totals, the day chart (one tab stop, arrow keys, a readout on hover and focus),
       the Chart | Table switch inside its fixed frame, by company and the biggest trades;
     - 04 All recent trades: exact rows, word + code badges, the code legend, filters that crossfade without
       changing the page height; 05 About this data;
     - a logo or headshot tile beside every person and company the page names, identified by SEC CIK;
     - layout: no load shift (the header shell holds its 70px; skeletons hold the content's space) with staggered
       latency, no horizontal overflow at 360–1440px, touch targets, sharp images, no orange anywhere;
     - motion: atoms written per frame during a scroll never exceed the atoms on screen (plus a few settling);
     - links: every internal link returns 200, none goes to the landing page, external links only to the SEC or
       Wikimedia Commons; 503 everywhere then recovery through each "Try again"; 401 → sign in, 402 → subscribe;
     - the people page (v10-people.js): person links land on the search result, Familiar faces, paging, and
       tiles that fall back to a stand-in logo or visible initials when image sources are unreachable.
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
function updatesFor(ciks) {
  const since = SERVER_NOW - 30 * 86400000;
  const byPub = (a, b) => b.published_at.localeCompare(a.published_at) || b.transaction_date.localeCompare(a.transaction_date);
  const items = ALL_LINES.filter(x => ciks.includes(x.owner_cik)).sort(byPub);
  const people = ciks.map(cik => {
    const rows = items.filter(x => x.owner_cik === cik), recent = rows.filter(x => Date.parse(x.published_at) >= since), last = rows[0] || null;
    return { owner_cik: cik, owner_name: PERSON[cik][0], followed_at: "2026-09-01T00:00:00Z", ticker: PERSON[cik][1], issuer_name: PERSON[cik][2], last, last_published_at: last?.published_at ?? null, last_transaction_date: last?.transaction_date ?? null,
      filings_30d: new Set(recent.map(x => x.accession)).size, transactions_30d: recent.length,
      purchases_30d_value: recent.filter(x => x.category === "reported_purchase").reduce((s, x) => s + x.estimated_value, 0), sales_30d_value: recent.filter(x => x.category === "reported_sale").reduce((s, x) => s + x.estimated_value, 0) };
  }).sort((a, b) => String(b.last_published_at).localeCompare(String(a.last_published_at)));
  return { people, items: items.slice(0, 40), following: ciks.length, source: "SEC Form 4", disclaimer: "Reported purchases and sales are not recommendations or predictive signals." };
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
    if (path === "/v1/me/people/updates") return { status: 200, body: updatesFor(state.follows) };
    if (path === "/v1/me/people") return { status: 200, body: { items: state.follows.map(cik => ({ owner_cik: cik, owner_name: PERSON[cik]?.[0] || "FIXTURE FILER", ticker: PERSON[cik]?.[1] || null, last_transaction_date: "2026-09-12", created_at: "2026-09-01T00:00:00Z" })) } };
    if (path === "/v1/transactions" && q?.has("ticker")) {
      const all = [...(data["/v1/transactions"]?.items || []), ...(data.older || [])].filter(x => x.ticker === q.get("ticker"));
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
  const people = [...document.querySelectorAll('main a[href^="people.html?q="]')].filter(a => !a.matches("[data-ent]")).map(a => a.textContent.trim());
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
      decorativePhotos: document.querySelectorAll('.app-main img[src*="assets/img/"]').length,
      credits: !!document.querySelector("[data-media-credits]"),
      today: ["rd-today-you", "rd-today-market", "rd-today-fresh"].map(id => document.getElementById(id)?.textContent.replace(/\s+/g, " ").trim())
    }));
    check(H.greeting === "Good evening.", "greeting is set from the reader's local time (21:00)", H.greeting);
    check(H.date === "Overview · Wed, Oct 14, 2026", "Today's eyebrow names the day", H.date);
    check(!H.heroSearch && !H.shortcuts && !H.filingsModule, "no duplicate hero search, no shortcut row, no Latest filings module", H);
    check(H.headerSearch, "the header search (⌘K, /) is the page's one search");
    check(JSON.stringify(H.order) === JSON.stringify(["rd-today", "v10-follow-feed", "v10-follow-list", "v3-watchlist", "v3-notes", "rd-kpis", "rd-daily-chart", "rd-companies", "rd-largest", "v3-trades", "v4-data-state"]), "reading order: Today, people you follow (feed, list), watchlist, notes, across the market, all recent trades, about this data", H.order);
    check(H.decorativePhotos === 0, "no decorative photographs on the dashboard", H.decorativePhotos);
    check(H.credits, "a media credits footnote ([data-media-credits]) is on the page");
    check(H.today[0] === "Since your last visit on Sep 1 at 12:00 AM: 2 new trades from 2 of the 3 people you follow. 2 companies on your watchlist have new trades.", "Today says what is new since the last visit, from the people followed and the watchlist", H.today[0]);
    check(H.today[1] === "Across all 5 trades imported from SEC filings (traded Sep 1 – Sep 12, 2026), insiders bought $42,000 and sold $327,000 of their own companies' stock.", "Today sums the latest imported trades with exact figures (the same as 03)", H.today[1]);
    check(H.today[2] === "Last import Oct 14, 2026, 09:12 UTC · newest filing published Sep 14, 2026.", "Today says how fresh the import is", H.today[2]);
    for (const route of ["/v1/me/people/updates?limit=40", "/v1/transactions?limit=100", "/v1/filings?limit=1", "/v1/me/watchlist", "/v1/me/research-decisions", "/v1/status"]) check(api.includes("GET " + route), "dashboard requests " + route, api);
    check(!api.some(a => /GET \/v1\/me\/people(\?|$)/.test(a)) && !api.some(a => /GET \/v1\/insiders/.test(a)) && !api.some(a => /\/v1\/filings\?limit=12/.test(a)), "no /v1/me/people list, no /v1/insiders (following 3 or more), no 12-filing list", api);

    // 01: the feed, in words, newest filing first; New only on rows imported after the last visit.
    const feed = await page.$$eval("#v10-follow-feed .rd-feed__row", rows => rows.map(r => ({ text: r.innerText.replace(/\s+/g, " ").trim(), owner: r.dataset.owner, isNew: !!r.querySelector(".rd-new"), label: r.getAttribute("aria-label"), filing: r.querySelector('a[href^="filing.html"]')?.getAttribute("href"), tiles: [...r.querySelectorAll(".ins-media")].map(t => t.classList.contains("ins-media--person") ? "person" : "company") })));
    check(feed.length === 5, "the feed shows every line the followed people filed (5)", feed.length);
    check(/^Timothy D\. Cook Sold · S sold 12,500 AAPL shares at \$26\.00 = \$325,000 New since your last visit Apple Inc\. · traded Sep 12, 2026 · filed Sep 14, 2026 \(2 days later\) · Filing ↗$/i.test(feed[0]?.text), "feed row 1: who, what (word + code), shares × price = value, company, trade and filing dates with the lag", feed[0]?.text);
    check(/^Jen Hsun Huang Bought · P bought 1,500 NVDA shares at \$28\.00 = \$42,000 New since your last visit NVIDIA Corp · /i.test(feed[1]?.text), "feed row 2: a purchase, marked New", feed[1]?.text);
    check(/Gift · G gave 5,000 AAPL shares as a gift Apple Inc\./i.test(feed[2]?.text) && !feed[2]?.isNew, "a gift reads as a gift, not new (imported before the last visit)", feed[2]);
    check(/Tax withholding · F had 2,000 AAPL shares withheld to pay tax or the exercise price/i.test(feed[3]?.text), "a code F line reads as tax withholding", feed[3]?.text);
    check(/^Elon Musk Sold · S sold 1,000 TSLA shares at \$250\.00 = \$250,000/i.test(feed[4]?.text) && /traded Jun 2, 2026 · filed Jun 4, 2026/.test(feed[4]?.text), "an older sale from a followed person", feed[4]?.text);
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
        amended: d({ ...base, transaction_code: "P", category: "reported_purchase", acquired_disposed: "A", shares: 1, price_per_share: 2, estimated_value: 2, is_amendment: true })
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

    // 02: watchlist and notes.
    const watch = await page.$$eval("#v3-watchlist .rd-row--watch", rows => rows.map(r => ({ href: r.querySelector("a.rd-row__link")?.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ").trim(), isNew: !!r.querySelector(".rd-new") })));
    check(watch.length === 4, "watchlist shows every saved company (4)", watch);
    check(watch[0]?.href === "company.html?ticker=AAPL" && /Timothy D\. Cook sold 12,500 shares at \$26\.00 = \$325,000 · traded Sep 12, filed Sep 14 \(2 days later\)/.test(watch[0]?.text) && watch[0]?.isNew, "AAPL: its latest purchase or sale in a sentence, with the filing lag, marked New", watch[0]);
    check(/Jen Hsun Huang bought 1,500 shares at \$28\.00 = \$42,000/.test(watch[1]?.text) && /Also filed since: option exercise by Colette Kress \(Sep 11\)/.test(watch[1]?.text), "NVDA: the latest purchase, then a later option exercise as 'Also filed since'", watch[1]?.text);
    check(/Elon Musk sold 1,000 shares at \$250\.00 = \$250,000 · traded Jun 2, filed Jun 4 \(2 days later\)/.test(watch[2]?.text), "a watched ticker outside the window shows its own latest sale (looked up)", watch[2]?.text);
    check(/IBM.*No insider filings imported yet/.test(watch[3]?.text), "a watched ticker with no records says so plainly", watch[3]?.text);
    const lookups = api.filter(a => /\/v1\/transactions\?ticker=/.test(a)).sort();
    check(JSON.stringify(lookups) === JSON.stringify(["GET /v1/transactions?ticker=IBM&limit=20", "GET /v1/transactions?ticker=TSLA&limit=20"]), "per-ticker lookups (limit 20) only for watched tickers with no purchase or sale in the window", lookups);
    const notes = await page.$$eval("#v3-notes .rd-row--note", rows => rows.map(r => ({ href: r.getAttribute("href"), text: r.innerText.replace(/\s+/g, " ").trim(), logo: !!r.querySelector(".ins-media--company") })));
    check(notes.length === 2 && notes[0].href === "research.html?ticker=AAPL" && /Researching/.test(notes[0].text) && /latest 10-K/.test(notes[0].text) && /Sep 2, 2026/.test(notes[0].text) && notes.every(n => n.logo), "notes: status, text, date, a logo on each row, linking the research desk", notes);
    const noteX = await page.$$eval("#v3-notes .rd-row__detail", d => d.map(e => Math.round(e.getBoundingClientRect().left)));
    check(noteX.length === 2 && noteX[0] === noteX[1], "note text starts at the same x on every row", noteX);

    // 03: exact totals.
    const flow = await page.evaluate(() => ({
      scope: document.getElementById("rd-flow-scope").textContent,
      kpis: Object.fromEntries([...document.querySelectorAll(".rd-kpi")].map(k => [k.querySelector(".rd-kpi__label").textContent.trim(), k.querySelector(".rd-kpi__value").textContent.trim() + " | " + k.querySelector(".rd-kpi__note").textContent.replace(/ /g, " ").trim()])),
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
    check(tradeLinks.includes("people.html?q=COOK%20TIMOTHY%20D#v10-directory") && tradeLinks.includes("company.html?ticker=AAPL") && tradeLinks.includes("filing.html?accession=000032019326000001"), "a trade row links the person, the company and the filing", tradeLinks);
    const foot = flat(await text(page, "#v3-trades-foot"));
    check(foot === "Showing all 5 trades. Browse every filing ↗ Codes: P bought on the market, S sold on the market, A grant or award, M option exercise.", "the foot says what is shown and explains only the codes on screen", foot);
    const chips = [];
    for (const f of ["all", "reported_purchase", "reported_sale", "other"]) chips.push(await said(page, `[data-filter="${f}"]`));
    check(JSON.stringify(chips) === JSON.stringify(["All 5", "Purchases 1", "Sales 2", "Grants, exercises & gifts 2"]), "filters name what they hold, with real counts (5 / 1 / 2 / 2)", chips);
    await page.locator(".rd-filters").scrollIntoViewIfNeeded();
    const hBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    const heights = [];
    await page.click('[data-filter="reported_purchase"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 1 && /NVDA/.test(t[0]) && /Bought · P/i.test(t[0]), "Purchases shows only purchases", t);
    check(await page.getAttribute('[data-filter="reported_purchase"]', "aria-pressed") === "true" && await text(page, "#v3-trades-status") === "Showing 1 purchase", "the pressed filter is announced (aria-pressed, live region)");
    await page.click('[data-filter="reported_sale"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 2 && t.every(r => /Sold · S/i.test(r)), "Sales shows only sales", t);
    await page.click('[data-filter="other"]'); await page.waitForTimeout(400); t = await rows(); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check(t.length === 2 && /Option exercise · M/i.test(t[0]) && /Grant · A/i.test(t[1]), "Grants, exercises & gifts shows the other codes", t);
    await page.click('[data-filter="all"]'); await page.waitForTimeout(400); heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    check((await rows()).length === 5, "All restores every row");
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
      return [...document.querySelectorAll("#rd-about > div")].map(d => pseudo(d, "::before") + [...d.children].filter(c => !c.classList.contains("sr-only")).map(c => c.textContent.replace(/\s+/g, " ").trim()).join(" ") + pseudo(d, "::after")).join("");
    });
    check(about === "Source: SEC EDGAR, Form 4 · Status: Online · 1,234 filings imported · last import Oct 14, 2026, 09:12 UTC · newest filing published Sep 14, 2026.", "about this data reads as one line with exact figures", about);

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
    const y0 = await btn.evaluate(b => b.getBoundingClientRect().top);
    await btn.click();
    const flipped = await btn.evaluate(b => [b.textContent, b.getAttribute("aria-pressed"), b.getAttribute("aria-label")]);
    check(flipped[0] === "Following ✓" && flipped[1] === "true" && flipped[2] === "Unfollow Public Filer Other", "Follow flips the button at once (optimistic)", flipped);
    await page.waitForFunction(o => !!document.querySelector(`#v10-follow-list .rd-fl[data-owner="${o}"]`), OTHER, { timeout: 5000 }).catch(() => {});
    await rest(page, "#rd-follow");
    const after = await page.evaluate(o => ({ label: document.getElementById("rd-list-label").textContent, inList: !!document.querySelector(`#v10-follow-list .rd-fl[data-owner="${o}"]`), inFeed: !!document.querySelector(`#v10-follow-feed .rd-feed__row[data-owner="${o}"]`), focus: document.activeElement?.dataset?.follow, toast: document.getElementById("rd-toast").textContent }), OTHER);
    const y1 = await btn.evaluate(b => b.getBoundingClientRect().top);
    check(fx.state.posts.includes("follow " + OTHER) && api.filter(a => a === "GET /v1/me/people/updates?limit=40").length === 2, "following POSTs the CIK and reads the updates again, without reloading the page", [fx.state.posts, api.filter(a => /updates/.test(a))]);
    check(after.label === "Following · 4" && after.inList && after.inFeed, "the new person joins the followed list and their trade the feed, live", after);
    check(after.focus === OTHER && Math.abs(y1 - y0) < 1, "focus stays on the button, which has not moved", [after.focus, y0, y1]);
    check(/^Following Public Filer Other\./.test(after.toast), "the result is announced (role=status)", after.toast);
    // Unfollow from the list: the person dims in place with Undo; Undo follows again.
    const lb = page.locator(`#v10-follow-list button[data-follow="${COOK}"]`);
    await lb.scrollIntoViewIfNeeded(); await rest(page, "#rd-follow");
    const rowsBefore = await page.$$eval("#v10-follow-list .rd-fl", r => r.map(x => x.getBoundingClientRect().top));
    await lb.click(); await page.waitForTimeout(400); await rest(page, "#rd-follow");
    const un = await page.evaluate(c => ({ dim: document.querySelector(`#v10-follow-list .rd-fl[data-owner="${c}"]`)?.classList.contains("is-dropped"), feedDim: [...document.querySelectorAll(`#v10-follow-feed .rd-feed__row[data-owner="${c}"]`)].every(r => r.classList.contains("is-dropped")), btn: document.querySelector(`#v10-follow-list button[data-follow="${c}"]`)?.textContent, toast: document.getElementById("rd-toast").textContent.replace(/\s+/g, " ").trim(), undo: !!document.querySelector("#rd-toast button[data-undo]"), rows: [...document.querySelectorAll("#v10-follow-list .rd-fl")].map(x => x.getBoundingClientRect().top) }), COOK);
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
      const wide = [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest(".rd-table-wrap,.rd-flist,.rd-dtable")).slice(0, 5).map(e => e.tagName.toLowerCase() + "." + [...e.classList].join("."));
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
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, blurry, wide, small, h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize) };
    });
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
      // Filed at 9:30 p.m. Eastern: the SEC filing day is Sep 14, though it is Sep 15 in UTC. A four-decimal weighted price.
      T({ id: 23, accession: "000000000026000023", ticker: "BIGC", issuer_cik: "0000000002", issuer_name: "BIG CO", owner_name: "ROE RICHARD", owner_cik: "0000000008", transaction_date: "2026-09-10", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: "60000000", price_per_share: "41.5321", estimated_value: "2491926000", published_at: "2026-09-15T01:30:00.000Z" }),
      // A grant filed at $0.00, and two different issuers that both put the placeholder "NONE" in the ticker field.
      T({ id: 24, accession: "000000000026000024", ticker: "NONE", issuer_cik: "0000000003", issuer_name: "PRIVATE ONE LLC", owner_name: "POE EDGAR", owner_cik: "0000000007", transaction_date: "2026-09-09", transaction_code: "A", acquired_disposed: "A", category: "other", shares: 5000, price_per_share: 0, estimated_value: 0, published_at: "2026-09-11T20:00:00Z" }),
      T({ id: 25, accession: "000000000026000025", ticker: "NONE", issuer_cik: "0000000004", issuer_name: "PRIVATE TWO INC", owner_name: "LOE ANN", owner_cik: "0000000006", transaction_date: "2026-09-09", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 100, price_per_share: 10, estimated_value: 1000, published_at: "2026-09-11T20:00:00Z" }),
      T({ id: 26, accession: "000000000026000026", ticker: "NONE", issuer_cik: "0000000005", issuer_name: "PRIVATE THREE CO", owner_name: "MOE MAX", owner_cik: "0000000005", transaction_date: "2026-09-09", transaction_code: "S", acquired_disposed: "D", category: "reported_sale", shares: 200, price_per_share: 10, estimated_value: 2000, published_at: "2026-09-11T20:00:00Z" })
    ] } };
    for (const width of [1440, 390]) {
      const { context, page, errors } = await open(width, fixture(big));
      await settle(page);
      const e = await page.evaluate(() => {
        const kpi = Object.fromEntries([...document.querySelectorAll(".rd-kpi")].map(k => [k.querySelector(".rd-kpi__label").textContent.trim(), k.querySelector(".rd-kpi__value").textContent.trim() + " | " + k.querySelector(".rd-kpi__note").textContent.replace(/ /g, " ").trim()]));
        const tiles = [...document.querySelectorAll(".rd-kpi")].map(k => { const v = k.querySelector(".rd-kpi__value"), r = k.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(v); const tr = range.getBoundingClientRect(); return { fits: tr.right <= r.right + 1 && tr.left >= r.left - 1 }; });
        return {
          kpi, tiles, scope: document.getElementById("rd-flow-scope").textContent,
          rows: [...document.querySelectorAll("#v3-trades tr")].map(r => r.innerText.replace(/\s+/g, " ")),
          companies: [...document.querySelectorAll("#rd-companies .rd-co__row")].map(r => r.innerText.replace(/\s+/g, " ")),
          coStarts: [...document.querySelectorAll("#rd-companies .rd-co__track--buy")].map(t => Math.round(t.getBoundingClientRect().left)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      check(e.kpi.Bought.startsWith("$1,000,000 | 1 purchase"), width + "px: an amended 4/A replaces the line it restates instead of doubling it", e.kpi.Bought);
      check(/1 amended line replaces its original/.test(e.scope), width + "px: the scope says an amended line replaced its original", e.scope);
      check(e.kpi.Sold.startsWith("$2,491,929,000 | 3 sales"), width + "px: sold total to the dollar", e.kpi.Sold);
      check(e.tiles.every(t => t.fits) && e.overflow <= 1, width + "px: ten-digit totals fit their tiles", e);
      const bigRow = e.rows.find(r => /BIGC/.test(r)) || "";
      check(/\$41\.5321/.test(bigRow) && /Sep 14/.test(bigRow) && /4 days later/.test(bigRow), width + "px: a four-decimal price prints as filed and an evening filing keeps its SEC (Eastern) day and lag", bigRow);
      const grant = e.rows.find(r => /Private One/i.test(r)) || "";
      check(/\$0\.00/.test(grant) && (/No ticker/i.test(grant) || width < 760), width + "px: a $0.00 grant prints its price as filed; a placeholder ticker is not shown as a symbol", grant);
      check(e.companies.length === 4 && e.companies.some(c => /^Private Two Inc/.test(c)) && e.companies.some(c => /^Private Three Co/.test(c)), width + "px: by company groups by issuer, not by the placeholder ticker, and names an issuer without a ticker", e.companies);
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
    check(runs.partial === "last import Oct 14, 2026, 09:12 UTC · partial import" && runs.running === "import started Oct 14, 2026, 09:00 UTC · in progress" && runs.error === "last import Oct 14, 2026, 09:03 UTC · import failed", "about this data reads partial, running and failed imports in plain words", runs);
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
    const sy = await sb.evaluate(b => b.getBoundingClientRect().top);
    await sb.click(); await page.waitForTimeout(400); await rest(page);
    const s = await sb.evaluate(b => [b.textContent, b.getAttribute("aria-pressed"), b.getBoundingClientRect().top]);
    check(fx.state.posts.includes("save NVDA") && s[0] === "Saved ✓" && s[1] === "true" && Math.abs(s[2] - sy) < 1 && await said(page, "#rd-toast") === "Saved NVDA to your watchlist.", "Save adds the company (POST) and the button says so, in place", [...s, sy, await said(page, "#rd-toast")]);
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
    check(/0 filings imported/.test(e["rd-about"]) && /no import recorded yet/.test(e["rd-about"]) && /no filings imported yet/.test(e["rd-about"]), "about this data with nothing imported", e["rd-about"]);
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
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dashboard-error-1024.png"), fullPage: true });
    healthy = true;
    await page.click('#v10-follow-feed button[data-retry="follow"]');
    await page.waitForFunction(() => document.querySelectorAll("#v10-follow-feed .rd-feed__row").length === 5, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v10-follow-feed .rd-feed__row").count() === 5 && await page.locator("#v10-follow-list .rd-fl").count() === 3, "Try again reloads the people you follow");
    await page.click('#v3-trades button[data-retry="trades"]');
    await page.waitForFunction(() => document.querySelectorAll("#v3-trades tr.rd-trade").length === 5 && document.querySelectorAll("#rd-daily-chart .rd-day").length === 3, null, { timeout: 10000 }).catch(() => {});
    check(await page.locator("#v3-trades tr.rd-trade").count() === 5 && await page.locator("#rd-daily-chart .rd-day").count() === 3 && await page.locator("#rd-kpis .rd-kpi").count() === 5, "Try again reloads the trades, the totals and the chart");
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

  /* ---------- 7. Person links land on the search result, not the top of the people page ---------- */
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
    await Promise.all([page.waitForURL(/\/people\.html\?q=/, { timeout: 10000 }), page.click("#v10-follow-feed .rd-feed__row:first-child a[data-ent=person]")]);
    const at = await landed(page);
    check(at.url === "/people.html?q=COOK%20TIMOTHY%20D#v10-directory" && at.cards === 1 && at.name === "Timothy D. Cook", width + "px: a person in the feed opens people.html with that person's search result", at);
    check(at.top >= 70 && at.top < at.vh - 80 && at.scrollY > 0, width + "px: the result is inside the viewport below the sticky header (" + reducedMotion + " motion)", at);
    check(at.focus === "v10-people-status", width + "px: focus moves to the directory's status line", at.focus);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `people-from-dashboard-${width}.png`) });
    check(errors.length === 0, width + "px: no errors following a person link", errors);
    await context.close();
  }

  /* ---------- 8. Familiar faces search in place (people.html) ---------- */
  for (const width of [1440, 390]) {
    const { context, page, errors } = await open(width, fixture(FULL), { path: "/people.html" });
    await page.waitForFunction(() => document.querySelectorAll("#v10-people-results .v10-person-card").length === 4, null, { timeout: 10000 });
    await page.evaluate(() => { window.__stay = 1; });
    const faces = await page.$$eval(".v10-known__grid a", a => a.map(x => ({ href: x.getAttribute("href"), tile: !!x.querySelector(".ins-media, img") })));
    check(faces.length === 4 && faces.every(f => /^people\.html\?q=[^#]+#v10-directory$/.test(f.href) && f.tile), width + "px: Familiar faces link to the directory search, each with a portrait", faces);
    await page.click(".v10-known__grid a >> nth=0");
    const at = await landed(page);
    check(at.stay, width + "px: a Familiar faces tile searches without reloading the page", at);
    check(at.url === "/people.html?q=Cook%20Timothy#v10-directory" && at.input === "Cook Timothy" && at.cards === 1 && at.name === "Timothy D. Cook", width + "px: the tile fills the search box and shows the matching record", at);
    check(at.top >= 70 && at.top < at.vh - 80, width + "px: the Familiar faces result is inside the viewport", at);
    check(errors.length === 0, width + "px: no errors on the people page", errors);
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

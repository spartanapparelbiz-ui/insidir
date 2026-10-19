/* Page performance in Chrome, under throttling close to Lighthouse's: Largest Contentful Paint, Cumulative Layout Shift,
   total blocking time, the slowest interaction (Event Timing, the measure INP is built on), and what is transferred on a
   first and a repeat visit. Static files come from the real server code (src/web.mjs: compression, cache headers, 304s);
   /v1 is answered locally from scripts/fixtures/intelligence-api.json and small fixtures, so the numbers measure the
   front end and the static delivery, not production's database or network.
   Usage: CHROME_BIN=... node scripts/perf-check.mjs [--json out.json] [--pages /,/pricing.html] [--runs 3] */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const PAGES = opt("pages", "/,/pricing.html,/signup.html,/subscribe.html,/platform.html,/dashboard.html,/intelligence.html,/watchlist.html,/people.html").split(",");
const RUNS = Number(opt("runs", "3"));
const OUT = opt("json", "");
const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));

const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true } };
const line = (id, ticker, name, owner, cik, code, cat, shares, price) => ({ id, accession: "00000000002600000" + id, ticker, issuer_name: name, issuer_cik: "0000320193", owner_name: owner, owner_cik: cik,
  transaction_date: "2026-10-1" + (id % 6), transaction_code: code, acquired_disposed: cat === "reported_purchase" ? "A" : "D", category: cat, shares, price_per_share: price, estimated_value: price ? shares * price : null,
  published_at: "2026-10-16T20:00:00Z", created_at: "2026-10-16T20:05:00Z", source_url: "https://www.sec.gov/Archives/edgar/data/320193/x.htm", is_amendment: false, derivative: false, security_title: "Common Stock", direct_ownership: "D" });
const TRADES = Array.from({ length: 60 }, (_, i) => line(i + 1, ["AAPL", "NVDA", "MSFT", "PEP"][i % 4], ["Apple Inc.", "NVIDIA CORP", "MICROSOFT CORP", "PepsiCo"][i % 4], "PERSON " + i, String(1000000 + i).padStart(10, "0"), i % 3 ? "S" : "P", i % 3 ? "reported_sale" : "reported_purchase", 1000 + i * 10, 100 + i));
function api(path, method, url) {
  if (path === "/v1/me") return me;
  if (path === "/v1/status") return { engine: "online", sec: "configured", filings: 1234, lastIngest: { started_at: "2026-10-16T21:00:00Z", finished_at: "2026-10-16T21:10:00Z", status: "success" } };
  if (path === "/v1/billing/status") return { enabled: true, access: me.access, offer: { kind: "trial", trialDays: 3, trialFeeCents: 100, planCents: 3900, disclosure: "You will be charged $1.00 today. Unless you cancel before the end of your 3-day trial, your subscription renews automatically at $39.00 per month until you cancel.", disclosureVersion: "test" } };
  if (path === "/v1/transactions") return { items: TRADES.slice(0, Number(url.searchParams.get("limit")) || 100) };
  if (path === "/v1/me/people/updates") return { people: [], items: [], following: 0 };
  if (path === "/v1/me/intelligence/briefing") return F.briefing;
  if (path === "/v1/ai/status") return F.aiStatus;
  if (path === "/v1/intelligence/mirror/managers") return F.managers;
  if (path.startsWith("/v1/intelligence/mirror/managers/")) return F.manager;
  if (path === "/v1/intelligence/mirror/simulate") return { ...F.simulate, budget: 10000, allocated: 10000 };
  if (path === "/v1/media") return { logos: {}, photos: {}, owners: {}, pending: { logos: [], photos: [] }, invalid: [] };
  return { items: [] };
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/v1/")) {
    const body = JSON.stringify(api(url.pathname, req.method, url));
    setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(body); }, 60); // a database round trip
    return;
  }
  serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const PROFILES = {
  mobile: { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true, cpu: 4, net: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } },
  desktop: { viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false, cpu: 1, net: { latency: 40, downloadThroughput: 10 * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 } }
};
// Controls whose response time is measured on each page, where they exist (first match of each).
const INTERACTIONS = ["#v6-menu-button:visible", ".lp-faq summary", "details summary", "[data-window] [data-days='30']", "[data-ix-tab='investigate']", ".app-search input", "#rd-follow button", "a.v9-btn--ink"];
const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0, fcp: 0, inp: 0, events: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; }).observe({ type: "paint", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__perf.inp = Math.max(window.__perf.inp, e.duration); window.__perf.events.push(e.name + ":" + Math.round(e.duration)); } }).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch {}
};

async function measure(path, profileName) {
  const P = PROFILES[profileName];
  const ctx = await browser.newContext({ viewport: P.viewport, deviceScaleFactor: P.dpr, isMobile: P.mobile, hasTouch: P.mobile });
  await ctx.addInitScript(OBSERVE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...P.net });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
  let bytes = 0, requests = 0, notModified = 0, fromCache = 0;
  cdp.on("Network.loadingFinished", e => { bytes += e.encodedDataLength; requests++; });
  cdp.on("Network.responseReceived", e => { if (e.response.status === 304) notModified++; });
  cdp.on("Network.requestServedFromCache", () => { fromCache++; });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  // Interactions, after the page has settled.
  for (const sel of INTERACTIONS) {
    const el = page.locator(sel).first();
    if (!(await el.count()) || !(await el.isVisible().catch(() => false))) continue;
    try {
      if (sel.startsWith(".app-search")) { await el.click({ timeout: 2000 }); await page.keyboard.type("app", { delay: 60 }); }
      else if (sel.startsWith("a.")) { await el.hover({ timeout: 2000 }); }
      else { await el.click({ timeout: 2000, noWaitAfter: true }); await page.waitForTimeout(150); if (sel.includes("menu-button")) await el.click({ timeout: 2000 }); }
    } catch {}
    await page.waitForTimeout(250);
  }
  const cold = await page.evaluate(() => ({ ...window.__perf, events: undefined, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  const first = { bytes, requests };
  bytes = 0; requests = 0; notModified = 0; fromCache = 0;
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const warm = await page.evaluate(() => ({ lcp: window.__perf.lcp, cls: window.__perf.cls }));
  await ctx.close();
  return { lcp: cold.lcp, fcp: cold.fcp, cls: cold.cls, tbt: cold.tbt, inp: cold.inp, overflow: cold.overflow, kb: first.bytes / 1024, requests: first.requests,
    repeatKb: bytes / 1024, repeatRequests: requests, repeat304: notModified, repeatLcp: warm.lcp, errors };
}
// --shots DIR: full-page screenshots of every page at phone, tablet, desktop and 4K widths instead of measuring.
const SHOTS = opt("shots", "");
if (SHOTS) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(SHOTS, { recursive: true });
  for (const [label, width, height, dpr, mobile] of [["phone", 390, 844, 1, true], ["tablet", 768, 1024, 2, true], ["desktop", 1440, 900, 1, false], ["4k", 3840, 2160, 1, false]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    for (const path of PAGES) {
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.InsidirMotion && window.InsidirMotion.revealAll && window.InsidirMotion.revealAll());
      // Walk down the page so lazy images and content-visibility sections render before the full-page shot.
      await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); });
      const name = (path === "/" ? "index" : path.replace(/^\/|\.html$/g, "").replace(/[^\w-]/g, "_")) + "-" + label + ".png";
      await page.screenshot({ path: SHOTS + "/" + name, fullPage: label !== "4k" });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  process.exit(0);
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const results = {};
for (const profile of Object.keys(PROFILES)) for (const path of PAGES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(path, profile));
  const m = {};
  for (const k of ["lcp", "fcp", "cls", "tbt", "inp", "kb", "requests", "repeatKb", "repeatRequests", "repeat304", "repeatLcp", "overflow"]) m[k] = median(runs.map(r => r[k]));
  m.errors = [...new Set(runs.flatMap(r => r.errors))];
  results[profile + " " + path] = m;
  console.log(`${profile.padEnd(7)} ${path.padEnd(20)} LCP ${Math.round(m.lcp)}ms  FCP ${Math.round(m.fcp)}ms  CLS ${m.cls.toFixed(3)}  TBT ${Math.round(m.tbt)}ms  slowest interaction ${Math.round(m.inp)}ms  ${Math.round(m.kb)}KB/${m.requests} req  repeat ${Math.round(m.repeatKb)}KB/${m.repeatRequests} req (${m.repeat304} × 304)  overflow ${m.overflow}px${m.errors.length ? "  errors: " + m.errors.join(" | ").slice(0, 160) : ""}`);
}
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
await browser.close(); server.close();

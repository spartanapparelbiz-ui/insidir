#!/usr/bin/env node
/* Core Web Vitals in Chrome for a list of pages: LCP, CLS and an interaction latency (INP proxy), plus transfer
 * size, request count and the LCP element. Lab numbers from one machine, not field data: run it before and after
 * a change on the same machine and network, and compare.
 *
 *   node scripts/perf-live.mjs --base=https://insidir.com [--pages=/,/pricing.html] [--runs=3] [--mobile] [--json]
 *
 * --mobile emulates a 390x844 phone at DPR 3 with 4x CPU throttling and a 1.6 Mbps / 150 ms network ("slow 4G"),
 * the profile the 2.5 s LCP target is usually judged against. Without it: 1440x900 desktop, no throttling.
 * Interaction: the first visible button or link in <main> is pressed (pointerdown→pointerup) and the longest
 * Event Timing entry is reported; pages without one report null. Targets: LCP ≤ 2500 ms, CLS ≤ 0.1, INP ≤ 200 ms. */
import { chromium } from "playwright-core";

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const base = arg("base", "https://insidir.com").replace(/\/$/, "");
const pages = arg("pages", "/,/pricing.html,/signin.html,/signup.html,/stories.html,/terms.html,/why-insidir.html").split(",");
const runs = Math.max(1, Math.min(9, Number(arg("runs", 3)) || 3));
const mobile = process.argv.includes("--mobile"), asJson = process.argv.includes("--json");

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const results = [];
for (const path of pages) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (mobile) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    }
    let bytes = 0, requests = 0;
    cdp.on("Network.loadingFinished", e => { bytes += e.encodedDataLength; requests++; });
    await page.addInitScript(() => {
      window.__v = { lcp: 0, lcpEl: null, cls: 0, inp: null };
      new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__v.lcp = e.startTime; window.__v.lcpEl = e.element ? (e.element.tagName + (e.element.id ? "#" + e.element.id : "") + (e.element.className && typeof e.element.className === "string" ? "." + e.element.className.trim().split(/\s+/)[0] : "")) : (e.url || null); } }).observe({ type: "largest-contentful-paint", buffered: true });
      let session = 0, last = 0, first = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; if (e.startTime - last > 1000 || e.startTime - first > 5000) { session = 0; first = e.startTime; } session += e.value; last = e.startTime; window.__v.cls = Math.max(window.__v.cls, session); } }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__v.inp = Math.max(window.__v.inp || 0, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    });
    const t0 = Date.now();
    const res = await page.goto(base + path, { waitUntil: "load", timeout: 90000 }).catch(e => ({ status: () => "ERR " + e.message.split("\n")[0] }));
    await page.waitForTimeout(2500);
    // An interaction: something harmless in the page body (a disclosure, a tab, a non-navigating button).
    const target = await page.$("main button:not([type=submit]):not([disabled]), main [role=tab], main summary");
    if (target && await target.isVisible().catch(() => false)) { const b = await target.boundingBox(); if (b) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600); } }
    const v = await page.evaluate(() => window.__v).catch(() => ({}));
    samples.push({ status: res?.status?.(), lcp: Math.round(v.lcp || 0) || null, cls: Number((v.cls || 0).toFixed(4)), inp: v.inp == null ? null : Math.round(v.inp), lcpEl: v.lcpEl, kb: Math.round(bytes / 1024), requests, wallMs: Date.now() - t0 });
    await ctx.close();
  }
  const r = { path, status: samples[0].status, lcp: median(samples.map(s => s.lcp)), cls: median(samples.map(s => s.cls)), inp: median(samples.map(s => s.inp)), kb: median(samples.map(s => s.kb)), requests: median(samples.map(s => s.requests)), lcpEl: samples[samples.length - 1].lcpEl };
  r.pass = (r.lcp ?? 0) <= 2500 && r.cls <= 0.1 && (r.inp ?? 0) <= 200;
  results.push(r);
  if (!asJson) console.log(`${r.pass ? "ok  " : "SLOW"} ${path.padEnd(28)} LCP ${String(r.lcp).padStart(5)} ms  CLS ${r.cls.toFixed(3)}  INP ${r.inp == null ? "  n/a" : String(r.inp).padStart(4) + " ms"}  ${String(r.kb).padStart(5)} KB / ${r.requests} req  [${r.lcpEl || "?"}]  HTTP ${r.status}`);
}
await browser.close();
if (asJson) console.log(JSON.stringify({ base, mobile, runs, measuredAt: new Date().toISOString(), results }, null, 1));
process.exit(results.every(r => r.pass) ? 0 : 1);

// The numbers Lighthouse scores, measured in Chromium on a phone (390×844 at 2x, CPU slowed 4x): FCP, LCP, blocking
// time (long tasks past 50ms) and CLS, for the pages that carry the art. Unsplash is answered with a stand-in.
// Not a Lighthouse score; a check on what feeds one. Run against a started build: node qa/perf.mjs http://localhost:3100
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const PAGES = [["/", false], ["/", true], ["/trackers", true], ["/feed", true], ["/trackers/nba-big-money", true]];
const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const bad = [];
for (const [path, member] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (member) await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE }]);
  await ctx.route("https://images.unsplash.com/**", r => { const u = new URL(r.request().url()); const W = +u.searchParams.get("w") || 96, H = +u.searchParams.get("h") || W;
    return r.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#456"/></svg>` }); });
  const p = await ctx.newPage();
  await (await ctx.newCDPSession(p)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await p.addInitScript(() => { window.__m = { lcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true }); });
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => ({ ...window.__m, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0 }));
  const line = `${member ? "member " : "visitor"} ${path}: FCP ${Math.round(m.fcp)}ms, LCP ${Math.round(m.lcp)}ms, blocking ${Math.round(m.tbt)}ms, CLS ${m.cls.toFixed(3)}`;
  console.log(line);
  // Lighthouse's "good" lines on mobile for LCP (2.5s) and CLS (0.1). Blocking time is shown, not judged: it runs on a 4x-slowed CPU here.
  if (m.lcp > 2500 || m.cls > 0.1) bad.push(line);
  await ctx.close();
}
await browser.close();
console.log(bad.length ? `Over the line:\n${bad.join("\n")}` : "Every page under LCP 2.5s and CLS 0.1.");
process.exit(bad.length ? 1 : 0);

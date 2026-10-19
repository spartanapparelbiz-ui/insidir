import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";
const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));
const server = createServer((req, res) => { const u = new URL(req.url, "http://x"); if (u.pathname.startsWith("/v1/")) { const me = { user: { id: 1, email: "r@example.com" }, access: { active: true } }; const b = u.pathname === "/v1/me" ? me : u.pathname === "/v1/me/intelligence/briefing" ? F.briefing : { items: [] }; setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); }, 80); return; } serveStatic(req, res).then(d => { if (!d) { res.writeHead(404); res.end(); } }); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
for (const path of process.argv.slice(2)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { window.__s = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources || []).map(s => { const n = s.node; return n ? (n.nodeName + "." + (n.className && n.className.baseVal === undefined ? String(n.className).split(" ").slice(0, 2).join(".") : "") + (n.id ? "#" + n.id : "")) + " " + JSON.stringify([Math.round(s.previousRect.y), Math.round(s.currentRect.y), Math.round(s.previousRect.height), Math.round(s.currentRect.height)]) : "?"; }) }); }).observe({ type: "layout-shift", buffered: true }); });
  const page = await ctx.newPage(); await page.goto(base + path, { waitUntil: "load" }); await page.waitForTimeout(2500);
  console.log(path, JSON.stringify(await page.evaluate(() => window.__s), null, 0).slice(0, 1500));
  await ctx.close();
}
await browser.close(); server.close();

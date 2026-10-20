/* Accessibility and touch in Chrome, on the pages people buy and use Insidir through: axe-core's WCAG 2.1 A/AA rules
   at 1440px, and at a 390px touch phone no horizontal overflow and every control at least 24x24px (WCAG 2.2 target
   size; links inside a sentence are exempt, as the standard allows). /v1 is answered from
   scripts/fixtures/intelligence-api.json and empty lists.
   Usage: CHROME_BIN=... node scripts/a11y-check.mjs   (needs playwright-core and axe-core: npm i --no-save both) */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));
const C = JSON.parse(readFileSync(new URL("./fixtures/coverage-api.json", import.meta.url), "utf8"));
const PAGES = ["/", "/pricing.html", "/platform.html", "/insidir-intelligence.html", "/signup.html", "/signin.html", "/subscribe.html", "/dashboard.html", "/intelligence.html", "/alerts.html", "/watchlist.html", "/people.html", "/entity.html?cik=1081316"];
const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active" } };
const answer = p => p === "/v1/me" ? me : p === "/v1/entities/1081316" ? C.entity : p === "/v1/entities/search" ? C.search : p === "/v1/coverage" ? C.coverage : p === "/v1/me/intelligence/briefing" ? F.briefing : p === "/v1/intelligence/mirror/managers" ? F.managers : p === "/v1/ai/status" ? F.aiStatus : { items: [] };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/v1/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(answer(u.pathname))); return; }
  serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
const failures = [];

for (const path of PAGES) {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  let page = await desk.newPage();
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.evaluate(AXE);
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
    .violations.map(v => v.id + " (" + v.impact + "): " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(", ")));
  await desk.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  page = await phone.newPage();
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const { overflow, small } = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll("a[href],button,input,select,textarea,summary,[role=tab],[role=radio]")) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true]")) continue;
      const inSentence = el.tagName === "A" && cs.display === "inline" && /\S/.test((el.parentElement?.textContent || "").replace(el.textContent, ""));
      if (!inSentence && (r.width < 24 || r.height < 24)) small.push((el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName.toLowerCase()) + " " + Math.round(r.width) + "x" + Math.round(r.height) + " “" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30) + "”");
    }
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
  });
  await phone.close();

  const ok = !violations.length && overflow <= 0 && !small.length;
  console.log((ok ? "ok   " : "FAIL ") + path + (ok ? "" : "\n     " + [...violations, overflow > 0 ? "overflows by " + overflow + "px at 390px" : "", ...small.map(s => "small target " + s)].filter(Boolean).join("\n     ")));
  if (!ok) failures.push(path);
}
await browser.close();
server.close();
if (failures.length) { console.log(failures.length + " page(s) failed"); process.exit(1); }
console.log("Accessibility: all pages passed");

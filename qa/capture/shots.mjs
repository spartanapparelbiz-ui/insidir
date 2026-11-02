// Captures the landing (visitor), the member dashboard and the Millionaires' board (visitor and member) at 390 and
// 1440 px. Needs the capture server (qa/capture/seed.ts on top of qa/e2e/serve.ts) on :3100.
// Run: node qa/capture/shots.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.CAPTURE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "qa/screenshots/millionaires";
const MEMBER = "e2e-pro-session-token-0000000000000000";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];
for (const [name, path, cookie] of [["landing", "/", null], ["dashboard", "/", MEMBER], ["board", "/board", null], ["board-member", "/board", MEMBER]]) {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
    if (cookie) await ctx.addCookies([{ name: "insidir_session", value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    page.on("console", m => { if (m.type() === "error") problems.push(`${name}@${width} console: ${m.text()}`); });
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(2_500);
    // Scroll through so every reveal and lazy image has run, then back to the top.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1_500);
    // Checks: broken images, placeholder dashes, fixture names, raw user ids.
    const bad = await page.evaluate(() => {
      const out = [];
      for (const img of document.images) if (img.complete && img.naturalWidth === 0 && getComputedStyle(img).display !== "none") out.push(`broken image ${img.getAttribute("src")}`);
      const text = document.body.innerText;
      for (const re of [/E2E/i, /fixture/i, /user_e2e/, /(^|\s)—(\s|$)/m, /undefined|NaN/]) if (re.test(text)) out.push(`text matches ${re}`);
      return out;
    });
    problems.push(...bad.map(b => `${name}@${width}: ${b}`));
    await page.screenshot({ path: `${OUT}/${name}-${width}-top.png` });
    // The whole page: a fresh viewport as tall as the page (Chromium's stitched full-page shots repeat or drop masked
    // and composited layers), at a scale that keeps the image under the 8,192 px a capture can hold.
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    const big = await browser.newContext({ viewport: { width, height: full }, deviceScaleFactor: Math.min(width < 600 ? 2 : 1, 8000 / full) });
    if (cookie) await big.addCookies([{ name: "insidir_session", value: cookie, url: BASE }]);
    const whole = await big.newPage();
    await whole.goto(BASE + path, { waitUntil: "networkidle" });
    // Let the animated list and number tickers finish (they hold real values).
    await whole.waitForTimeout(14_000);
    await whole.screenshot({ path: `${OUT}/${name}-${width}.png` });
    await big.close();
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems found");

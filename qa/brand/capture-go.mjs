/* Captures of every /go step at 1280×800 and 390×844, clicking through the funnel as a visitor (hook → categories →
 * where → size → building → aha → paywall → checkout). Reports overflow and console errors per step.
 *   node qa/brand/capture-go.mjs <baseUrl> <outDir> */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3000", out = "qa/screenshots/brand"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const report = [];
for (const s of [{ w: 1280, h: 800, mobile: false }, { w: 390, h: 844, mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  const snap = async name => {
    await p.waitForTimeout(2600);
    await p.screenshot({ path: `${out}/go-${name}-${s.w}.png`, caret: "initial" });
    const of = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    report.push(`${s.w} ${name}: step=${await p.getAttribute("[data-testid=go]", "data-step")} overflow=${of}px`);
  };
  await p.goto(`${base}/go?utm_source=capture`, { waitUntil: "load" });
  await snap("1-hook");
  await p.click("[data-testid=go-next]"); await snap("2-categories");
  await p.locator("[data-testid=go-tile]").nth(0).click(); await p.locator("[data-testid=go-tile]").nth(4).click();
  await p.waitForTimeout(300); await p.screenshot({ path: `${out}/go-2b-picked-${s.w}.png`, caret: "initial" });
  await p.click("[data-testid=go-next]"); await snap("3-where");
  await p.locator("[data-testid=go-answer]").nth(0).click(); await snap("4-size");
  await p.locator("[data-testid=go-answer]").nth(1).click();
  await p.waitForTimeout(1900); await p.screenshot({ path: `${out}/go-5-building-${s.w}.png`, caret: "initial" });
  report.push(`${s.w} 5-building captured`);
  await p.waitForSelector("[data-testid=go-aha]", { timeout: 8000 }); await snap("6-aha");
  await p.screenshot({ path: `${out}/go-6-aha-full-${s.w}.png`, fullPage: true, caret: "initial" });
  await p.click("[data-testid=go-next]"); await snap("7-paywall");
  await p.click("[data-testid=paywall-start]"); await p.waitForLoadState("load"); await snap("8-checkout");
  report.push(`${s.w} errors: ${errs.length ? errs.join(" | ") : "none"}`);
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));

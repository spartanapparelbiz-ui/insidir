/* The check page at 1280×800 and 390×844: the side question, then a tap and the verdict (full page).
 *   node qa/brand/capture-check.mjs <baseUrl> <outDir> <readId> [cookieName=value] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base, out, id, cookie] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
for (const s of [{ w: 1280, h: 800, mobile: false }, { w: 390, h: 844, mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
  await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: base }, ...(cookie ? [{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base }] : [])]);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  await p.goto(`${base}/read/${id}`, { waitUntil: "load" });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${out}/read-1-side-${s.w}.png`, caret: "initial" });
  await p.locator("[data-testid=check-card]").evaluate(n => n.scrollIntoView({ block: "start" }));
  await p.click("[data-testid=pick-no]");
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${out}/read-2-verdict-${s.w}.png`, caret: "initial" });
  await p.screenshot({ path: `${out}/read-2-verdict-full-${s.w}.png`, fullPage: true, caret: "initial" });
  console.log(`${s.w}: verdict=${await p.getAttribute("[data-testid=check-card]", "data-verdict")} evidence="${await p.locator("[data-testid=verdict-evidence]").textContent().catch(() => "")}" overflow=${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)} errors=${errs.length ? errs.join(" | ") : "none"}`);
  await ctx.close();
}
await browser.close();

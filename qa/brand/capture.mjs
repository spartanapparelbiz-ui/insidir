/* Captures in the brand language at 1280×800 and 390×844: every landing stage (scrolled into view, its entrance
 * played), a pop-up (a tap on a locked side, and the automatic one after the free Read), plus any extra paths given
 * as name|path[|cookie=value]. Reports horizontal overflow and console errors.
 *   node qa/brand/capture.mjs <baseUrl> <outDir> [name|path[|cookie] ...]   (uses the preinstalled Chromium) */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3000", out = "qa/screenshots/brand", ...extra] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = [{ w: 1280, h: 800, mobile: false }, { w: 390, h: 844, mobile: true }];
const stages = ["hero", "live", "the-read", "markets", "proof", "pricing", "faq", "final-cta"];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const shot = (p, path, full = false) => p.screenshot({ path, fullPage: full, caret: "initial" });
const report = [];

for (const s of sizes) {
  const newCtx = async (cookies = []) => {
    const c = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
    if (cookies.length) await c.addCookies(cookies.map(([name, value]) => ({ name, value, url: base })));
    return c;
  };
  const ctx = await newCtx([["insidir_pay_closed", "1"]]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.goto(base + "/", { waitUntil: "load" });
  for (const id of stages) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    if (!(await el.count())) { report.push(`${s.w} ${id}: not on the page`); continue; }
    await el.evaluate(n => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY));
    await page.waitForTimeout(id === "hero" ? 2200 : 2800);
    await shot(page, `${out}/stage-${id}-${s.w}.png`);
  }
  report.push(`${s.w} landing: overflow ${await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)}px; errors: ${errors.length ? errors.join(" | ") : "none"}`);
  // Pop-up: a tap on a locked side.
  await page.locator("[data-testid=live]").evaluate(n => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY));
  await page.waitForTimeout(1500);
  const lock = page.locator("[data-locked]").first();
  if (await lock.count()) { await lock.click(); await page.waitForTimeout(900); await shot(page, `${out}/popup-locked-${s.w}.png`); await page.keyboard.press("Escape"); }
  else report.push(`${s.w}: no locked item`);
  // Pop-up: the automatic one after the free Read (fresh session; never in the first 15 s).
  const p2 = await (await newCtx()).newPage();
  await p2.goto(base + "/", { waitUntil: "load" });
  await p2.locator("[data-testid=the-read]").evaluate(n => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY));
  await p2.waitForTimeout(17_500);
  await shot(p2, `${out}/popup-after-read-${s.w}.png`);
  report.push(`${s.w} after-read pop-up: ${(await p2.locator("[data-testid=pay-sheet]").count()) ? "shown" : "not shown"}`);
  await p2.context().close();
  for (const e of extra) {
    const [name, path, cookie] = e.split("|");
    const c = await newCtx(cookie ? [cookie.split("=")] : [["insidir_pay_closed", "1"]]);
    const p = await c.newPage();
    const errs = [];
    p.on("pageerror", x => errs.push(x.message));
    p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
    await p.goto(base + path, { waitUntil: "load" });
    await p.waitForTimeout(2600);
    await shot(p, `${out}/${name}-${s.w}.png`);
    await shot(p, `${out}/${name}-full-${s.w}.png`, true);
    report.push(`${s.w} ${path}: overflow ${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)}px; errors: ${errs.length ? errs.join(" | ") : "none"}`);
    await c.close();
  }
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));

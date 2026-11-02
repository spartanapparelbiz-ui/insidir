/* Captures of the brand pages at 390px and 1440px: the first screen in motion (3 frames), every landing scene (scrolled
 * into place so pins and reveals have run), each pop-up, and any extra paths given. Also reports horizontal overflow.
 *   node qa/brand/capture.mjs <baseUrl> <outDir> [path|name ...]
 * Writes <outDir>/<name>-<width>.png. Uses the preinstalled Chromium. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3000", out = "qa/screenshots/brand", ...extra] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = [{ w: 390, h: 844, mobile: true }, { w: 1440, h: 900, mobile: false }];
const scenes = ["first", "mark", "markets", "how", "proof", "features", "pricing", "faq", "final-cta"];

const browser = await chromium.launch(process.env.PW_CHROMIUM || !process.env.PW_BUNDLED ? { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } : {});
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
  // Scene captures without the automatic pop-ups (they get their own sessions below).
  await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: base }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  // The first screen in motion: three frames.
  for (const [i, t] of [[1, 250], [2, 900], [3, 2600]]) { await page.waitForTimeout(t - (i === 1 ? 0 : 0)); await page.screenshot({ path: `${out}/first-motion-${i}-${s.w}.png`, caret: "initial" }); }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const name of scenes) {
    const y = await page.evaluate(n => { const el = document.querySelector(`[data-testid="${n}"]`); if (!el) return null; return el.getBoundingClientRect().top + window.scrollY; }, name);
    if (y === null) { console.log(`${s.w} ${name}: missing`); continue; }
    // Scroll in steps so scrubbed timelines and pins advance; then into the scene's middle.
    const target = name === "mark" ? y + s.h * 0.45 : name === "how" ? y + s.h * 1.6 : name === "markets" && !s.mobile ? y + s.h * 0.8 : y;
    await page.evaluate(async t => { const step = (t - window.scrollY) / 12; for (let k = 0; k < 12; k++) { window.scrollBy(0, step); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, t); }, target);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/scene-${name}-${s.w}.png`, caret: "initial" });
  }
  // Pop-ups: a locked side (always opens), then the automatic one after the free Read (fresh session).
  if (await page.locator("[data-testid=pay-sheet]").count()) { await page.screenshot({ path: `${out}/popup-auto-during-scroll-${s.w}.png`, caret: "initial" }); await page.keyboard.press("Escape"); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const locked = page.locator("[data-locked]").first();
  if (await locked.count()) { await locked.click(); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/popup-locked-${s.w}.png`, caret: "initial" }); await page.keyboard.press("Escape"); }
  else console.log(`${s.w}: no locked item to tap`);
  const ctx2 = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
  const p2 = await ctx2.newPage();
  await p2.goto(base + "/", { waitUntil: "load" });
  await p2.waitForTimeout(13_000);
  await p2.screenshot({ path: `${out}/popup-after-read-${s.w}.png`, caret: "initial" });
  if (!s.mobile) {
    const p3 = await (await browser.newContext({ viewport: { width: s.w, height: s.h } })).newPage();
    await p3.goto(base + "/", { waitUntil: "load" });
    await p3.waitForTimeout(2500);
    await p3.mouse.move(700, 300); await p3.mouse.move(700, 5); await p3.mouse.move(700, -10);
    await p3.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: -5, bubbles: false })));
    await p3.waitForTimeout(900);
    await p3.screenshot({ path: `${out}/popup-exit-${s.w}.png`, caret: "initial" });
  }
  const p4 = await (await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: s.mobile, hasTouch: s.mobile })).newPage();
  await p4.goto(base + "/", { waitUntil: "load" });
  await p4.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let k = 1; k <= 20; k++) { window.scrollTo(0, (h * 0.66 * k) / 20); await new Promise(r => setTimeout(r, 60)); } });
  await p4.waitForTimeout(1200);
  await p4.screenshot({ path: `${out}/popup-bar-${s.w}.png`, caret: "initial" });
  for (const e of extra) {
    const [name, path] = e.includes("|") ? e.split("|") : [e.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root", e];
    const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-${s.w}.png`, fullPage: true, caret: "initial" });
    const of = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (of > 0) console.log(`${s.w} ${path}: horizontal overflow ${of}px`);
    await p.close();
  }
  console.log(`${s.w}: overflow ${overflow}px, errors: ${errors.length ? errors.slice(0, 5).join(" | ") : "none"}`);
}
await browser.close();

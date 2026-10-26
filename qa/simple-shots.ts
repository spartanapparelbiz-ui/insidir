/* The Simple-view check: every page at 390x844 (the first screen and the full page), plus the Simple view's own
 * moments (first visit, "Show me how", a "?" opened) and the Pro view for comparison. Saves the shots and each
 * page's visible text (for qa/readability.py) to qa/screenshots/simple. Against a running e2e server:
 *   E2E_APP_DIR=… npx tsx qa/e2e/serve.ts &   then   npx tsx qa/simple-shots.ts [out-dir] */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { APP_URL } from "./e2e/env";
import { E2E_USERS } from "./e2e/seed";

const out = process.argv[2] ?? "qa/screenshots/simple";
type Shot = { name: string; path: string; user?: keyof typeof E2E_USERS; seen?: boolean; pro?: boolean; act?: (p: Page) => Promise<void>; full?: boolean };

const firstDeal = async (p: Page): Promise<string> => (await p.locator("[data-deal]").first().getAttribute("data-deal")) ?? "";

const SHOTS: Shot[] = [
  { name: "01-landing", path: "/", full: true },
  { name: "02-terminal-first-visit", path: "/terminal", seen: false },
  { name: "03-terminal", path: "/terminal", full: true },
  { name: "04-terminal-member", path: "/terminal", user: "insidir", full: true },
  { name: "05-show-me-how", path: "/terminal", user: "insidir", act: async p => { await p.locator("a.sd-how").first().click(); await p.locator(".how__input").waitFor(); } },
  { name: "06-show-me-how-250", path: "/terminal", user: "insidir", act: async p => {
    await p.locator("a.sd-how").first().click();
    await p.locator(".how__input").fill("250");
    await p.locator(".how__steps").scrollIntoViewIfNeeded();
  } },
  { name: "07-help-tip", path: "/terminal", user: "insidir", act: async p => { await p.locator(".sd .help__q").nth(2).click(); await p.waitForTimeout(200); } },
  { name: "08-deal", path: "DEAL", user: "insidir", full: true },
  { name: "09-deal-free", path: "DEAL-FREE", full: true },
  { name: "10-terminal-pro-view", path: "/terminal", user: "insidir", pro: true, full: true },
  { name: "11-receipts", path: "/receipts", full: true },
  { name: "12-pricing", path: "/pricing", full: true },
  { name: "13-settings", path: "/settings", user: "insidir", full: true },
  { name: "14-whales", path: "/whales", user: "pro", full: true },
  { name: "15-pnl", path: "/pnl", user: "pro", full: true },
  { name: "16-terms", path: "/terms", full: true },
  { name: "17-privacy", path: "/privacy", full: true },
];

/** The text a reader sees on the first screen: the innermost visible text blocks, in order. */
const FOLD_TEXT = `(() => {
  const els = [...document.querySelectorAll("h1, h2, h3, p, li, dt, dd, label, summary, a.btn, button, figcaption, [role=tooltip]")];
  const seen = e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && getComputedStyle(e).visibility !== "hidden"; };
  return els.filter(e => seen(e) && !els.some(o => o !== e && o.contains(e) && seen(o))).map(e => e.innerText.trim()).filter(Boolean).join("\\n");
})()`;

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const texts: Record<string, { path: string; fold: string; page: string }> = {};
  const deals: Record<string, string> = {};
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const cookies = [{ name: "insidir_region", value: "us", url: APP_URL }];
    if (s.seen !== false) cookies.push({ name: "insidir_seen_how", value: "1", url: APP_URL });
    if (s.pro) cookies.push({ name: "insidir_view", value: "pro", url: APP_URL });
    if (s.user) cookies.push({ name: "insidir_session", value: E2E_USERS[s.user]!.token, url: APP_URL });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    // Signed-in users keep their view in settings: set it the way the toggle does.
    if (s.user) await p.request.post(`${APP_URL}/api/view`, { form: { view: s.pro ? "pro" : "simple", next: "/terminal" }, maxRedirects: 0 });
    let path = s.path;
    if (path === "DEAL" || path === "DEAL-FREE") {
      const key = path;
      if (!deals[key]) {
        await p.goto(APP_URL + "/terminal", { waitUntil: "load" });
        deals[key] = await firstDeal(p);
      }
      path = `/deal/${encodeURIComponent(deals[key]!)}`;
    }
    await p.goto(APP_URL + path, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    if (s.act) await s.act(p);
    await p.screenshot({ path: `${out}/${s.name}-390.png` });
    if (s.full) await p.screenshot({ path: `${out}/${s.name}-390-full.png`, fullPage: true });
    // A string, not a function: tsx's helpers don't exist in the page.
    const fold = await p.evaluate(FOLD_TEXT) as string;
    texts[s.name] = { path, fold, page: await p.locator("body").innerText() };
    console.log(`${s.name} ${path}`);
    await ctx.close();
  }
  writeFileSync(`${out}/text.json`, JSON.stringify(texts, null, 2));
  await browser.close();
}
void main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });

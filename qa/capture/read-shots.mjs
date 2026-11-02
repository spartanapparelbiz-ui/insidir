// The member's Read pages from the capture seed (qa/capture/run.sh made them), at 390 and 1440, full page.
import { chromium } from "playwright";
import pg from "pg";
const BASE = process.env.CAPTURE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "qa/screenshots/skyline";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const reads = (await db.query("select id, question from terminal.reads where user_id = 'user_e2e_pro' order by created_at")).rows; await db.end();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const r of reads.filter(x => /Chargers|Senate/.test(x.question))) for (const width of [390, 1440]) {
  const probe = await browser.newContext({ viewport: { width, height: 900 } });
  await probe.addCookies([{ name: "insidir_session", value: "e2e-pro-session-token-0000000000000000", url: BASE }]);
  const p = await probe.newPage(); await p.goto(`${BASE}/read/${r.id}`, { waitUntil: "networkidle" });
  const h = await p.evaluate(() => document.documentElement.scrollHeight); await probe.close();
  const ctx = await browser.newContext({ viewport: { width, height: h }, deviceScaleFactor: Math.min(width < 600 ? 2 : 1, 8000 / h) });
  await ctx.addCookies([{ name: "insidir_session", value: "e2e-pro-session-token-0000000000000000", url: BASE }]);
  const page = await ctx.newPage(); await page.goto(`${BASE}/read/${r.id}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const slug = /Chargers/.test(r.question) ? "read-rams" : "read-senate";
  await page.screenshot({ path: `${OUT}/${slug}-${width}.png` }); await ctx.close();
  console.log(slug, width);
}
await browser.close();

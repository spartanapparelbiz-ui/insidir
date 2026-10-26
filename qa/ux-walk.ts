/* The UX walk: every route as three people (a first-time visitor from Instagram on an iPhone, a signed-in free user,
 * a paying Pro user) at 390x844 and 1440x900, against a running e2e server (qa/e2e/serve.ts). For each visit it
 * saves a first-screen and a full-page screenshot and the evidence the scores rest on: where the page landed, the h1,
 * load time, visible primary buttons, sideways scroll, axe serious/critical violations and console errors.
 *   npx tsx qa/ux-walk.ts <out-dir>      (writes <out-dir>/*.png and <out-dir>/walk.json) */
import { mkdirSync, writeFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type BrowserContextOptions } from "playwright";
import { Pool } from "pg";
import { APP_URL, E2E_DB } from "./e2e/env";

const out = process.argv[2] ?? "qa/screenshots/ux-before";
const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_US; en; scale=3.00; 1179x2556)";
const PEOPLE = [
  { who: "visitor", token: null as string | null },
  { who: "free", token: "e2e-free-session-token-000000000000000000" },
  { who: "pro", token: "e2e-pro-session-token-0000000000000000" },
];

async function main() {
  mkdirSync(out, { recursive: true });
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  const deal = (await pool.query<{ id: string }>("select id from terminal.opportunities where data->>'title' like '%Jets%' limit 1")).rows[0]?.id ?? "x";
  await pool.end();
  const ROUTES = ["/", "/terminal", `/deal/${deal}`, "/receipts", "/pricing", "/settings", "/alerts", "/pnl", "/whales", "/terms", "/privacy", "/about", "/admin", "/this-page-does-not-exist"];
  const name = (r: string) => r === "/" ? "home" : r.startsWith("/deal/") ? "deal" : r === "/this-page-does-not-exist" ? "404" : r.slice(1);
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const rows: unknown[] = [];
  for (const p of PEOPLE) {
    for (const [w, h] of [[390, 844], [1440, 900]] as const) {
      const opts: BrowserContextOptions = { viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1,
        ...(w === 390 ? { isMobile: true, hasTouch: true, userAgent: p.who === "visitor" ? IG_UA : undefined } : {}) };
      for (const r of ROUTES) {
        // A fresh browser per page: a visitor opening a members' page signs in on the way (the mock Whop approves at
        // once), which would make every later page a signed-in visit.
        const ctx = await browser.newContext(opts);
        if (p.token) await ctx.addCookies([{ name: "insidir_session", value: p.token, url: APP_URL }]);
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
        const t0 = Date.now();
        const res = await page.goto(APP_URL + r, { waitUntil: "load" }).catch(() => null);
        const loadMs = Date.now() - t0;
        await page.waitForTimeout(1500);
        const file = `${name(r)}-${p.who}-${w}`;
        await page.screenshot({ path: `${out}/${file}.png` });
        await page.screenshot({ path: `${out}/${file}-full.png`, fullPage: true });
        const info = await page.evaluate(() => ({
          h1: document.querySelector("h1")?.textContent?.trim() ?? null,
          title: document.title,
          primaries: [...document.querySelectorAll<HTMLElement>(".btn--primary")].filter(b => b.offsetParent !== null && getComputedStyle(b).visibility !== "hidden").map(b => b.textContent?.trim()),
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          // The target a finger actually hits: a control inside a <label> or a clickable table row counts as that
          // label or row; links inside running text are exempt (WCAG 2.5.8).
          smallTargets: [...document.querySelectorAll<HTMLElement>("a, button, input, select, summary")].filter(e => {
            if (e.offsetParent === null || getComputedStyle(e).visibility === "hidden") return false;
            const hit = e.closest("label, tr[data-deal], tr[data-receipt]") as HTMLElement | null ?? e;
            if (e.tagName === "A" && e.closest("p, li, dd") && !e.classList.contains("btn")) return false;
            const b = hit.getBoundingClientRect(); return b.width > 0 && (b.height < 24 || b.width < 24);
          }).length,
        }));
        const axe = await new AxeBuilder({ page }).analyze().then(a => a.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id}(${v.nodes.length})`)).catch(() => ["axe failed"]);
        rows.push({ route: name(r), who: p.who, w, status: res?.status() ?? 0, landed: new URL(page.url()).pathname, loadMs, ...info, axe, errors: errors.slice(0, 5) });
        await ctx.close();
      }
    }
  }
  await browser.close();
  writeFileSync(`${out}/walk.json`, JSON.stringify(rows, null, 2));
  console.log(`${rows.length} visits → ${out}`);
}
void main().catch(e => { console.error(e); process.exit(1); });

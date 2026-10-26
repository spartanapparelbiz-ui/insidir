/* Quality gates against a running server (default http://localhost:3100, the e2e build with seeded data):
 *   - Lighthouse, mobile preset: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on every audited page
 *   - axe-core at 390×844 and 1440×900: zero serious or critical violations
 * Writes qa/reports/lighthouse-<page>.json, qa/reports/audit.json and prints a pass/fail table. Exit 1 on any failure.
 * Usage: AUDIT_URL=http://localhost:3100 AUDIT_COOKIE="insidir_session=…" npx tsx qa/audit.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const BASE = (process.env.AUDIT_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PRO_COOKIE = process.env.AUDIT_COOKIE ?? "";
const PAGES: Array<{ name: string; path: string; signedIn: boolean }> = [
  { name: "landing", path: "/", signedIn: false },
  { name: "terminal-free", path: "/terminal", signedIn: false },
  { name: "pricing", path: "/pricing", signedIn: false },
  { name: "receipts", path: "/receipts", signedIn: false },
  { name: "terms", path: "/terms", signedIn: false },
  { name: "privacy", path: "/privacy", signedIn: false },
  ...(PRO_COOKIE ? [
    { name: "terminal-pro", path: "/terminal", signedIn: true },
    { name: "deal-pro", path: process.env.AUDIT_DEAL_PATH ?? "/terminal", signedIn: true },
    { name: "settings", path: "/settings", signedIn: true },
    { name: "whales", path: "/whales", signedIn: true },
    { name: "pnl", path: "/pnl", signedIn: true },
  ] : []),
];
const GATES = { performance: 0.9, accessibility: 0.95, seo: 0.95 } as const;

interface Row { page: string; performance: number; accessibility: number; seo: number; lcpMs: number; cls: number; axe390: string[]; axe1440: string[]; pass: boolean }

async function main(): Promise<void> {
  mkdirSync("qa/reports", { recursive: true });
  const port = 9222 + Math.floor(Math.random() * 500);
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  const rows: Row[] = [];
  for (const p of PAGES) {
    const url = BASE + p.path;
    const lh = await lighthouse(url, {
      port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo"],
      extraHeaders: p.signedIn ? { Cookie: PRO_COOKIE } : undefined,
    }, undefined);
    if (!lh) throw new Error(`lighthouse returned nothing for ${url}`);
    writeFileSync(`qa/reports/lighthouse-${p.name}.json`, typeof lh.report === "string" ? lh.report : JSON.stringify(lh.report));
    const c = lh.lhr.categories;
    const axe: Record<number, string[]> = {};
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      if (p.signedIn) {
        const [name, ...rest] = PRO_COOKIE.split("=");
        await ctx.addCookies([{ name: name!, value: rest.join("="), url: BASE }]);
      }
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
      axe[width] = res.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id} (${v.nodes.length})`);
      await ctx.close();
    }
    const row: Row = {
      page: p.name,
      performance: c.performance?.score ?? 0, accessibility: c.accessibility?.score ?? 0, seo: c.seo?.score ?? 0,
      lcpMs: Math.round(Number(lh.lhr.audits["largest-contentful-paint"]?.numericValue ?? 0)),
      cls: Number(lh.lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0),
      axe390: axe[390] ?? [], axe1440: axe[1440] ?? [], pass: false,
    };
    row.pass = row.performance >= GATES.performance && row.accessibility >= GATES.accessibility && row.seo >= GATES.seo && !row.axe390.length && !row.axe1440.length;
    rows.push(row);
    console.log(`${row.pass ? "PASS" : "FAIL"}  ${p.name.padEnd(14)} perf ${Math.round(row.performance * 100)}  a11y ${Math.round(row.accessibility * 100)}  seo ${Math.round(row.seo * 100)}  LCP ${row.lcpMs}ms  CLS ${row.cls.toFixed(3)}  axe ${[...row.axe390, ...row.axe1440].join(", ") || "0 serious"}`);
  }
  await browser.close();
  writeFileSync("qa/reports/audit.json", JSON.stringify({ base: BASE, at: new Date().toISOString(), gates: GATES, rows }, null, 2));
  process.exit(rows.every(r => r.pass) ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

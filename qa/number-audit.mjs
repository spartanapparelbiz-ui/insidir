// Number and legibility audit of the built site, as a visitor and as a member, at 1440 and 390. Fails on:
//  - money not in the one format ($9.4K, $412K, $1.2M): any visible "$123,456";
//  - a figure (money, percent, points, a multiple) drawn without tabular digits;
//  - text drawn in (nearly) the colour behind it: a button or label that can't be seen.
// Run against a started build (qa/e2e/run.sh's app with the e2e database): node qa/number-audit.mjs http://localhost:3100
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const PAGES = ["/", "/trackers", "/trackers/biggest-bets", "/trackers/nfl-big-money", "/trackers/ceo-buys", "/feed", "/feed?tab=markets", "/feed?tab=stocks",
  "/results", "/splits", "/splits/scorecard", "/pricing", "/sports", "/markets", "/stocks", "/market/0xe2emarket1", "/top", "/following", "/check",
  "/insider-trading/EXDV", "/alerts", "/settings", "/data", "/how-it-works"];

const browser = await chromium.launch(process.env.PW_CHROMIUM || existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" } : {});
const hits = new Set();
for (const who of ["visitor", "member"]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
      const found = await page.evaluate(() => {
        const out = [];
        const rgb = s => (s.match(/[\d.]+/g) ?? []).map(Number);
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = el => {
          for (let e = el; e; e = e.parentElement) {
            const c = getComputedStyle(e);
            if (c.backgroundImage !== "none") return null; // over a picture or gradient: not judged here
            const v = rgb(c.backgroundColor);
            if (v.length === 3 || (v[3] ?? 0) > 0.9) return v.slice(0, 3);
          }
          return [255, 255, 255];
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent.trim();
          const el = n.parentElement;
          if (!text || !el || seen.has(el)) continue;
          seen.add(el);
          const c = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || c.visibility === "hidden" || Number(c.opacity) === 0 || el.closest("[aria-hidden='true'], .sr-only, .visually-hidden, svg, script, style, noscript, details:not([open]) > :not(summary)")) continue;
          const where = `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
          if (/\$\d{1,3}(,\d{3})+(?!\d)/.test(text)) out.push(`long money "${text.match(/\$\d{1,3}(,\d{3})+/)[0]}" in ${where}`);
          if (/^[+−-]?(\$[\d.,]+[KMB]?|[\d.,]+%|[\d.]+ pts|[\d.]+×)$/.test(text) && !/tabular-nums/.test(c.fontVariantNumeric)) out.push(`proportional figure "${text}" in ${where}`);
          const bg = bgOf(el), fg = rgb(c.color);
          if (bg && fg.length >= 3 && (fg[3] ?? 1) > 0.5) {
            const [a, b] = [lum(fg.slice(0, 3)), lum(bg)].sort((x, y) => y - x);
            if ((a + 0.05) / (b + 0.05) < 1.6) out.push(`invisible text "${text.slice(0, 40)}" in ${where}`);
          }
        }
        return out;
      });
      for (const f of found) hits.add(`${who} ${w} ${path}: ${f}`);
    }
    await ctx.close();
  }
}
await browser.close();
mkdirSync("qa/screenshots/copy", { recursive: true });
const list = [...hits];
writeFileSync("qa/screenshots/copy/number-audit.txt", list.length ? list.join("\n") + "\n" : "No number or legibility problems found.\n");
console.log(list.length ? list.join("\n") : "No number or legibility problems found.");
process.exit(list.length ? 1 : 0);

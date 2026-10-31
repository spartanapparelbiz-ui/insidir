/* A contact sheet of every route (scripts/routes.ts), visitor and member, at 1440×900 and 390×844: the first screen of
 * each, labelled, on one image per width (qa/screenshots/contact-1440.png, contact-390.png). Unsplash is answered
 * with a flat stand-in so the sheet works offline.
 *   npx tsx qa/contact-sheet.ts http://localhost:3100 <member session token> */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { entityRoutes, MEMBER, PUBLIC } from "../scripts/routes";

const BASE = process.argv[2] ?? "http://localhost:3100";
const TOKEN = process.argv[3] ?? "e2e-insidir-session-token-00000000000000";

void (async () => {
  const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
  const entities = await entityRoutes(BASE, { cookie: `insidir_session=${TOKEN}` });
  const shots: Array<{ who: string; path: string; w: number; png: string }> = [];
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    for (const who of ["visitor", "member"] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: TOKEN, url: BASE }]);
      await ctx.route("https://images.unsplash.com/**", r => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#9aa0a8"/></svg>' }));
      const page = await ctx.newPage();
      for (const path of [...PUBLIC, ...(who === "member" ? MEMBER : []), ...entities]) {
        await page.goto(BASE + path, { waitUntil: "load" }).catch(() => null);
        await page.waitForTimeout(800);
        shots.push({ who, path, w, png: (await page.screenshot()).toString("base64") });
      }
      await ctx.close();
    }
  }
  mkdirSync("qa/screenshots", { recursive: true });
  for (const w of [1440, 390]) {
    const list = shots.filter(s => s.w === w);
    const cols = w === 1440 ? 4 : 8, tw = w === 1440 ? 360 : 180;
    const html = `<body style="margin:0;padding:16px;background:#f7f7f8;font:12px system-ui;color:#0b0b12"><div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:16px">${
      list.map(s => `<figure style="margin:0"><img src="data:image/png;base64,${s.png}" style="width:${tw}px;display:block;border:1px solid #eaeaee"><figcaption style="margin-top:4px">${s.who} · ${s.path}</figcaption></figure>`).join("")}</div></body>`;
    const ctx = await browser.newContext({ viewport: { width: cols * (tw + 16) + 16, height: 800 } });
    const p = await ctx.newPage();
    writeFileSync(`/tmp/contact-${w}.html`, html);
    await p.goto(`file:///tmp/contact-${w}.html`);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `qa/screenshots/contact-${w}.png`, fullPage: true });
    await ctx.close();
    console.log(`qa/screenshots/contact-${w}.png: ${list.length} screens`);
  }
  await browser.close();
})();

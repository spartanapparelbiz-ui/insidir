/* Renders the 1200×630 share images for the research stories (web/assets/img/stories/*.png) in Chrome, with the
 * site's own Geist and wordmark, so a shared link unfurls with the story's headline, its key figures and its source.
 *
 *   npm install --no-save playwright-core@1.58.0
 *   CHROME_BIN=/path/to/chrome node scripts/build-share-cards.mjs
 *
 * Text and figures come from src/stories.mjs; nothing on a card is invented. Run again after editing a story. */
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STORIES } from "../src/stories.mjs";
import { escapeHtml as esc, day } from "../src/public-pages.mjs";
import { WORDMARK } from "../src/site-ui.mjs";

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROME_BIN || "/opt/pw-browsers/chromium";
// Inlined: a page set with setContent (about:blank) may not load file:// fonts.
const font = "data:font/woff2;base64," + readFileSync(fileURLToPath(new URL("../web/assets/fonts/Geist-Variable.woff2", import.meta.url))).toString("base64");
const outDir = fileURLToPath(new URL("../web/assets/img/stories/", import.meta.url));

const page = ({ label, title, sub, figures, foot }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:G;src:url(${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0c0c0b;color:#f0eee8;font-family:G,sans-serif;padding:56px 64px;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}
.top{display:flex;justify-content:space-between;align-items:center;font-size:20px;color:#8f8d87}
.logo{height:30px;color:#f0eee8}.logo svg{height:30px;width:auto;display:block}
h1{margin-top:48px;font-size:${title.length > 70 ? 48 : 56}px;line-height:1.1;font-weight:600;letter-spacing:-.025em;max-width:1000px}
h1 span{color:#8f8d87}
.figs{margin-top:auto;display:flex;gap:12px}
.fig{flex:1;padding:20px 24px;border-radius:16px;background:#161615}
.fig b{display:block;font-size:17px;color:#8f8d87;font-weight:400}
.fig i{display:block;margin-top:8px;font-style:normal;font-size:32px;font-weight:600;letter-spacing:-.02em}
.foot{margin-top:24px;display:flex;justify-content:space-between;font-size:18px;color:#8f8d87}
</style></head><body>
<div class="top"><span class="logo">${WORDMARK}</span><span>${esc(label)}</span></div>
<h1>${title}${sub ? ` <span>${esc(sub)}</span>` : ""}</h1>
${figures?.length ? `<div class="figs">${figures.map(f => `<div class="fig"><b>${esc(f.label)}</b><i>${esc(f.value)}</i></div>`).join("")}</div>` : ""}
<div class="foot">${foot.map(x => `<span>${esc(x)}</span>`).join("")}</div>
</body></html>`;

const split = t => { const m = /^(.+?[.?!])\s+(.+)$/.exec(t); return m ? [m[1], m[2]] : [t, ""]; };
const cards = [
  ...STORIES.map(s => { const [a, b] = split(s.title); return { name: s.slug, label: `${s.kind} · ${s.form} · ${s.tickers[0].replace("-", ".")}`, title: esc(a), sub: b,
    figures: (s.cardFigures || [0, 1, 2]).map(i => s.figures[i]), foot: [`Source: ${s.form}, filed ${day(s.filed)} · sec.gov`, "insidir.com/stories"] }; }),
  { name: "stories", label: "Research stories", title: "Public filings,", sub: "explained.", figures: STORIES.map(s => ({ label: s.tickers[0].replace("-", ".") + " · " + s.form, value: s.figures[0].value })),
    foot: ["Free to read · the original SEC document on every page", "insidir.com/stories"] },
  { name: "creator-kit", label: "Creator kit", title: "Short videos,", sub: "built on public filings.", figures: [{ label: "Concepts", value: "6" }, { label: "Script length", value: "15–30 s" }, { label: "Footage", value: "Real product" }],
    foot: ["Hooks, scripts, SEC sources and disclosures", "insidir.com/creator-kit"] }
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const c of cards) {
  await tab.setContent(page(c), { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: outDir + c.name + ".png", type: "png" });
  console.log("wrote  web/assets/img/stories/" + c.name + ".png");
}
await browser.close();

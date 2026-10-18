/* Renders the 1200×630 share images for the research stories (web/assets/img/stories/*.png) in Chrome, with the
 * site's own JetBrains Mono, so a shared link unfurls with the story's headline, its key figures and its source.
 *
 *   npm install --no-save playwright-core@1.58.0
 *   CHROME_BIN=/path/to/chrome node scripts/build-share-cards.mjs
 *
 * Text and figures come from src/stories.mjs; nothing on a card is invented. Run again after editing a story. */
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STORIES } from "../src/stories.mjs";
import { escapeHtml as esc, day } from "../src/public-pages.mjs";

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROME_BIN || "/opt/pw-browsers/chromium";
const font = pathToFileURL(fileURLToPath(new URL("../web/assets/fonts/JetBrainsMono-normal-latin.woff2", import.meta.url))).href;
const outDir = fileURLToPath(new URL("../web/assets/img/stories/", import.meta.url));

const page = ({ label, title, sub, figures, foot }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:M;src:url(${font}) format("woff2");font-weight:100 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0c0c0b;color:#e9e4da;font-family:M,monospace;padding:56px 64px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#8c8983;font-weight:500}
.logo{font-size:30px;font-weight:800;letter-spacing:-.04em;text-transform:none;color:#e9e4da}
h1{margin-top:44px;font-size:${title.length > 70 ? 46 : 54}px;line-height:1.1;font-weight:800;letter-spacing:-.035em;max-width:1000px}
h1 span{color:#8c8983}
.figs{margin-top:auto;display:flex;border:1px solid #2f2f2c;background:#151513}
.fig{flex:1;padding:18px 22px;border-right:1px solid #2f2f2c}.fig:last-child{border-right:0}
.fig b{display:block;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8c8983;font-weight:500}
.fig i{display:block;margin-top:8px;font-style:normal;font-size:30px;font-weight:700;letter-spacing:-.02em}
.foot{margin-top:22px;display:flex;justify-content:space-between;font-size:15px;color:#9e9b94}
.dots{position:absolute;right:64px;top:330px;width:240px;height:60px;background-image:radial-gradient(#41403d 1.6px,transparent 1.7px);background-size:12px 12px;opacity:.9}
</style></head><body><div class="dots"></div>
<div class="top"><span class="logo">insidir.</span><span>${esc(label)}</span></div>
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

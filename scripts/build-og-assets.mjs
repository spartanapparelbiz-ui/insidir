/* Renders the brand images that the server composes share images from, in Chrome with the site's own fonts:
 *   web/assets/og/wordmark.png      the "insidir." wordmark, JetBrains Mono ExtraBold, off-white on transparent (2x)
 *   web/assets/og/insidir-og.png    the default 1200×630 share image: black, the wordmark, one line of copy
 * The per-stock share images (/og/<TICKER>.png) are drawn by src/ticker-page.mjs with sharp and the TTFs in src/fonts.
 *   npm install --no-save playwright-core@1.58.0 && CHROME_BIN=/path/to/chrome node scripts/build-og-assets.mjs */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const { chromium } = await import("playwright-core");
// Inlined as data URLs: a page set from a string cannot load file:// fonts.
const font = f => "data:font/woff2;base64," + readFileSync(fileURLToPath(new URL("../web/assets/fonts/" + f, import.meta.url))).toString("base64");
const out = f => fileURLToPath(new URL("../web/assets/og/" + f, import.meta.url));
const css = `@font-face{font-family:JB;src:url(${font("JetBrainsMono-normal-latin.woff2")}) format("woff2");font-weight:100 800}
@font-face{font-family:G;src:url(${font("Geist-Variable.woff2")}) format("woff2");font-weight:100 900}*{margin:0;box-sizing:border-box}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const shot = async (html, w, h, path, transparent = false) => {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: transparent ? 2 : 1 })).newPage();
  await page.setContent(html); await page.evaluate(() => document.fonts.ready);
  // The wordmark is cut to its own box; the share image is the whole viewport.
  if (transparent) await page.locator("b").screenshot({ path, omitBackground: true });
  else await page.screenshot({ path, clip: { x: 0, y: 0, width: w, height: h } });
};
await shot(`<style>${css}body{background:transparent}b{display:inline-block;font:800 64px/80px JB;letter-spacing:-.02em;color:#f0eee8;padding:0 2px}</style><b>insidir.</b>`, 600, 120, out("wordmark.png"), true);
await shot(`<style>${css}body{width:1200px;height:630px;background:#0c0c0b;color:#f0eee8;padding:80px;display:flex;flex-direction:column;justify-content:space-between}
h1{font:600 72px/78px G;letter-spacing:-.035em;max-width:900px;text-wrap:balance}p{font:400 26px/36px G;color:#8f8d87}b{font:800 40px/1 JB;letter-spacing:-.02em}
.row{display:flex;justify-content:space-between;align-items:flex-end}</style>
<h1>See when CEOs buy and sell their own stock.</h1><div class="row"><b>insidir.</b><p>Every SEC Form 4, in plain English.</p></div>`, 1200, 630, out("insidir-og.png"));
await browser.close();
console.log("wrote web/assets/og/wordmark.png and insidir-og.png");

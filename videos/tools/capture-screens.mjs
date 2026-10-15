// Photographs the real Insidir website (../web) for use as product footage.
// The pages are served read-only from this checkout; nothing is mocked: the shots below are
// sections that render without account data, so every word on screen is the site's own.
// Usage: node tools/capture-screens.mjs [--only id,id]
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { startSiteServer } from "./lib/site-server.mjs";
import { chromiumExecutable } from "./lib/env.mjs";

const outDir = fileURLToPath(new URL("../public/screens/", import.meta.url));

// kind "viewport": the first screen of a page, header included.
// kind "element":  one section (or the union of several selectors), cropped with `pad` CSS px of page
//                  background around it, header hidden.
// kind "clip":     the page from the top down to the bottom of `until` plus `pad` (for camera pans),
//                  header included. Use it to stop a pan before content that must not be shown.
export const SHOTS = [
  { id: "landing-hero-mobile", page: "index.html", device: "mobile", kind: "viewport" },
  { id: "landing-scroll-mobile", page: "index.html", device: "mobile", kind: "clip", until: ".lp-tools .lp-tools__grid > li:nth-child(3)", pad: 24 },
  { id: "platform-hero-mobile", page: "platform.html", device: "mobile", kind: "viewport" },
  // Stops at the Form 4 panel: the "Familiar faces" block below it names real executives and shows
  // company logos, which an advertisement must not borrow.
  { id: "people-hero-mobile", page: "people.html", device: "mobile", kind: "clip", until: "figure.v10-anatomy", pad: 40 },
  { id: "landing-hero-desktop", page: "index.html", device: "desktop", kind: "viewport" },
  { id: "platform-hero", page: "platform.html", device: "desktop", kind: "element", selector: "section.mk-hero", pad: 0 },
  { id: "report-anatomy", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"1-reports\"] figure.mk-anatomy", pad: 32 },
  { id: "report-legend", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"1-reports\"] ol.mk-legend", pad: 32 },
  { id: "calculated-values", page: "platform.html", device: "desktop", kind: "element", selector: ["[id=\"1-reports\"] .mk-sub:has(+ .mk-split--even)", "[id=\"1-reports\"] .mk-split--even"], pad: 40 },
  { id: "filing-library", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"2-filings\"] .mk-shell", pad: 24 },
  { id: "kept-apart", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"3-insiders\"] .mk-split:not(.mk-split--even)", pad: 32 },
  { id: "two-dates", page: "platform.html", device: "desktop", kind: "element", selector: ["[id=\"3-insiders\"] .mk-sub:has(+ ol.mk-dates)", "[id=\"3-insiders\"] ol.mk-dates"], pad: 40 },
  { id: "watch-alerts", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"4-alerts\"] .mk-shell", pad: 24 },
  { id: "journal", page: "platform.html", device: "desktop", kind: "element", selector: "[id=\"5-journal\"] .mk-shell", pad: 24 },
  { id: "form4-panel", page: "people.html", device: "desktop", kind: "element", selector: "figure.v10-anatomy", pad: 48 },
  { id: "tools-grid", page: "index.html", device: "desktop", kind: "element", selector: ".lp-tools .v9-width", pad: 24 },
  { id: "sources-table", page: "index.html", device: "desktop", kind: "element", selector: ".lp-data .v9-width", pad: 24 },
  { id: "how-it-works", page: "index.html", device: "desktop", kind: "element", selector: ".lp-flow .v9-width", pad: 24 },
  { id: "four-rules", page: "index.html", device: "desktop", kind: "element", selector: ".lp-why .v9-width", pad: 24 },
  { id: "plan", page: "index.html", device: "desktop", kind: "element", selector: ".lp-plan .v9-width", pad: 24 },
  { id: "data-freshness", page: "data.html", device: "desktop", kind: "element", selector: "[id=\"2-freshness\"] .mk-shell", pad: 24 }
];

const DEVICES = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 }
};

const HIDE_HEADER = `header,.v9-nav,.v6-nav,.app-header,.v3-static__nav{visibility:hidden!important}`;

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // The halftone canvases draw on the next animation frames once the web font has landed.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 400)))));
}

/** Page-coordinate bounding box around every element matched by the selectors. */
async function unionBox(page, selectors) {
  await page.waitForSelector(selectors[0], { state: "attached", timeout: 10000 });
  return page.evaluate(list => {
    const rects = list.flatMap(sel => [...document.querySelectorAll(sel)]).map(el => el.getBoundingClientRect());
    if (!rects.length) throw new Error("Nothing matches " + list.join(", "));
    const x0 = Math.min(...rects.map(r => r.left)), y0 = Math.min(...rects.map(r => r.top));
    const x1 = Math.max(...rects.map(r => r.right)), y1 = Math.max(...rects.map(r => r.bottom));
    return { x: x0 + window.scrollX, y: y0 + window.scrollY, width: x1 - x0, height: y1 - y0 };
  }, selectors);
}

async function capture(browser, site, shot) {
  const context = await browser.newContext({ ...DEVICES[shot.device], reducedMotion: "reduce", colorScheme: "dark" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${site.origin}/${shot.page}`, { waitUntil: "networkidle" });
  await settle(page);
  const path = `${outDir}${shot.id}.png`;
  if (shot.kind === "viewport") {
    await page.screenshot({ path });
  } else if (shot.kind === "clip") {
    const width = DEVICES[shot.device].viewport.width;
    const box = await unionBox(page, [shot.until]);
    await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width, height: Math.ceil(box.y + box.height + (shot.pad ?? 24)) } });
  } else {
    await page.addStyleTag({ content: HIDE_HEADER });
    const selectors = [].concat(shot.selector);
    const handle = await page.waitForSelector(selectors[0], { state: "visible", timeout: 10000 });
    await handle.scrollIntoViewIfNeeded();
    await settle(page);
    const box = await unionBox(page, selectors);
    const pad = shot.pad ?? 24;
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
    const clip = { x, y, width: Math.min(pageWidth - x, box.width + pad * 2), height: box.height + pad * 2 };
    await page.screenshot({ path, fullPage: true, clip });
  }
  await context.close();
  const meta = await sharp(path).metadata();
  return { id: shot.id, page: shot.page, device: shot.device, width: meta.width, height: meta.height, errors };
}

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
  await mkdir(outDir, { recursive: true });
  const site = await startSiteServer();
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  const manifest = {};
  try {
    for (const shot of SHOTS.filter(s => !only || only.includes(s.id))) {
      const result = await capture(browser, site, shot);
      manifest[shot.id] = { file: `screens/${shot.id}.png`, width: result.width, height: result.height, source: `web/${shot.page}`, device: shot.device };
      console.log(`${shot.id.padEnd(24)} ${String(result.width).padStart(5)}x${result.height}  ${shot.page}${result.errors.length ? "  page errors: " + result.errors.join("; ") : ""}`);
    }
  } finally {
    await browser.close();
    await site.close();
  }
  const manifestPath = `${outDir}manifest.json`;
  let previous = {};
  if (only) { try { previous = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8")); } catch { /* first run */ } }
  await writeFile(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

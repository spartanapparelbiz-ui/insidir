/* Every image on the main pages, at 2x: none failed to load (naturalWidth 0) and none is softer than 1.5× its display
 * width (a 300px card needs at least 450 real pixels). Pages are scrolled to the bottom first so lazy images load. The
 * full-bleed stages use the pre-generated 1920/2880/3840 files (components/brand/BrandPicture.tsx), never above 3840. */
import { expect, test } from "@playwright/test";

test.use({ deviceScaleFactor: 2 });

const PAGES = ["/", "/markets", "/board", "/election", "/wallets", "/pricing", "/results", "/login", "/faq", "/market/0xe2etennis100"];

test("no broken or soft images, and nothing above 3840", async ({ page }) => {
  test.setTimeout(180_000);
  const bad: string[] = [];
  const big: string[] = [];
  page.on("request", r => { const m = /[?&]w=(\d+)/.exec(r.url()); if (r.url().includes("/_next/image") && m && Number(m[1]) > 3840) big.push(r.url()); });
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    for (let y = 0; y < 30; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(60); }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    // naturalWidth of a srcset image is divided by its density, so each file's real width is read on its own.
    const imgs = await page.evaluate(() => Promise.all([...document.images].filter(i => i.getBoundingClientRect().width > 0 && getComputedStyle(i).visibility !== "hidden").map(async i => {
      const src = i.currentSrc || i.src;
      let natural = i.naturalWidth;
      if (natural > 0 && src) { const im = new Image(); im.src = src; await im.decode().catch(() => undefined); natural = im.naturalWidth || natural; }
      return { src, natural, broken: i.complete && i.naturalWidth === 0, shown: Math.round(i.getBoundingClientRect().width), svg: /\.svg(\?|$)|image\/svg/.test(src) };
    })));
    for (const i of imgs) {
      if (i.broken) bad.push(`${path}: broken ${i.src}`);
      // The stages are cropped to cover (object-fit), so they're measured against their box's width.
      else if (!i.svg && i.natural > 0 && i.natural < 1.5 * i.shown) bad.push(`${path}: ${i.natural}px for ${i.shown}px (${i.src.slice(0, 120)})`);
    }
  }
  expect(bad).toEqual([]);
  expect(big).toEqual([]);
});

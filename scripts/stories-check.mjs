/* Browser check for the research stories, the creator kit and the creator program, in Chrome at phone and desktop
 * widths: every page renders on the night paper in the site's typeface without horizontal overflow, nothing on them
 * is green or orange, copy-link and the video-description copy put the right text on the clipboard, a valid ?ref=
 * survives into shared links and sign-up links while an invalid one is dropped, the share-sheet button only shows
 * where the device has one, the copy-script buttons copy the script, and the link builder only builds links for
 * codes with the approved shape.
 *
 *   CHROME_BIN=/path/to/chrome node scripts/stories-check.mjs        (SHOTS=dir also saves full-page screenshots)  */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { serveStatic } from "../src/web.mjs";
import { STORIES, CREATOR_CONCEPTS, storyPath } from "../src/stories.mjs";

const server = createServer((req, res) => serveStatic(req, res).then(found => { if (!found) { res.writeHead(404); res.end("not found"); } }));
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const shots = process.env.SHOTS || "";
if (shots) await mkdir(shots, { recursive: true });
const PAGES = ["/stories.html", ...STORIES.map(storyPath), "/creator-kit.html", "/creators.html", "/partner-insider.html", "/"];
const ok = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const phone = viewport.width < 600;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    await context.addInitScript(() => addEventListener("load", () => window.InsidirMotion?.revealAll?.()));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
        // Green: G well above R and B. Orange: R high, G middle, B low. Market colours are not used on these pages.
        const tinted = [...document.querySelectorAll("main *, header *")].filter(e => e.getClientRects().length).flatMap(e => {
          const cs = getComputedStyle(e);
          return [cs.color, cs.backgroundColor, cs.borderTopColor].map(rgb).filter(([r, g, b, a = 1]) => a > 0.05 && ((g > r + 40 && g > b + 20) || (r > 180 && g > 80 && g < 170 && b < 90)))
            .map(c => e.tagName + "." + e.className + " " + c.join(","));
        });
        return { overflow: document.documentElement.scrollWidth - innerWidth, bg: getComputedStyle(document.body).backgroundColor,
          font: getComputedStyle(document.querySelector("h1")).fontFamily, h1: document.querySelectorAll("h1").length, tinted,
          nativeVisible: [...document.querySelectorAll("[data-share-native]")].some(b => !b.hidden) };
      });
      assert.ok(r.overflow <= 1, `${viewport.width}px ${path}: horizontal overflow ${r.overflow}px`);
      assert.equal(r.bg, "rgb(12, 12, 11)", path + " sits on the night paper");
      // The landing page is on the rebuilt design system (ui.css): Geist is its one typeface. The stories keep V13.
      assert.match(r.font, path === "/" ? /^"?Geist"?,/ : /JetBrains Mono/, path);
      assert.equal(r.h1, 1, path + " has one h1");
      if (path !== "/") assert.deepEqual(r.tinted, [], `${viewport.width}px ${path}: green or orange on screen`);
      assert.equal(r.nativeVisible, false, "headless Chrome has no share sheet, so the button stays hidden");
      if (shots) await page.screenshot({ path: `${shots}/${viewport.width}${path.replace(/\//g, "_").replace(/\.html$/, "") || "_home"}.png`, fullPage: true });
    }
    ok.push(`${viewport.width}px: ${PAGES.length} pages render without overflow, on the palette`);

    // Copy link and the video description, with and without a creator's code.
    const story = STORIES[0], canonical = "https://insidir.com" + storyPath(story);
    for (const [query, expected] of [["", canonical], ["?ref=Good_Creator", canonical + "?ref=good_creator"], ["?ref=x!", canonical], ["?ref=ab", canonical]]) {
      await page.goto(base + storyPath(story) + query, { waitUntil: "load" });
      await page.click(".st-share [data-share-copy] >> nth=0");
      await page.waitForFunction(() => document.querySelector("[data-share-status]").textContent.length > 0);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected, "copy link with " + (query || "no code"));
      assert.equal(await page.textContent("[data-share-status]"), "Link copied.");
      const signup = await page.getAttribute(".pp-upsell a[href*='signup']", "href");
      assert.equal(signup, expected.includes("ref=") ? "https://insidir.com/signup.html?ref=good_creator".replace("https://insidir.com", new URL(base).origin) : "/signup.html", "sign-up link with " + (query || "no code"));
    }
    await page.goto(base + storyPath(story), { waitUntil: "load" });
    await page.click(".st-share [data-share-description] >> nth=0");
    await page.waitForFunction(() => document.querySelector("[data-share-status]").textContent.length > 0);
    const description = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(description.startsWith(story.title) && description.includes(canonical) && description.includes(story.sources[0].url) && /Not investment advice/.test(description), description);
    ok.push(`${viewport.width}px: copy link, ?ref= kept when valid and dropped when not, sign-up links carry it, video description copied`);

    // A browser that refuses the clipboard gets the text selected in a field instead of a dead button.
    const blocked = await browser.newContext({ viewport });
    const bpage = await blocked.newPage();
    await bpage.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); document.execCommand = () => false; });
    await bpage.goto(base + storyPath(story), { waitUntil: "load" });
    await bpage.click(".st-share [data-share-copy] >> nth=0");
    await bpage.waitForSelector(".st-share [data-share-fallback]:not([hidden])");
    assert.equal(await bpage.inputValue(".st-share [data-share-fallback] >> nth=0"), canonical);
    assert.match(await bpage.textContent("[data-share-status]"), /blocked/);
    await blocked.close();
    ok.push(`${viewport.width}px: a refused clipboard falls back to a selected field with the link`);

    // The creator kit: copy a script; the link builder.
    await page.goto(base + "/creator-kit.html?page=" + encodeURIComponent(storyPath(STORIES[1])), { waitUntil: "load" });
    const c = CREATOR_CONCEPTS[0];
    await page.click(`[data-copy-target="script-${c.id}"]`);
    await page.waitForFunction(id => document.querySelector(`#concept-1 [data-share-status]`).textContent === "Script copied.", c.id);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), c.script);
    assert.equal(await page.inputValue("[data-lb-page]"), storyPath(STORIES[1]), "a story's 'Open the creator kit' link preselects that story");
    assert.equal(await page.isDisabled("[data-lb-copy]"), true);
    await page.fill("[data-lb-code]", "Bad Code!");
    assert.equal(await page.getAttribute("[data-lb-code]", "aria-invalid"), "true");
    assert.equal(await page.isDisabled("[data-lb-copy]"), true, "no link for a code without the approved shape");
    await page.fill("[data-lb-code]", "@Creator-1");
    assert.equal(await page.textContent("[data-lb-output]"), "https://insidir.com" + storyPath(STORIES[1]) + "?ref=creator-1");
    await page.click("[data-lb-copy]");
    await page.waitForFunction(() => /copied/.test(document.querySelector("[data-link-builder] [data-share-status]").textContent));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://insidir.com" + storyPath(STORIES[1]) + "?ref=creator-1");
    await page.selectOption("[data-lb-page]", "/signup.html");
    assert.equal(await page.textContent("[data-lb-output]"), "https://insidir.com/signup.html?ref=creator-1", "the same link the program issues");
    ok.push(`${viewport.width}px: creator kit copies scripts; link builder refuses bad codes and builds approved-shape links`);

    // A creator link to a story is remembered for sign-up by the existing referral.js.
    await page.goto(base + storyPath(STORIES[2]) + "?ref=creator-1", { waitUntil: "load" });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("insidir:creator-ref") || "null"));
    assert.equal(stored?.code, "creator-1");
    ok.push(`${viewport.width}px: a ?ref= on a story page is stored by referral.js for registration`);
    assert.deepEqual(errors, [], "no script errors");
    await context.close();
  }
  for (const line of ok) console.log("ok  " + line);
  console.log("Stories check passed.");
} finally {
  await browser.close();
  server.close();
}

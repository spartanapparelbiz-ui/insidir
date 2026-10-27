/* Screenshots of pages at 390x844 and 1440x900 (first screen and full page), for design reviews.
 *   node qa/shots.mjs <base-url> <out-dir> "name|/path[|session-token]" ...
 * Waits for "load" plus 2.5s: the page keeps a live stream open, so the network never goes idle. */
import { chromium } from "playwright";
const [base, out, ...pages] = process.argv.slice(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [w, h] of [[390, 844], [1440, 900]]) {
  for (const spec of pages) {
    const [name, path, cookie] = spec.split("|");
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1 });
    if (cookie) await ctx.addCookies([{ name: "insidir_session", value: cookie, url: base }]);
    const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/${name}-${w}-fold.png` });
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    await ctx.close();
  }
}
await b.close();

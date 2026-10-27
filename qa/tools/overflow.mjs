/* Lists elements that stick out past a 390px screen (not inside a scroll box): node qa/tools/overflow.mjs <url> */
import { chromium } from "playwright";
const b = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(process.argv[2], { waitUntil: "load" }); await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const b = el.getBoundingClientRect();
    if (b.right > 392 && b.width > 0) {
      let a = el.parentElement, clipped = false;
      while (a) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX)) { clipped = true; break; } a = a.parentElement; }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(b.right)}`);
    }
  }
  return [document.documentElement.scrollWidth, out.slice(0, 15)];
});
console.log(JSON.stringify(r, null, 1)); await b.close();

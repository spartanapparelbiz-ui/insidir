/* Design audit at 320, 390, 768, 1280 and 1440: for each page (visitor, and member where given), reports
 *  - sideways scroll;
 *  - tap targets under 44×44 on touch widths (≤768): visible links, buttons, inputs, summaries; inline links inside
 *    running text are listed apart (WCAG 2.5.8's inline exception);
 *  - placeholder text on screen: a lone dash, undefined, NaN, null, "$0", "E2E fixture";
 *  - console errors and hydration warnings;
 *  - CLS from the first paint through a scroll to the bottom and back (layout-shift entries without recent input);
 *  - the font sizes, radii and focus outline colour in use (to check one scale).
 *   node qa/brand/audit.mjs <baseUrl> <memberToken> <out.json> [path ...]   (uses the preinstalled Chromium) */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [base, token, out, ...pathsIn] = process.argv.slice(2);
const paths = pathsIn.length ? pathsIn : ["/", "/go", "/board", "/markets", "/library", "/login", "/pricing", "/status", "/terms", "/privacy"];
const WIDTHS = [320, 390, 768, 1280, 1440];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const report = [];

for (const raw of paths) {
  const member = raw.startsWith("@");
  const path = member ? raw.slice(1) : raw;
  for (const w of WIDTHS) {
    const touch = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: touch ? 844 : 900 }, isMobile: touch && w < 768, hasTouch: touch, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: base }, { name: "insidir_region", value: "non_us", url: base },
      ...(member ? [{ name: "insidir_session", value: token, url: base, httpOnly: true }] : [])]);
    await ctx.addInitScript(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: e.value, at: Math.round(e.startTime), src: (e.sources || []).map(s => s.node ? (s.node.className || s.node.nodeName).toString().slice(0, 60) : "?") }); } })
        .observe({ type: "layout-shift", buffered: true });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push("pageerror: " + e.message.slice(0, 200)));
    page.on("console", m => { const t = m.text(); if (m.type() === "error" || /hydrat/i.test(t)) errors.push(m.type() + ": " + t.slice(0, 200)); });
    let status = 0;
    try { status = (await page.goto(base + path, { waitUntil: "load", timeout: 45_000 }))?.status() ?? 0; } catch (e) { errors.push("goto: " + e.message.slice(0, 120)); }
    await page.waitForTimeout(800);
    // Scroll through so every stage enters, then back to the top.
    await page.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); });
    await page.waitForTimeout(2800);
    const facts = await page.evaluate(({ touch }) => {
      const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && !el.closest("[aria-hidden=true],[hidden],[inert]"); };
      const sig = el => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28)}"`;
      const small = [], inline = [];
      if (touch) for (const el of document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]")) {
        if (!vis(el)) continue;
        let r = el.getBoundingClientRect();
        // The hit area can be larger than the box: a row's stretched link (::after over the whole row) or an
        // invisible 44px ::after around a small control.
        const after = getComputedStyle(el, "::after");
        if (after.content !== "none" && after.position === "absolute") {
          if (el.classList.contains("b-row__link") && el.closest(".b-row")) r = el.closest(".b-row").getBoundingClientRect();
          else r = { width: Math.max(r.width, parseFloat(after.width) || 0), height: Math.max(r.height, parseFloat(after.height) || 0) };
        }
        if (r.width >= 44 && r.height >= 44) continue;
        // A label wrapping the input counts as its target.
        const lab = el.closest("label"); if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= 44 && lr.height >= 44) continue; }
        const inText = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|SMALL|DD)$/.test(el.parentElement.tagName) && (el.parentElement.textContent || "").trim().length > (el.textContent || "").trim().length + 8;
        (inText ? inline : small).push(`${sig(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      const bad = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        const t = n.textContent.trim(); const el = n.parentElement;
        if (!t || !el || !vis(el) || el.closest("script,style,noscript")) continue;
        if (/^[—–-]$/.test(t) || /\bundefined\b|\bNaN\b|\bnull\b|E2E fixture|\[object/.test(t) || /(^|[^\d.,])\$0(?![\d.,])/.test(t)) bad.push(`${sig(el)} → "${t.slice(0, 60)}"`);
      }
      const sizes = {}, radii = {};
      for (const el of document.querySelectorAll(".b-root *")) {
        if (!vis(el)) continue;
        const s = getComputedStyle(el);
        if ([...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) sizes[s.fontSize] = (sizes[s.fontSize] || 0) + 1;
        if (s.borderTopLeftRadius !== "0px") radii[s.borderTopLeftRadius] = (radii[s.borderTopLeftRadius] || 0) + 1;
      }
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, small, inline, bad, sizes, radii, cls: window.__cls, shifts: window.__shifts.slice(0, 6), brand: !!document.querySelector(".b-root") };
    }, { touch });
    report.push({ path: (member ? "@" : "") + path, w, status, errors: [...new Set(errors)], ...facts });
    const flag = [status >= 400 && `HTTP ${status}`, facts.overflow > 0 && `overflow ${facts.overflow}px`, facts.small.length && `${facts.small.length} small targets`, facts.bad.length && `${facts.bad.length} placeholders`, errors.length && `${errors.length} errors`, facts.cls >= 0.05 && `CLS ${facts.cls.toFixed(3)}`].filter(Boolean);
    console.log(`${(member ? "@" : "") + path} @${w}: ${flag.length ? flag.join(", ") : "ok"} (CLS ${facts.cls.toFixed(3)})`);
    await ctx.close();
  }
}
writeFileSync(out, JSON.stringify(report, null, 1));
await browser.close();

/* Insidir site motion check: every page moves like the landing wordmark.

   Opens every page in headless Chromium (the /v1 API mocked) and verifies, with a real pointer:
     - the motion layer and the dot engine are running: atoms are registered and every page has at
       least one mounted dot field (the footer strip at minimum), drawn into a canvas;
     - an atom near the pointer is pushed away from it (by at most ~8px), the atom under the pointer
       settles back and holds still, and once the pointer leaves every atom returns exactly home;
     - a click on empty space sends one ring through every dot field on the page;
     - with prefers-reduced-motion nothing moves: no offsets, no rings;
     - phones (390px, touch) load every page without overflow or script errors.

   Usage: node scripts/motion-check.mjs [--pages index,dashboard,...]
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const ALL = [
  ["index", "/"], ["signin", "/signin.html"], ["signup", "/signup.html"], ["dashboard", "/dashboard.html"],
  ["research", "/research.html?ticker=AAPL"], ["explore", "/explore.html"], ["filings", "/filings.html"], ["filing", "/filing.html?accession=000032019326000001"],
  ["watchlist", "/watchlist.html"], ["portfolio", "/portfolio.html"], ["alerts", "/alerts.html"], ["people", "/people.html"],
  ["account", "/account.html"], ["billing", "/billing.html"], ["company", "/company.html?ticker=AAPL"], ["company-picker", "/company.html"],
  ["pricing", "/pricing.html"], ["company-info", "/company-info.html"], ["terms", "/terms.html"], ["privacy", "/privacy.html"], ["404", "/no-such-page"],
  ["platform", "/platform.html"], ["why-insidir", "/why-insidir.html"], ["data", "/data.html"], ["subscribe", "/subscribe.html"], ["account-deleted", "/account-deleted.html"]
];
const wanted = opt("pages", "").split(",").filter(Boolean);
const PAGES = wanted.length ? ALL.filter(([k]) => wanted.includes(k)) : ALL;
const passed = [], failed = [];
const check = (ok, label, detail) => { (ok ? passed : failed).push(ok ? label : label + (detail === undefined ? "" : " — " + JSON.stringify(detail))); return ok; };

const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true } };
const mock = url => url.pathname === "/v1/me" ? me : url.pathname === "/v1/billing/status" ? { billingEnabled: true, plan: "pro", subscriptionStatus: "active" } : url.pathname === "/v1/status" ? { engine: "online", filings: 0 } : { items: [] };

const server = createServer((req, res) => { serveStatic(req, res).then(f => { if (!f) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function open(path, { width = 1440, reducedMotion = "no-preference", touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion, isMobile: touch, hasTouch: touch });
  await context.route("**/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mock(new URL(r.request().url()))) }));
  await context.route(/wikimedia/, r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="320"/>' }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.goto(base + path, { waitUntil: "domcontentloaded" }));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
  return { context, page, errors };
}
const offsets = page => page.evaluate(() => [...document.querySelectorAll("[data-hf-atom]")].map(e => [parseFloat(e.style.getPropertyValue("--hf-dx")) || 0, parseFloat(e.style.getPropertyValue("--hf-dy")) || 0]));

try {
  for (const [key, path] of PAGES) {
    /* ---------- fine pointer, motion allowed ---------- */
    {
      const { context, page, errors } = await open(path);
      const s = await page.evaluate(() => ({
        motion: !!window.InsidirMotion, physics: window.InsidirMotion && window.InsidirHalftone && window.InsidirMotion.PHYSICS === window.InsidirHalftone.PHYSICS,
        atoms: window.InsidirMotion ? window.InsidirMotion.count : 0,
        fields: [...document.querySelectorAll("[data-halftone-field]")].map(f => { const c = f.querySelector("canvas"); return { mounted: !!f.__halftone, w: c ? c.width : 0, h: c ? c.height : 0 }; }),
        footer: !!document.querySelector("footer.v13-footer--plain > .hwf-field")
      }));
      check(s.motion && s.physics, key + ": the motion layer runs on the wordmark's physics", s);
      check(s.atoms >= 5, key + ": atoms registered (" + s.atoms + ")", s.atoms);
      check(s.fields.length >= 1 && s.fields.every(f => f.mounted && f.w > 0 && f.h > 0), key + ": " + s.fields.length + " dot field(s) mounted and drawn", s.fields);

      // An atom on screen, away from the edges, with room around it.
      const pick = () => page.evaluate(() => {
        const ok = r => r.width > 6 && r.height > 6 && r.left > 40 && r.right < innerWidth - 40;
        const all = [...document.querySelectorAll("[data-hf-atom]")].map(e => ({ e, r: e.getBoundingClientRect() })).filter(o => ok(o.r));
        const o = all.find(o => o.r.top > 90 && o.r.bottom < innerHeight - 40);
        if (!o) {
          // None in view below the sticky bar: bring the first one further down the page into view.
          const next = all.find(o => o.r.top + scrollY > 90);
          if (next) window.scrollTo(0, Math.max(0, next.r.top + scrollY - innerHeight / 2));
          return null;
        }
        o.e.setAttribute("data-probe", "");
        return { left: o.r.left, top: o.r.top, w: o.r.width, h: o.r.height };
      });
      let target = await pick();
      if (!target) { await page.waitForTimeout(400); target = await pick(); }
      if (check(!!target, key + ": an atom is on screen to test")) {
        const read = () => page.evaluate(() => { const e = document.querySelector("[data-probe]"); return [parseFloat(e.style.getPropertyValue("--hf-dx")) || 0, parseFloat(e.style.getPropertyValue("--hf-dy")) || 0]; });
        // Pointer 24px to the left of the atom: it is pushed right, away from the pointer, by a few px.
        await page.mouse.move(target.left - 24, target.top + target.h / 2, { steps: 4 });
        await page.waitForTimeout(450);
        const pushed = await read();
        check(pushed[0] > 0.5 && Math.hypot(...pushed) <= 8.5, key + ": an atom near the pointer parts away from it, by a few px", pushed);
        // Pointer on the atom: it settles back and holds still under the pointer.
        await page.mouse.move(target.left + target.w / 2, target.top + target.h / 2, { steps: 2 });
        await page.waitForTimeout(1500);
        const held = await read();
        check(Math.hypot(...held) < 0.4, key + ": the atom under the pointer holds still", held);
        // Pointer gone: every atom returns exactly home.
        await page.mouse.move(2, 2);
        await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true })));
        await page.waitForTimeout(1600);
        const all = await offsets(page);
        check(all.every(([x, y]) => x === 0 && y === 0), key + ": every atom returns home", all.filter(([x, y]) => x || y).slice(0, 4));
      }

      // A click on empty space sends one ring through every dot field.
      const rung = await page.evaluate(() => {
        const roots = [...document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]")].filter(r => r.__halftone);
        window.__rings = 0;
        for (const r of roots) { const orig = r.__halftone.ring; r.__halftone.ring = (...a) => { window.__rings++; return orig.apply(r.__halftone, a); }; }
        for (let y = 140; y < innerHeight - 20; y += 23) for (let x = 30; x < innerWidth - 30; x += 37) {
          const e = document.elementFromPoint(x, y);
          if (e && !e.closest("a,button,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],canvas,[data-halftone-field],[data-halftone-hero]")) return { x, y, roots: roots.length };
        }
        return { roots: roots.length };
      });
      if (rung.x !== undefined) {
        await page.mouse.click(rung.x, rung.y);
        await page.waitForTimeout(60);
        const n = await page.evaluate(() => window.__rings);
        check(n === rung.roots, key + ": a click on empty space ripples through all " + rung.roots + " dot field(s)", { rings: n, fields: rung.roots });
      }
      check(errors.length === 0, key + ": no script errors", errors);
      await context.close();
    }
    /* ---------- reduced motion: still ---------- */
    {
      const { context, page, errors } = await open(path, { reducedMotion: "reduce" });
      for (let i = 0; i < 12; i++) await page.mouse.move(60 + i * 100, 300 + (i % 3) * 120, { steps: 2 });
      await page.mouse.click(30, 500).catch(() => {});
      await page.waitForTimeout(200);
      const all = await offsets(page);
      check(all.every(([x, y]) => x === 0 && y === 0), key + ": reduced motion keeps every atom still", all.filter(([x, y]) => x || y).length);
      check(errors.length === 0, key + ": no script errors with reduced motion", errors);
      await context.close();
    }
    /* ---------- phone ---------- */
    {
      const { context, page, errors } = await open(path, { width: 390, touch: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, fields: [...document.querySelectorAll("[data-halftone-field]")].filter(f => f.__halftone).length }));
      check(m.overflow <= 1 && m.fields >= 1, key + ": 390px touch: no overflow, " + m.fields + " field(s)", m);
      check(errors.length === 0, key + ": 390px: no script errors", errors);
      await context.close();
    }
  }
} finally { await browser.close(); server.close(); }

for (const p of passed) console.log("  ok   " + p);
for (const f of failed) console.log("  FAIL " + f);
console.log(`\nMotion check: ${passed.length} passed, ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;

/* Insidir site motion check: every page moves like the landing wordmark, and nothing on it is orange.

   Opens every page in headless Chromium (the /v1 API mocked) and verifies, with a real pointer and wheel:
     - the motion layer and the dot engine are running: atoms are registered and every page has at
       least one mounted dot field (the footer strip at minimum), drawn into a canvas;
     - scrolling leaves the atoms a little behind: during eight 120px wheel steps at least one atom
       trails by 1px or more (when the page can scroll), none by more than 14px, and within 2s of the
       last wheel every atom is home again (no --hf-dx/--hf-dy/--hf-s left);
     - every offset the motion layer writes (--hf-dx, --hf-dy, --hf-s, recorded by a MutationObserver
       on style attributes for the whole visit: scroll, pointer and click) is a finite number;
     - landing only: the hero wordmark scatters as it scrolls away (its canvas differs at scrollY 300)
       and gathers again when the page is scrolled back to the top;
     - an atom near the pointer is pushed away from it (by at most ~10px), the atom under the pointer
       settles back and holds still, and once the pointer leaves every atom returns exactly home;
     - a click on empty space sends one ring through every dot field on the page;
     - while the pointer rests on an atom and just after the click, a screenshot has no orange pixels
       (clusters of r > 110, r − g > 35, g − b > 15, r − b > 70, real photographs in <img> ignored);
     - scroll reveal, in a fresh visit WITHOUT revealAll: every block marked data-hf-reveal, each child of
       a data-hf-reveal-group, and each footer column that is below the fold when v13-motion.js first
       sees it waits hidden (.hf-pending, opacity 0); scrolling down a viewport at a time, every block
       above 90% of the viewport is shown (no .hf-pending, opacity 1) within 1.5s of reaching it, the
       blocks rise in on the spring (.hf-revealing), and at the bottom nothing is pending or mid-reveal;
       a page with no such block below the fold reports "n/a" (at 1440px and on a 390px phone);
     - with prefers-reduced-motion nothing moves (no offsets, no rings) and nothing ever waits to be
       revealed (InsidirMotion.pending is 0 and no .hf-pending, at load and after scrolling);
     - phones (390px, touch) load every page without overflow or script errors.

   Usage: node scripts/motion-check.mjs [--pages index,dashboard,...] [--no-phone-reveal]
            [--inject-css "<css>"] [--inject-js "<js>"]
   --inject-css adds rules to the insidir-v13 layer of every page and --inject-js runs a script at
   document start in every visit; both exist only to prove that the check fails when motion breaks.
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { inflateSync } from "node:zlib";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const flag = name => args.includes("--" + name);
const INJECT_CSS = opt("inject-css", ""), INJECT_JS = opt("inject-js", "");
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

/* ---------- init scripts ---------- */
// The pointer checks measure atoms in place, so every scroll-reveal block is shown at once (and any transition of
// its own that a block let go from .hf-pending starts from the hidden state is finished).
const REVEAL_ALL = () => {
  const go = () => {
    const M = window.InsidirMotion;
    if (!M) return;
    const held = new Set(document.querySelectorAll(".hf-pending,.hf-revealing"));
    M.revealAll();
    if (held.size) for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect && held.has(a.effect.target)) { try { a.finish(); } catch {} }
  };
  addEventListener("DOMContentLoaded", () => setTimeout(go, 0));
  addEventListener("load", go);
};
// Every --hf-dx / --hf-dy / --hf-s the motion layer writes, from each style mutation's old value and the value
// after it: any that is not a finite number, and (while `track` is on) the largest offset written.
const WATCH_WRITES = () => {
  const w = window.__hfWrites = { n: 0, bad: [], peak: 0, peakAt: "", track: false };
  const rx = /--hf-(dx|dy|s)\s*:\s*([^;]*)/g;
  const name = el => (el.tagName || "").toLowerCase() + (el.classList && el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : "");
  const read = (style, el) => {
    if (!style || style.indexOf("--hf-") < 0) return;
    let dx = 0, dy = 0;
    for (const m of style.matchAll(rx)) {
      const raw = m[2].trim(), v = parseFloat(raw);
      w.n++;
      if (!Number.isFinite(v) || /nan|infinity/i.test(raw)) { if (w.bad.length < 6) w.bad.push(name(el) + " --hf-" + m[1] + ": " + raw); continue; }
      if (m[1] === "dx") dx = v; else if (m[1] === "dy") dy = v;
    }
    const d = Math.hypot(dx, dy);
    if (w.track && d > w.peak) { w.peak = d; w.peakAt = name(el); }
  };
  new MutationObserver(ms => { for (const m of ms) { read(m.oldValue, m.target); read(m.target.getAttribute && m.target.getAttribute("style"), m.target); } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true });
};
/* What v13-motion.js should hold back: the same rule it applies (a block marked for reveal that is rendered and
   below 92% of the viewport the first time it is scanned, and that the page can scroll into view), applied right
   after each of its scans: once it has started (InsidirMotion is assigned after start() ran or was scheduled), and
   after each of its 120ms refreshes, which follow the same mutations. Blocks seen on screen first and pushed down
   later by content loading above them are rightly never hidden, so they are not expected to wait. */
const REVEAL_ORACLE = () => {
  const SEL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";
  const seen = new WeakSet(), expect = window.__hfExpect = new Set(), rose = window.__hfRose = new Set();
  const scan = () => {
    const limit = innerHeight * 0.92, maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (const el of document.querySelectorAll(SEL)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest("[hidden]") || el.matches(".hf-no-reveal,[data-hf-still]")) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (r.top < limit) continue;
      if (r.top + scrollY - maxY > innerHeight * 0.88) continue;
      expect.add(el);
    }
  };
  const after = () => {
    scan();
    let t = 0;
    new MutationObserver(ms => {
      for (const m of ms) if (m.type === "attributes" && m.attributeName === "class" && m.target.classList.contains("hf-revealing")) rose.add(m.target);
      if (ms.some(m => m.type === "childList" || m.attributeName === "hidden")) { clearTimeout(t); t = setTimeout(scan, 120); }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  };
  let motion;
  Object.defineProperty(window, "InsidirMotion", { configurable: true, enumerable: true, get: () => motion,
    set: v => { motion = v; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", after); else after(); } });
};

async function open(path, { width = 1440, reducedMotion = "no-preference", touch = false, reveal = true, oracle = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  if (reveal) await context.addInitScript(REVEAL_ALL);
  if (oracle) await context.addInitScript(REVEAL_ORACLE);
  await context.addInitScript(WATCH_WRITES);
  // Self-test hooks: prove the check fails when motion breaks (see the header).
  if (INJECT_JS) await context.addInitScript({ content: INJECT_JS });
  if (INJECT_CSS) await context.addInitScript(css => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "@layer insidir-v13{" + css + "}"; document.head.appendChild(s); }), INJECT_CSS);
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
const scrollTo = (page, y) => page.evaluate(y => window.scrollTo({ top: y, left: 0, behavior: "instant" }), y);
const pointerGone = page => page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true })));
// Atoms that are not home: any offset or scale still written.
const awayAtoms = page => page.evaluate(() => [...document.querySelectorAll("[data-hf-atom]")]
  .filter(e => ["--hf-dx", "--hf-dy", "--hf-s"].some(p => e.style.getPropertyValue(p).trim()))
  .map(e => e.tagName.toLowerCase() + "." + [...e.classList].slice(0, 2).join(".") + " " + ["--hf-dx", "--hf-dy", "--hf-s"].map(p => e.style.getPropertyValue(p).trim() || "-").join(" ")));
async function untilHome(page, ms) {
  const t0 = Date.now();
  let left = await awayAtoms(page);
  while (left.length && Date.now() - t0 < ms) { await page.waitForTimeout(100); left = await awayAtoms(page); }
  return left;
}

/* ---------- orange pixels (same rule as scripts/v13-palette-audit.mjs) ---------- */
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !ch) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * ch, out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0, b = y ? out[up + x] : 0, c = x >= ch && y ? out[up + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  return { width, height, ch, data: out };
}
function orangeClusters({ width, height, ch, data }, minPx = 3) {
  const C = 16, cw = Math.ceil(width / C), cells = new Map();
  if (ch < 3) return [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
    if (!(r > 110 && r - g > 35 && g - b > 15 && r - b > 70)) continue;
    const k = Math.floor(y / C) * cw + Math.floor(x / C);
    let c = cells.get(k);
    if (!c) cells.set(k, c = { n: 0, pts: [] });
    c.n++; if (c.n % 7 === 1 && c.pts.length < 3) c.pts.push([x, y]);
  }
  const out = [], done = new Set();
  for (const start of cells.keys()) {
    if (done.has(start)) continue;
    done.add(start);
    const stack = [start], g = { n: 0, pts: [] };
    while (stack.length) {
      const k = stack.pop(), c = cells.get(k), cx = k % cw, cy = Math.floor(k / cw);
      g.n += c.n; if (g.pts.length < 8) g.pts.push(...c.pts.slice(0, 8 - g.pts.length));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, nk = ny * cw + nx;
        if (nx >= 0 && nx < cw && ny >= 0 && cells.has(nk) && !done.has(nk)) { done.add(nk); stack.push(nk); }
      }
    }
    if (g.n >= minPx) out.push(g);
  }
  return out;
}
// Orange clusters on a viewport screenshot, each named by the element under it; photographs (<img>) are ignored.
async function orangeShot(page) {
  const clusters = orangeClusters(decodePNG(await page.screenshot({ type: "png" })));
  if (!clusters.length) return [];
  const names = await page.evaluate(list => {
    const MEDIA = "img,picture,video";
    const path = el => { const bits = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : n.classList.length ? "." + [...n.classList].slice(0, 2).join(".") : "")); return bits.join(" > "); };
    const onMedia = (el, x, y) => !!el && (!!el.closest(MEDIA) || [...el.querySelectorAll(MEDIA)].some(m => { const r = m.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; }));
    return list.map(pts => { let named = null, media = 0; for (const [x, y] of pts) { const el = document.elementFromPoint(x + 0.5, y + 0.5); if (onMedia(el, x + 0.5, y + 0.5)) media++; else if (!named) named = el; } return media === pts.length ? null : (named ? path(named) : "(no element)"); });
  }, clusters.map(c => c.pts));
  return clusters.map((c, i) => names[i] && c.n + "px under " + names[i]).filter(Boolean);
}

/* ---------- scroll: atoms trail it and come home ---------- */
async function scrollTrail(page, key) {
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate(() => { const w = window.__hfWrites; w.peak = 0; w.peakAt = ""; w.track = true; });
  let sampled = 0;
  const bad = [];
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(70);
    const s = await page.evaluate(() => {
      let max = 0;
      const bad = [];
      for (const e of document.querySelectorAll("[data-hf-atom]")) {
        for (const p of ["--hf-dx", "--hf-dy", "--hf-s"]) { const v = e.style.getPropertyValue(p).trim(); if (v && !Number.isFinite(parseFloat(v))) bad.push(e.tagName.toLowerCase() + " " + p + ": " + v); }
        max = Math.max(max, Math.hypot(parseFloat(e.style.getPropertyValue("--hf-dx")) || 0, parseFloat(e.style.getPropertyValue("--hf-dy")) || 0));
      }
      return { max, bad };
    });
    sampled = Math.max(sampled, s.max);
    bad.push(...s.bad);
  }
  const scrolled = await page.evaluate(() => scrollY);
  await pointerGone(page);
  const left = await untilHome(page, 2000);
  const w = await page.evaluate(() => { const w = window.__hfWrites; w.track = false; return { peak: w.peak, peakAt: w.peakAt }; });
  const peak = Math.max(w.peak, sampled);
  if (room > 40) check(peak >= 1 && scrolled > 0, `${key}: atoms trail a wheel scroll (${peak.toFixed(1)}px at most, page scrolled ${scrolled}px)`, { peak, at: w.peakAt, scrolled });
  else check(true, `${key}: atoms trail a wheel scroll: n/a (the page cannot scroll)`);
  check(peak <= 14, `${key}: no atom trails a scroll by more than 14px`, { peak, at: w.peakAt });
  check(bad.length === 0, `${key}: every atom offset sampled during the scroll is a finite number`, bad.slice(0, 4));
  check(left.length === 0, `${key}: every atom is home within 2s of the last wheel`, left.slice(0, 4));
}

/* ---------- landing: the wordmark scatters as it scrolls away, and gathers again ---------- */
async function heroScatter(page, key) {
  const snap = name => page.evaluate(name => {
    const c = document.querySelector("[data-halftone-hero] canvas");
    if (!c || !c.width || !c.height) return 0;
    (window.__hfSnaps = window.__hfSnaps || {})[name] = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    return c.width * c.height;
  }, name);
  // Share of the canvas's pixels that changed between two snapshots.
  const diff = (a, b) => page.evaluate(([a, b]) => {
    const A = window.__hfSnaps[a], B = window.__hfSnaps[b];
    if (!A || !B || A.length !== B.length) return -1;
    let n = 0;
    for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) + Math.abs(A[i + 3] - B[i + 3]) > 60) n++;
    return n / (A.length / 4);
  }, [a, b]);
  // Scroll there, let the dots' spring settle (~1.2s), then keep looking until two frames 250ms apart agree.
  const settle = async (y, name) => {
    await scrollTo(page, y); await page.waitForTimeout(1200);
    const t0 = Date.now();
    let px = await snap(name);
    while (px && Date.now() - t0 < 3000) { await page.waitForTimeout(250); await snap(name + "~"); if (await diff(name, name + "~") < 0.0002) break; px = await snap(name); }
    return px;
  };
  const px = await settle(0, "top");
  if (!check(px > 0, key + ": the hero wordmark canvas can be read")) return;
  await settle(300, "down");
  await settle(0, "back");
  const moved = await diff("top", "down"), back = await diff("top", "back");
  check(moved > 0.002, `${key}: the wordmark scatters as the page scrolls away (${(moved * 100).toFixed(2)}% of the canvas changed at scrollY 300)`, { moved });
  check(back >= 0 && back <= Math.max(0.0005, moved * 0.1), `${key}: the wordmark gathers again when the page is back at the top (${(back * 100).toFixed(3)}% still differs)`, { moved, back });
}

/* ---------- scroll reveal ---------- */
const REVEAL_SEL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";
async function revealCheck(page, label) {
  const at = await page.evaluate(SEL => {
    const path = el => { const bits = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : n.classList.length ? "." + [...n.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") : "")); return bits.join(" > "); };
    const vh = innerHeight, expected = [...(window.__hfExpect || [])].filter(el => el.isConnected);
    const below = expected.filter(el => el.getBoundingClientRect().top >= vh * 0.93);
    return {
      tagged: document.querySelectorAll("[data-hf-reveal],[data-hf-reveal-group]>*").length, blocks: document.querySelectorAll(SEL).length,
      expected: expected.length, below: below.length,
      notPending: below.filter(el => !el.classList.contains("hf-pending")).map(path).slice(0, 4),
      visible: [...document.querySelectorAll(".hf-pending")].filter(el => parseFloat(getComputedStyle(el).opacity) >= 0.05).map(el => path(el) + " opacity " + getComputedStyle(el).opacity).slice(0, 4),
      pending: window.InsidirMotion ? window.InsidirMotion.pending : -1
    };
  }, REVEAL_SEL);
  if (!at.expected) { check(true, `${label}: scroll reveal n/a (no block below the fold; ${at.tagged} tagged, ${at.blocks} with the footer)`); return; }
  check(at.notPending.length === 0 && at.visible.length === 0 && at.pending >= at.below, `${label}: ${at.below} block(s) below the fold wait hidden (.hf-pending, opacity 0; ${at.tagged} tagged)`, at);
  // Down the page a viewport at a time: whatever is above 90% of the viewport is shown within 1.5s of reaching it.
  const late = [];
  let steps = 0, y = 0;
  for (;;) {
    const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
    y = Math.min(Math.max(0, h - vh), y + Math.round(vh * 0.85));
    steps++;
    await scrollTo(page, y);
    const t0 = Date.now();
    let left;
    await page.waitForTimeout(150);
    for (;;) {
      left = await page.evaluate(SEL => [...document.querySelectorAll(SEL)].filter(el => {
        if (el.closest("[hidden]")) return false;
        const r = el.getBoundingClientRect();
        if ((r.width === 0 && r.height === 0) || r.top >= innerHeight * 0.9) return false;
        const op = parseFloat(getComputedStyle(el).opacity);
        return el.classList.contains("hf-pending") || (el.classList.contains("hf-revealing") && op < 0.99);
      }).map(el => el.tagName.toLowerCase() + "." + [...el.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") + (el.classList.contains("hf-pending") ? " still pending" : " opacity " + getComputedStyle(el).opacity)), REVEAL_SEL);
      if (!left.length || Date.now() - t0 > 1500) break;
      await page.waitForTimeout(100);
    }
    if (left.length) late.push(...left.map(l => l + " at scrollY " + y));
    if (y >= h - vh || steps > 80) break;
  }
  check(late.length === 0, `${label}: every block is shown within 1.5s of scrolling to it (${steps} step(s))`, late.slice(0, 4));
  // At the bottom nothing is left waiting or mid-reveal.
  const t1 = Date.now();
  let end;
  for (;;) {
    end = await page.evaluate(() => ({ pending: window.InsidirMotion ? window.InsidirMotion.pending : -1, left: [...document.querySelectorAll(".hf-pending,.hf-revealing")].map(el => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 3).join(".")).slice(0, 4) }));
    if ((end.pending === 0 && !end.left.length) || Date.now() - t1 > 2500) break;
    await page.waitForTimeout(150);
  }
  check(end.pending === 0 && end.left.length === 0, `${label}: at the bottom nothing is pending or mid-reveal`, end);
  const rose = await page.evaluate(() => window.__hfRose ? window.__hfRose.size : 0);
  check(rose >= 1, `${label}: blocks rise in on the spring (${rose} revealed)`, rose);
}

try {
  for (const [key, path] of PAGES) {
    /* ---------- fine pointer, motion allowed, every block revealed at once ---------- */
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

      // Scrolling: atoms trail the page and spring home (pointer never moved yet).
      await scrollTrail(page, key);
      if (key === "index") await heroScatter(page, key);
      await scrollTo(page, 0);
      await page.waitForTimeout(200);
      await untilHome(page, 2000);

      // An atom on screen, away from the edges, with room around it.
      const pick = () => page.evaluate(() => {
        const ok = r => r.width > 6 && r.height > 6 && r.left > 40 && r.right < innerWidth - 40;
        const all = [...document.querySelectorAll("[data-hf-atom]")].map(e => ({ e, r: e.getBoundingClientRect() })).filter(o => ok(o.r));
        const o = all.find(o => o.r.top > 90 && o.r.bottom < innerHeight - 40);
        if (!o) {
          // None in view below the sticky bar: bring the first one further down the page into view.
          const next = all.find(o => o.r.top + scrollY > 90);
          if (next) window.scrollTo({ top: Math.max(0, next.r.top + scrollY - innerHeight / 2), behavior: "instant" });
          return null;
        }
        o.e.setAttribute("data-probe", "");
        return { left: o.r.left, top: o.r.top, w: o.r.width, h: o.r.height };
      });
      let target = await pick();
      if (!target) { await untilHome(page, 2000); target = await pick(); }
      if (check(!!target, key + ": an atom is on screen to test")) {
        const read = () => page.evaluate(() => { const e = document.querySelector("[data-probe]"); return [parseFloat(e.style.getPropertyValue("--hf-dx")) || 0, parseFloat(e.style.getPropertyValue("--hf-dy")) || 0]; });
        // Pointer 24px to the left of the atom: it is pushed right, away from the pointer, by a few px.
        await page.mouse.move(target.left - 24, target.top + target.h / 2, { steps: 4 });
        await page.waitForTimeout(450);
        const pushed = await read();
        check(pushed[0] > 0.5 && Math.hypot(...pushed) <= 10.5, key + ": an atom near the pointer parts away from it, by a few px", pushed);
        // Pointer on the atom: it settles back and holds still under the pointer.
        await page.mouse.move(target.left + target.w / 2, target.top + target.h / 2, { steps: 2 });
        await page.waitForTimeout(1500);
        const held = await read();
        check(Math.hypot(...held) < 0.4, key + ": the atom under the pointer holds still", held);
        const hovered = await orangeShot(page);
        check(hovered.length === 0, key + ": no orange pixels while the pointer rests on an atom", hovered.slice(0, 4));
        // Pointer gone: every atom returns exactly home.
        await page.mouse.move(2, 2);
        await pointerGone(page);
        await page.waitForTimeout(1600);
        const all = await offsets(page);
        check(all.every(([x, y]) => x === 0 && y === 0), key + ": every atom returns home", all.filter(([x, y]) => x || y).slice(0, 4));
      }

      // A click on empty space sends one ring through every dot field.
      const rung = await page.evaluate(() => {
        const roots = [...document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]")].filter(r => r.__halftone);
        // A field that heard the click itself starts its own ring (and marks the event); the rest are rung by v13-motion.js.
        window.__rang = new Set();
        for (const r of roots) { const orig = r.__halftone.ring; r.__halftone.ring = (...a) => { window.__rang.add(r); return orig.apply(r.__halftone, a); }; }
        window.addEventListener("pointerdown", e => { for (const r of e.__hfRingFrom || []) window.__rang.add(r); });
        // Empty page first; a screen that is all dot field (the landing hero) is clicked on the field itself.
        for (const skip of [",canvas,[data-halftone-field],[data-halftone-hero]", ""]) {
          for (let y = 140; y < innerHeight - 20; y += 23) for (let x = 30; x < innerWidth - 30; x += 37) {
            const e = document.elementFromPoint(x, y);
            if (e && !e.closest("a,button,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],[data-hf-atom]" + skip)) return { x, y, roots: roots.length };
          }
        }
        return { roots: roots.length };
      });
      if (rung.x !== undefined) {
        await page.mouse.click(rung.x, rung.y);
        await page.waitForTimeout(60);
        const n = await page.evaluate(() => window.__rang.size);
        check(n === rung.roots, key + ": a click on empty space ripples through all " + rung.roots + " dot field(s)", { rings: n, fields: rung.roots });
        await page.waitForTimeout(90);
        const clicked = await orangeShot(page);
        check(clicked.length === 0, key + ": no orange pixels while the click ring runs", clicked.slice(0, 4));
      }
      const writes = await page.evaluate(() => ({ n: window.__hfWrites.n, bad: window.__hfWrites.bad }));
      check(writes.bad.length === 0, key + ": every offset written during scroll, pointer and click is a finite number (" + writes.n + " values)", writes.bad);
      check(errors.length === 0, key + ": no script errors", errors);
      await context.close();
    }
    /* ---------- scroll reveal, as a reader meets it (no revealAll) ---------- */
    {
      const { context, page, errors } = await open(path, { reveal: false, oracle: true });
      await revealCheck(page, key + " 1440px");
      check(errors.length === 0, key + ": no script errors while revealing", errors);
      await context.close();
    }
    /* ---------- reduced motion: still, and nothing waits to be revealed ---------- */
    {
      const { context, page, errors } = await open(path, { reducedMotion: "reduce", reveal: false });
      const r0 = await page.evaluate(() => ({ pending: window.InsidirMotion ? window.InsidirMotion.pending : -1, classed: document.querySelectorAll(".hf-pending,.hf-revealing").length }));
      for (let i = 0; i < 12; i++) await page.mouse.move(60 + i * 100, 300 + (i % 3) * 120, { steps: 2 });
      await page.mouse.click(30, 500).catch(() => {});
      await page.waitForTimeout(200);
      const all = await offsets(page);
      check(all.every(([x, y]) => x === 0 && y === 0), key + ": reduced motion keeps every atom still", all.filter(([x, y]) => x || y).length);
      for (const f of [0.5, 1]) { await page.evaluate(f => window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * f, behavior: "instant" }), f); await page.waitForTimeout(250); }
      const r1 = await page.evaluate(() => ({ pending: window.InsidirMotion ? window.InsidirMotion.pending : -1, classed: document.querySelectorAll(".hf-pending,.hf-revealing").length }));
      check(r0.pending === 0 && r0.classed === 0 && r1.pending === 0 && r1.classed === 0, key + ": reduced motion: nothing waits to be revealed, at load or after scrolling", { load: r0, scrolled: r1 });
      check(errors.length === 0, key + ": no script errors with reduced motion", errors);
      await context.close();
    }
    /* ---------- phone ---------- */
    {
      const phoneReveal = !flag("no-phone-reveal");
      const { context, page, errors } = await open(path, { width: 390, touch: true, reveal: !phoneReveal, oracle: phoneReveal });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, fields: [...document.querySelectorAll("[data-halftone-field]")].filter(f => f.__halftone).length }));
      check(m.overflow <= 1 && m.fields >= 1, key + ": 390px touch: no overflow, " + m.fields + " field(s)", m);
      if (phoneReveal) await revealCheck(page, key + " 390px");
      check(errors.length === 0, key + ": 390px: no script errors", errors);
      await context.close();
    }
  }
} finally { await browser.close(); server.close(); }

for (const p of passed) console.log("  ok   " + p);
for (const f of failed) console.log("  FAIL " + f);
console.log(`\nMotion check: ${passed.length} passed, ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;

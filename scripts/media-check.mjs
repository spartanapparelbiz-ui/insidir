/* Insidir media check: company logos and insiders' faces on the rebuilt app pages (ui.css + ui.js).

   The pipeline (web/assets/js/ui.js): UI.logo(ticker) renders a [data-logo] tile with the company's initials and
   UI.face(name, {cik, ticker, issuerCik}) a [data-face][data-cik] tile with the person's initials; hydrateLogos(root)
   asks GET /v1/media?tickers=…&people=… in one batch per paint (src/media-batch.mjs contract: logos[TICKER],
   photos[<owner CIK>], pending {logos, photos}), paints an <img> and adds .has-img only when the image has loaded,
   keeps the initials when the answer is null, the request fails or the image does not load, asks again only for
   pending keys, caches answers in sessionStorage (insidir:logos:v1, insidir:faces:v1) and fills every
   [data-ui-credits] with "Photos: <name>, <credit>." for the photos shown on that page.

   Opens each page in headless Chromium at 390px (touch) and 1440px with the /v1 API mocked (scripts/fixtures/ui-api.mjs,
   scripts/fixtures/intelligence-api.json and small fictional answers below for the filer and portfolio pages). The
   images it serves at /v1/media/<sha256>.<ext> are plain grey fixtures drawn with sharp inside this run only.
   Which keys have a logo or a photo is a fixed function of the key, so every page shows both outcomes.

   For every page and width it verifies:
     - the page shows logo tiles (and face tiles where it names insiders), each aria-hidden, with alt="" images;
     - every logo whose answer has a src shows that image loaded (.has-img, naturalWidth > 0), every null keeps its
       initials and no <img>; the same for faces by owner CIK; a face tile without a CIK never gets a picture
       (no synthetic faces), and no image comes from anywhere but this origin's /v1/media/;
     - the picture fills its box: a face's <img> equals the tile within 1px, a logo's sits inside it, centred;
     - pictures are at least 2x sharp;
     - nothing moves when the pictures arrive: with the batch held back until the page has rendered, every tile keeps
       its size and every tile and heading keeps its position once they land;
     - loading: logos and faces are asked for together (tickers= and people= in the same request), no key is asked
       again once answered, and logos are painted in the same answer that leaves photos pending;
     - [data-ui-credits] lists exactly the photos shown on the page ("Photos: name, credit.");
     - no page errors and no console errors.
   And once: a pending logo and a pending photo (asked again on their own, then painted, the other tiles not held
   back), the batch failing with 503 (initials everywhere, no errors), a photo whose image 404s (initials kept,
   not credited as loaded), the sessionStorage cache (a second page in the same tab asks nothing already answered,
   credits only for that page's own people), and reduced motion (no running animation on any tile).

   Usage: CHROME_BIN=... node scripts/media-check.mjs [--pages dashboard,company,...] [--widths 390,1440]
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { uiAnswer } from "./fixtures/ui-api.mjs";
import { serveStatic } from "../src/web.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const passed = [], failed = [];
const check = (ok, label, detail) => { (ok ? passed : failed).push(ok ? label : label + (detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 1200))); return ok; };
const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));

/* ---------- pages: the rebuilt pages the fixtures can feed. needs: which tiles the page must show. ---------- */
const PAGES_ALL = {
  dashboard: { path: "/dashboard.html", needs: ["logo", "face"] },
  company: { path: "/company.html?ticker=PLHD", needs: ["logo", "face"] },
  watchlist: { path: "/watchlist.html", needs: ["logo"] },
  filings: { path: "/filings.html", needs: ["logo"] },
  intelligence: { path: "/intelligence.html", needs: ["logo", "face"] },
  portfolio: { path: "/portfolio.html", needs: ["logo", "face"] },
  entity: { path: "/entity.html?cik=9990001#record", needs: ["logo"] }
};
const pick = opt("pages", "").split(",").filter(Boolean);
const PAGES = Object.keys(PAGES_ALL).filter(k => !pick.length || pick.includes(k));
const ONCE = !pick.length || args.includes("--once");
const WIDTHS = opt("widths", "390,1440").split(",").map(Number).filter(Boolean);

/* ---------- media answers: a fixed function of the key ---------- */
const hash = s => createHash("sha256").update(String(s)).digest();
const hasLogo = t => hash("logo:" + t)[0] % 4 !== 0;          // about three in four tickers have a logo
const hasPhoto = c => hash("photo:" + c)[0] % 2 === 0;        // about half the people have a photo
const IMAGES = new Map();
async function image(key, kind) {
  const w = kind === "photo" ? 256 : 300, h = kind === "photo" ? 256 : 300, g = 80 + hash(key)[1] % 120;
  const svg = kind === "photo"
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="rgb(${g},${g},${g})"/><circle cx="${w / 2}" cy="${h * .42}" r="${w * .2}" fill="rgb(${g + 40},${g + 40},${g + 40})"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w * .3}" fill="rgb(${g},${g},${g})"/></svg>`;
  const bytes = kind === "photo" ? await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer() : await sharp(Buffer.from(svg)).png().toBuffer();
  const ext = kind === "photo" ? "webp" : "png", name = createHash("sha256").update(bytes).digest("hex") + "." + ext;
  IMAGES.set(name, { type: kind === "photo" ? "image/webp" : "image/png", bytes });
  return "/v1/media/" + name;
}
const MISSING = "/v1/media/" + "0".repeat(63) + "1.webp";
const creditOf = c => ({ name: "Person " + c, credit: "Fixture credit " + c });
async function logoAnswer(t) { return hasLogo(t) ? { src: await image("logo:" + t, "logo"), w: 300, h: 300, source: "fixture", name: t } : null; }
async function photoAnswer(c, broken) { return hasPhoto(c) ? { src: broken ? MISSING : await image("photo:" + c, "photo"), w: 256, h: 256, source: "fixture", ...creditOf(c), sourceUrl: "https://example.com/" + c } : null; }

/* ---------- small fictional answers for the filer and portfolio pages ---------- */
const DAY = 864e5, ago = d => new Date(Date.now() - d * DAY).toISOString();
const ev = (u, d) => ({ source: "SEC Form 4", title: "Form 4", filedOn: d, url: u });
const ENTITY = { state: "ok", entity: { cik: "0009990001", name: "EXAMPLE CAPITAL MANAGEMENT LLC", kind: "organization", kindBasis: "filed_name_pattern", tickers: [], exchanges: [], listed: false, isIssuer: false, isReportingOwner: true, importedFilings: { asIssuer: 0, asOwner: 2 }, profileRefreshedAt: ago(2) },
  names: [{ name: "EXAMPLE CAPITAL MANAGEMENT LLC", as: "name", source: "edgar_submissions", from: null, to: null }], tickerHistory: [],
  imported: { asIssuer: { filings: 0, lastFiledAt: null }, asReportingOwner: [{ issuerCik: "0000000099", issuerName: "EXAMPLE CORP", ticker: "EXMP", filings: 2, lastFiledAt: ago(5), role: "10% owner", evidenceUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml" },
    { issuerCik: "0000000098", issuerName: "PLACEHOLDER HOLDINGS", ticker: "PLHD", filings: 1, lastFiledAt: ago(9), role: "Director", evidenceUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000011/form4.xml" }] },
  edgar: { recentFilings: [], olderFilingFiles: 0, browseUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0009990001" }, edgarState: "ok" };
const CONNECTIONS = { subject: { id: "0009990001", name: "Example Capital Management LLC", kind: "organization", url: "entity.html?cik=9990001" },
  nodes: [{ id: "0009990001", name: "Example Capital Management LLC", kind: "organization", url: "entity.html?cik=9990001" }, { id: "0000000099", name: "Example Corp", kind: "company", ticker: "EXMP", url: "company.html?ticker=EXMP" }, { id: "0000000042", name: "Doe Jane", kind: "person", url: "person.html?cik=42" }],
  edges: [{ type: "reports_at", from: "0009990001", to: "0000000099", role: "10% owner", filings: 2, firstFiledOn: ago(90).slice(0, 10), lastFiledOn: ago(5).slice(0, 10), evidence: [ev("https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml", ago(5).slice(0, 10))] },
    { type: "filed_jointly", from: "0009990001", to: "0000000042", filings: 1, firstFiledOn: ago(5).slice(0, 10), lastFiledOn: ago(5).slice(0, 10), evidence: [] }], gaps: [], method: "" };
const HOLDINGS = { items: [{ ticker: "EXMP", quantity: "120", updated_at: ago(3) }, { ticker: "PLHD", quantity: "2.5", updated_at: ago(10) }, { ticker: "SMPL", quantity: "10", updated_at: ago(12) }],
  recentSecActivity: [{ ticker: "EXMP", accession: "000000004226000015", issuer_cik: "0000000099", owner_cik: "0000000042", owner_name: "DOE JANE", category: "reported_sale", source_url: "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml", published_at: ago(2) },
    { ticker: "PLHD", accession: "000000004326000011", issuer_cik: "0000000098", owner_cik: null, owner_name: "ROE RICHARD, POE PAT", owners: [{ cik: "0000000043", name: "ROE RICHARD" }, { cik: "0000000044", name: "POE PAT" }], category: "reported_purchase", source_url: "https://www.sec.gov/Archives/edgar/data/43/000000004326000011/form4.xml", published_at: ago(3) },
    { ticker: "SMPL", accession: "000000004526000012", issuer_cik: "0000000097", owner_cik: "0000000045", owner_name: "LEE SAM", category: "reported_sale", source_url: "https://www.sec.gov/Archives/edgar/data/45/000000004526000012/form4.xml", published_at: ago(4) }], source: "user-entered" };
function apiAnswer(p, m, url) {
  if (p === "/v1/entities/9990001" || p === "/v1/entities/0009990001") return ENTITY;
  if (/^\/v1\/entities\/\d+\/connections$/.test(p)) return CONNECTIONS;
  if (/^\/v1\/entities\/\d+\/changes$/.test(p)) return { items: [], counts: {}, gaps: [] };
  if (p === "/v1/me/manual-holdings") return HOLDINGS;
  if (p === "/v1/me/brokerage/status") return { available: false, connected: false, permission: "read" };
  if (p === "/v1/me/intelligence/instrument") return F.instrument;
  if (p === "/v1/intelligence/tape") return F.tape;
  if (p === "/v1/intelligence/structure") return F.structure;
  if (p === "/v1/me/intelligence/briefing") return F.briefing;
  if (p === "/v1/ai/status") return F.aiStatus;
  if (p === "/v1/intelligence/mirror/managers") return F.managers;
  if (p.startsWith("/v1/intelligence/mirror/managers/")) return F.manager;
  if (p === "/v1/intelligence/mirror/simulate") return F.simulate;
  const ui = uiAnswer(p, m);
  if (ui) return ui;
  return { items: [] };
}

/* ---------- server: static pages, the /v1 mocks, and the media batch with per-test behaviour ---------- */
let MODE = {};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname;
  const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  try {
    if (p.startsWith("/v1/media/")) {
      const img = IMAGES.get(p.slice("/v1/media/".length));
      if (!img) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable" }); res.end(img.bytes); return;
    }
    if (p === "/v1/media") {
      const tickers = (url.searchParams.get("tickers") || "").split(",").filter(Boolean), people = (url.searchParams.get("people") || "").split(",").filter(Boolean);
      MODE.log?.push({ tickers, people, at: Date.now() });
      if (MODE.hold) await MODE.hold;
      if (MODE.fail) return json(503, { error: "Media is unavailable" });
      const logos = {}, photos = {}, pending = { logos: [], photos: [] };
      for (const t of tickers) { if (MODE.pendingLogo === t && (MODE.seen[t] = (MODE.seen[t] || 0) + 1) === 1) pending.logos.push(t); else logos[t] = await logoAnswer(t); }
      for (const key of people) { const c = key.split(":")[0].replace(/^0+/, "");
        if (MODE.pendingPhoto === c && (MODE.seen[c] = (MODE.seen[c] || 0) + 1) === 1) { pending.photos.push(key); continue; }
        photos[c] = await photoAnswer(c, MODE.brokenPhoto === c); }
      return json(200, { logos, photos, pending, retryAfter: pending.logos.length + pending.photos.length ? 2 : 0 });
    }
    if (p.startsWith("/v1/")) {
      let body = null; if (req.method === "POST") { let s = ""; for await (const c of req) s += c; try { body = JSON.parse(s || "{}"); } catch { body = {}; } }
      return json(200, apiAnswer(p, req.method, url, body));
    }
    if (!(await serveStatic(req, res))) { res.writeHead(404); res.end(); }
  } catch (e) { json(500, { error: String(e.message) }); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });

async function open(width, path, { reduced = false, ctx: shared = null } = {}) {
  const ctx = shared || await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push("page: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !(MODE.allowConsole && MODE.allowConsole.test(m.text()))) errors.push("console: " + m.text()); });
  await page.goto(base + path, { waitUntil: "load" });
  return { ctx, page, errors };
}
// Every tile on the page, in document coordinates.
const TILES = () => [...document.querySelectorAll("[data-logo],.face")].filter(el => el.getClientRects().length).map(el => {
  const r = el.getBoundingClientRect(), img = el.querySelector("img"), ir = img?.getBoundingClientRect();
  return { kind: el.matches("[data-logo]") ? "logo" : "face", key: el.matches("[data-logo]") ? el.dataset.logo : el.dataset.cik || "", hidden: el.getAttribute("aria-hidden"), has: el.classList.contains("has-img"),
    x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, img: img ? { src: img.getAttribute("src"), alt: img.getAttribute("alt"), ok: img.complete && img.naturalWidth > 0, nw: img.naturalWidth, x: ir.left - r.left, y: ir.top - r.top, w: ir.width, h: ir.height } : null,
    mono: !!el.querySelector(".logo__mono,.face__mono") && getComputedStyle(el.querySelector(".logo__mono,.face__mono")).opacity !== "0" };
});
const HEADS = () => [...document.querySelectorAll("main h1,main h2")].filter(el => el.getClientRects().length).map(el => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 30), x: r.left + scrollX, y: r.top + scrollY }; });
const settle = page => page.waitForFunction(() => [...document.querySelectorAll("[data-logo],[data-face]")].every(el => !el.querySelector("img") || el.querySelector("img").complete), null, { timeout: 15000 }).catch(() => {});
const close = (a, b) => Math.abs(a - b) <= 1;

/* ---------- every page, every width ---------- */
for (const name of PAGES) for (const width of WIDTHS) {
  const tag = name + " @" + width;
  let release; MODE = { log: [], seen: {}, hold: new Promise(r => { release = r; }) };
  const { ctx, page, errors } = await open(width, PAGES_ALL[name].path);
  await page.waitForTimeout(1800);                                  // the records render; the batch is held back
  const before = await page.evaluate(TILES), headsBefore = await page.evaluate(HEADS);
  release(); MODE.hold = null;
  await page.waitForTimeout(600); await settle(page); await page.waitForTimeout(300);
  const tiles = await page.evaluate(TILES), heads = await page.evaluate(HEADS);
  const logos = tiles.filter(t => t.kind === "logo" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(t.key)), faces = tiles.filter(t => t.kind === "face");
  for (const k of PAGES_ALL[name].needs) check((k === "logo" ? logos : faces).length > 0, tag + ": shows " + k + " tiles", tiles.length);
  check(tiles.every(t => t.hidden === "true"), tag + ": every tile is aria-hidden", tiles.filter(t => t.hidden !== "true").map(t => t.key));
  check(tiles.every(t => !t.img || t.img.alt === ""), tag + ": every tile image has alt=\"\"");
  check(tiles.every(t => !t.img || /^\/v1\/media\/[a-f0-9]{64}\.(png|webp)$/.test(t.img.src)), tag + ": images come only from this origin's /v1/media/", tiles.filter(t => t.img).map(t => t.img.src).filter(s => !/^\/v1\/media\//.test(s)));
  const wrongLogo = logos.filter(t => hasLogo(t.key) ? !(t.has && t.img?.ok && !t.mono) : (t.img || t.has || !t.mono));
  check(!wrongLogo.length, tag + ": every logo shows its image when one exists and its initials when none does", wrongLogo.map(t => t.key));
  const wrongFace = faces.filter(t => t.key ? (hasPhoto(t.key) ? !(t.has && t.img?.ok && !t.mono) : (t.img || t.has || !t.mono)) : (t.img || t.has));
  check(!wrongFace.length, tag + ": every face shows its photo when one exists, initials otherwise (none for a person without a CIK)", wrongFace.map(t => t.key));
  const shown = tiles.filter(t => t.img?.ok);
  check(shown.filter(t => t.kind === "face").every(t => close(t.img.x, 0) && close(t.img.y, 0) && close(t.img.w, t.w) && close(t.img.h, t.h)), tag + ": a photo fills its tile", shown.filter(t => t.kind === "face").map(t => [t.key, t.img, t.w]).slice(0, 3));
  check(shown.filter(t => t.kind === "logo").every(t => t.img.x >= 0 && t.img.y >= 0 && t.img.x + t.img.w <= t.w + 1 && t.img.y + t.img.h <= t.h + 1 && close(t.img.x, t.w - t.img.x - t.img.w)), tag + ": a logo sits inside its tile, centred", shown.filter(t => t.kind === "logo").map(t => [t.key, t.img, t.w]).slice(0, 3));
  check(shown.every(t => t.img.nw >= 2 * t.img.w), tag + ": every picture is at least 2x sharp", shown.filter(t => t.img.nw < 2 * t.img.w).map(t => [t.key, t.img.nw, t.img.w]));
  // Nothing moves when the pictures land.
  const pair = before.map((b, i) => [b, tiles[i]]).filter(([b, a]) => a && a.key === b.key && a.kind === b.kind);
  check(before.length && pair.length === before.length, tag + ": the same tiles before and after the pictures land", [before.length, tiles.length]);
  check(pair.every(([b, a]) => close(b.w, a.w) && close(b.h, a.h)), tag + ": every tile keeps its size", pair.filter(([b, a]) => !close(b.w, a.w) || !close(b.h, a.h)).map(([b, a]) => [b.key, b.w, a.w]).slice(0, 4));
  check(pair.every(([b, a]) => close(b.x, a.x) && close(b.y, a.y)) && headsBefore.every((h, i) => heads[i] && close(h.y, heads[i].y)), tag + ": no tile or heading moves when pictures and credits land",
    pair.filter(([b, a]) => !close(b.y, a.y)).map(([b, a]) => [b.key, b.y, a.y]).slice(0, 4));
  // Loading.
  const asked = MODE.log, logoKeys = asked.flatMap(r => r.tickers), photoKeys = asked.flatMap(r => r.people);
  check(asked.length >= 1, tag + ": pictures are asked for in /v1/media batches", asked.length);
  if (logos.length && faces.some(f => f.key)) check(asked.some(r => r.tickers.length && r.people.length), tag + ": logos and faces are asked for in the same batch", asked.map(r => [r.tickers.length, r.people.length]));
  check(new Set(logoKeys).size === logoKeys.length && new Set(photoKeys).size === photoKeys.length, tag + ": no key is asked for twice once answered", asked);
  // Credits: exactly the photos on this page.
  const credits = await page.$$eval("[data-ui-credits]", els => els.map(e => e.textContent));
  const withPhoto = [...new Set(faces.filter(f => f.key && hasPhoto(f.key)).map(f => f.key))];
  if (credits.length) {
    const text = credits[0];
    check(withPhoto.length ? /^Photos: /.test(text) && withPhoto.every(c => text.includes(creditOf(c).name + ", " + creditOf(c).credit)) : text === "", tag + ": [data-ui-credits] lists every photo shown", { text, withPhoto });
    const extra = (text.match(/Person \d+/g) || []).map(s => s.slice(7)).filter(c => !withPhoto.includes(c));
    check(!extra.length, tag + ": credits name only the photos on this page", extra);
  } else check(!withPhoto.length, tag + ": a page that shows photos has a [data-ui-credits] line", withPhoto);
  check(!errors.length, tag + ": no page or console errors", errors);
  await ctx.close();
}

/* ---------- once ---------- */
if (ONCE) {
  // 1. Pending: one logo and one photo come back pending; the rest paint at once, the two are asked again alone.
  {
    const lt = "EXMP", pc = String(F.tape.events.find(e => e.personCik && hasPhoto(e.personCik))?.personCik || "");
    MODE = { log: [], seen: {}, pendingLogo: hasLogo(lt) ? lt : "PLHD", pendingPhoto: pc };
    const { ctx, page, errors } = await open(1440, "/intelligence.html");
    await page.waitForTimeout(1200);
    const early = await page.evaluate(TILES);
    const logo = MODE.pendingLogo, others = early.filter(t => t.kind === "logo" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(t.key) && t.key !== logo && hasLogo(t.key));
    check(others.length && others.every(t => t.has), "pending: logos are not held back by a pending logo or photo", others.filter(t => !t.has).map(t => t.key));
    check(early.filter(t => t.key === pc && t.kind === "face").every(t => !t.has && t.mono), "pending: the pending face keeps its initials meanwhile");
    await page.waitForTimeout(3500); await settle(page);
    const later = await page.evaluate(TILES), again = MODE.log.slice(1).filter(r => r.at - MODE.log[0].at > 1000);
    check(again.length >= 1 && again.every(r => r.tickers.every(t => t === logo) && r.people.every(k => k.split(":")[0] === pc)), "pending: only the pending keys are asked again", again);
    check(later.filter(t => t.key === logo && t.kind === "logo").every(t => t.has) && later.filter(t => t.key === pc && t.kind === "face").every(t => t.has), "pending: they paint once answered");
    check(!errors.length, "pending: no page or console errors", errors);
    await ctx.close();
  }
  // 2. The batch fails (503): initials everywhere, no picture, no page errors.
  {
    MODE = { log: [], seen: {}, fail: true, allowConsole: /status of 503/ };
    const { ctx, page, errors } = await open(1440, "/intelligence.html");
    await page.waitForTimeout(2000);
    const t = await page.evaluate(TILES);
    check(t.length && t.every(x => !x.img && !x.has && x.mono), "503: every tile keeps its initials", t.filter(x => x.img).map(x => x.key));
    check(!errors.length, "503: no page errors", errors);
    await ctx.close();
  }
  // 3. A photo whose image 404s keeps its initials.
  {
    const pc = String(F.tape.events.find(e => e.personCik && hasPhoto(e.personCik))?.personCik || "");
    MODE = { log: [], seen: {}, brokenPhoto: pc, allowConsole: /status of 404/ };
    const { ctx, page, errors } = await open(1440, "/intelligence.html");
    await page.waitForTimeout(2000); await settle(page);
    const t = (await page.evaluate(TILES)).filter(x => x.kind === "face" && x.key === pc);
    check(t.length && t.every(x => !x.has && x.mono), "404 photo: the face keeps its initials", t);
    check(!errors.length, "404 photo: no page errors", errors);
    await ctx.close();
  }
  // 4. The sessionStorage cache: a second page in the same tab asks nothing already answered; credits stay per page.
  {
    MODE = { log: [], seen: {} };
    const first = await open(1440, "/intelligence.html");
    await first.page.waitForTimeout(2000); await settle(first.page);
    const known = await first.page.evaluate(() => ({ logos: Object.keys(JSON.parse(sessionStorage.getItem("insidir:logos:v1") || "{}")), faces: Object.keys(JSON.parse(sessionStorage.getItem("insidir:faces:v1") || "{}")) }));
    check(known.logos.length > 0 && known.faces.length > 0, "cache: answers are kept in sessionStorage (insidir:logos:v1, insidir:faces:v1)", known);
    const askedFirst = MODE.log.length;
    await first.page.reload({ waitUntil: "load" }); await first.page.waitForTimeout(2000); await settle(first.page);
    const re = MODE.log.slice(askedFirst);
    check(re.every(r => r.tickers.every(t => !known.logos.includes(t)) && r.people.every(k => !known.faces.includes(k.split(":")[0]))), "cache: a reload asks for nothing already answered", re);
    const t = await first.page.evaluate(TILES);
    check(t.filter(x => x.kind === "face" && x.key && hasPhoto(x.key)).every(x => x.has), "cache: cached photos show on the reloaded page");
    await first.page.goto(base + "/portfolio.html", { waitUntil: "load" }); await first.page.waitForTimeout(2000); await settle(first.page);
    const ciks = (await first.page.evaluate(TILES)).filter(x => x.kind === "face" && x.key).map(x => x.key);
    const text = await first.page.textContent("[data-ui-credits]");
    const extra = (text.match(/Person \d+/g) || []).map(s => s.slice(7)).filter(c => !ciks.includes(c));
    check(!extra.length, "cache: credits on the next page name only that page's photos", { text, ciks });
    check(!first.errors.length, "cache: no page or console errors", first.errors);
    await first.ctx.close();
  }
  // 5. Reduced motion: no tile animates.
  {
    MODE = { log: [], seen: {} };
    const { ctx, page, errors } = await open(1440, "/intelligence.html", { reduced: true });
    await page.waitForTimeout(2000); await settle(page);
    const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect?.target?.closest?.("[data-logo],.face")).length);
    check(running === 0, "reduced motion: no running animation on any tile", running);
    check(!errors.length, "reduced motion: no page or console errors", errors);
    await ctx.close();
  }
}

await browser.close();
server.close();
for (const p of passed) console.log("ok   " + p);
for (const f of failed) console.log("FAIL " + f);
console.log(`\n${passed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

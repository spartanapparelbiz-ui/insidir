// Art QA against a started build (qa/e2e/run.sh's app and database): node qa/art-qa.mjs http://localhost:3100
//
// Unsplash is out of reach from CI and this sandbox, so every request to images.unsplash.com is answered with a stand-in
// of exactly the size the URL asks for (an SVG of w × h, the photo's colour, its id written on it). Layout, crops,
// srcset choices and loading are the real thing; only the pixels inside each photo are stand-ins.
//
// Writes qa/screenshots/art/: 2x screenshots of the tracker list, home, Activity and a tracker page at 1440 and 390,
// close-ups of 12 thumbnails (6 trackers, 3 matchups, 3 stock filings) and report.txt. Fails when an image doesn't
// load, an image shows bigger than its source, a logo is cropped or drawn into a circle by another rule, a picture
// has the wrong size, the page shifts (CLS > 0.01) or any drawn art is left.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const OUT = "qa/screenshots/art";
mkdirSync(OUT, { recursive: true });
const db = sql => execFileSync("psql", [process.env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" });

// QA rows: three more games and three Form 4s for companies with logos, opened in the last hour.
const QA = ["qa:g1", "qa:g2", "qa:g3", "qa:f1", "qa:f2", "qa:f3"];
db(`delete from terminal.moves where id = any(array['${QA.join("','")}'])`);
const game = (id, league, title, outcome, mins) => `insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, fills, tab, league, category, created_at, new_wallet)
  values ('${id}', 'polymarket', '0x${id.replace(":", "")}', '${title}', '${title}', '${outcome}', 'yes', 120000, 0.55, '0xe2eqa0000000000000000000000000000000000${id.slice(-1)}', now() - interval '${mins} minutes', now() - interval '${mins} minutes', 1, 'sports', '${league}', 'sports', now(), false)`;
db(game("qa:g1", "MLB", "Yankees vs. Dodgers", "Yankees", 4));
db(game("qa:g2", "NHL", "Rangers at Bruins", "Bruins", 5));
db(game("qa:g3", "NBA", "Warriors vs. Knicks", "Knicks", 6));
const form4 = (id, ticker, company, owner, mins) => `insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, fills, tab, league, category, created_at, new_wallet, detail)
  values ('${id}', 'sec', 'sec:${ticker}', '${company}', '${ticker}', 'Bought', 'yes', 2400000, 120, null, now() - interval '${mins} minutes', now() - interval '${mins} minutes', 1, 'stocks', null, 'insider', now(), false,
  '{"kind":"insider","company":"${company}","ticker":"${ticker}","issuerCik":"0000${id.slice(-1)}","role":"The CEO","ownerName":"${owner}","ownerCik":"0000777${id.slice(-1)}","shares":20000,"pricePerShare":120,"tradeDate":"2026-10-27","filedAt":${Date.now()},"accession":"0000qa${id.slice(-1)}"}'::jsonb)`;
db(form4("qa:f1", "NVDA", "NVIDIA Corp", "HUANG JEN HSUN", 7));
db(form4("qa:f2", "AAPL", "Apple Inc.", "COOK TIMOTHY D", 8));
db(form4("qa:f3", "TSLA", "Tesla, Inc.", "MUSK ELON", 9));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const problems = [], notes = [];

async function page(w, h, who) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  await ctx.route("https://images.unsplash.com/**", route => {
    const u = new URL(route.request().url());
    const W = Number(u.searchParams.get("w") ?? 800), H = Number(u.searchParams.get("h") ?? Math.round(W * 0.75));
    const id = u.pathname.replace("/photo-", "");
    let hue = 0; for (const c of id) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,22%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="rgba(255,255,255,.75)" font-family="sans-serif" font-size="${Math.max(9, W / 22)}" text-anchor="middle">stand-in ${W}×${H}</text></svg>`;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  return { ctx, p };
}

async function check(p, label) {
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } window.scrollTo(0, 0); });
  await p.evaluate(() => Promise.all([...document.images].map(i => { i.loading = "eager"; return i.complete ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }); })));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const out = [], dpr = devicePixelRatio;
    const shown = el => { const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return false; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden") return false; } return true; };
    for (const img of document.images) {
      if (!shown(img)) continue;
      const b = img.getBoundingClientRect(), src = img.currentSrc || img.src;
      if (!(img.complete && img.naturalWidth > 0)) { out.push(`not loaded: ${src.slice(0, 90)}`); continue; }
      const c = getComputedStyle(img);
      const logo = img.closest(".logo, .matchup__team, .thead__name");
      if (logo) {
        if (c.objectFit !== "contain" && !img.closest(".thead__name")) out.push(`logo not contained (${c.objectFit}): ${src}`);
        if (parseFloat(c.borderRadius) > 0) out.push(`logo rounded by a rule: ${src}`);
        const p = logo.getBoundingClientRect();
        if (b.left < p.left - .5 || b.right > p.right + .5 || b.top < p.top - .5 || b.bottom > p.bottom + .5) out.push(`logo spills out of its tile: ${src}`);
        if (/\/logos\/stocks\//.test(src) && Math.max(b.width, b.height) > 44.5) out.push(`128px stock logo shown at ${Math.round(b.width)}px: ${src}`);
      } else if (/images\.unsplash\.com/.test(src)) {
        // the width the CDN was asked for (naturalWidth is already divided by the srcset density) must cover the
        // box at this screen's density
        const asked = Number(new URL(src).searchParams.get("w")), need = b.width * dpr;
        if (asked + 1 < need) out.push(`photo shown bigger than its source (${asked}px for ${Math.round(need)}px): ${src.slice(0, 90)}`);
      }
    }
    for (const a of document.querySelectorAll(".art56, .tbook__thumb, .trow__thumb")) {
      if (!shown(a)) continue;
      const b = a.getBoundingClientRect(), want = innerWidth >= 700 ? 56 : 48;
      if (Math.round(b.width) !== want || Math.round(b.height) !== want) out.push(`art is ${Math.round(b.width)}×${Math.round(b.height)}, not ${want}: ${a.className}`);
      if ((a.matches(".tcover--sm, .photo--thumb")) && getComputedStyle(a).borderRadius !== "12px") out.push(`thumbnail radius ${getComputedStyle(a).borderRadius}, not 12px: ${a.className}`);
    }
    if (document.querySelector("svg.art, .tcover__art, .artpanel, .tcover__curve, .tcover__logo")) out.push("drawn art is still on the page");
    return { out, cls: window.__cls, photos: [...document.images].filter(i => /unsplash/.test(i.currentSrc)).length, logos: document.querySelectorAll(".logo img, .matchup img").length };
  });
  for (const o of r.out) problems.push(`${label}: ${o}`);
  if (r.cls > 0.01) problems.push(`${label}: layout shift ${r.cls.toFixed(3)}`);
  notes.push(`${label}: ${r.photos} photos, ${r.logos} logos, CLS ${r.cls.toFixed(3)}`);
}

const SHOTS = [["tracker-list", "/", "member"], ["home", "/", "visitor"], ["activity", "/feed", "member"], ["tracker-page", "/trackers/nba-big-money", "member"], ["tracker-page-style", "/trackers/biggest-bets", "member"], ["activity-stocks", "/feed?tab=stocks", "member"]];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const [name, path, who] of SHOTS) {
    const { ctx, p } = await page(w, h, who);
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await check(p, `${name} ${w}`);
    await p.screenshot({ path: `${OUT}/${name}-${w}@2x.png`, fullPage: true });
    await ctx.close();
  }
}

// Close-ups: 6 tracker thumbnails, 3 matchups, 3 stock filings, each at 3x.
const crops = [];
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  await ctx.route("https://images.unsplash.com/**", async route => {
    const u = new URL(route.request().url()), W = Number(u.searchParams.get("w")), H = Number(u.searchParams.get("h") ?? W);
    const id = u.pathname.replace("/photo-", ""); let hue = 0; for (const c of id) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,22%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>` });
  });
  const p = await ctx.newPage();
  // Each crop takes 6px around the art, so what sits on its edge (a matchup's shadow, the insider on a Form 4) shows whole.
  const crop = async (loc, path) => { const b = await loc.boundingBox(); await p.screenshot({ path, clip: { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 } }); };
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const thumbs = p.locator(".tbook__thumb");
  for (let i = 0; i < 6; i++) { const f = `${OUT}/thumb-tracker-${i + 1}.png`; await thumbs.nth(i).scrollIntoViewIfNeeded(); await crop(thumbs.nth(i), f); crops.push(f); }
  await p.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  const games = p.locator(".move .matchup");
  const ng = Math.min(3, await games.count());
  for (let i = 0; i < ng; i++) { const f = `${OUT}/thumb-matchup-${i + 1}.png`; await games.nth(i).scrollIntoViewIfNeeded(); await crop(games.nth(i), f); crops.push(f); }
  if (ng < 3) problems.push(`only ${ng} matchups on Activity`);
  await p.goto(`${BASE}/feed?tab=stocks`, { waitUntil: "networkidle" });
  const filings = p.locator(".move .filing");
  const nf = Math.min(3, await filings.count());
  for (let i = 0; i < nf; i++) { const f = `${OUT}/thumb-stock-${i + 1}.png`; await filings.nth(i).scrollIntoViewIfNeeded(); await crop(filings.nth(i), f); crops.push(f); }
  if (nf < 3) problems.push(`only ${nf} stock filings with logos on Activity`);
  await ctx.close();
}
await browser.close();
db(`delete from terminal.moves where id = any(array['${QA.join("','")}'])`);

const grep = (() => { try { return execFileSync("grep", ["-rln", "SubjectArt", "app", "components", "lib"], { encoding: "utf8" }).trim(); } catch { return ""; } })();
if (grep) problems.push(`SubjectArt still in: ${grep}`);
const report = [`Stand-in photos (Unsplash is unreachable here); everything else is the real page.`, ...notes, "", problems.length ? problems.join("\n") : "No problems: every image loaded, no photo shown bigger than its source, no logo cropped or rounded, every row's art 56/48px, every photo thumbnail 1:1 at radius 12, no layout shift, no drawn art (SubjectArt: 0 files)."].join("\n");
writeFileSync(`${OUT}/report.txt`, report + "\n");
writeFileSync(`${OUT}/crops.json`, JSON.stringify(crops));
console.log(report);
process.exit(problems.length ? 1 : 0);

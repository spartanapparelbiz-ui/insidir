// Image audit of the built site, as a visitor and as a member, at 1440 and 390. Fails on:
//  - a visible <img> that didn't load (broken or empty);
//  - a tracker cover or card thumbnail with no photo or logo in it (a blank box);
//  - a tracker cover whose photo isn't its tracker's (lib/photos.ts trackerPhoto);
//  - any drawn art left on a page (svg.art, .artpanel);
//  - any request for an image that 404s.
// Unsplash is out of reach from this sandbox and CI, so its CDN is answered with a stand-in of the size asked for.
// Writes qa/screenshots/copy/image-audit.txt. Run against a started build: node qa/image-audit.mjs http://localhost:3100
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const PAGES = ["/", "/#sports", "/#markets", "/#stocks", "/#crypto", "/open", "/trackers", "/trackers/biggest-bets", "/trackers/nfl-big-money", "/trackers/nba-big-money", "/trackers/ceo-buys", "/trackers/fed-and-rates",
  "/feed", "/feed?tab=markets", "/feed?tab=stocks", "/results", "/top", "/following", "/pricing", "/how-it-works", "/faq", "/sports", "/markets", "/stocks",
  "/market/0xe2emarket1", "/insider-trading/EXDV", "/data", "/alerts", "/settings", "/login", "/not-a-page"];
// lib/photos.ts trackerPhoto, mirrored: a tracker shows the photo under its slug (leagues drop "-big-money").
const photosSrc = readFileSync("lib/photos.ts", "utf8");
const expectedPhoto = slug => { const n = slug.replace(/-big-money$/, ""); return photosSrc.includes(`\n  "${n}": {`) || photosSrc.includes(`\n  ${n}: {`) ? n : "home-markets"; };

const browser = await chromium.launch(process.env.PW_CHROMIUM || existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" } : {});
const hits = new Set();
let covers = 0, thumbs = 0, slots = 0;
const logos = new Set(), thumbLogos = new Map();
for (const who of ["visitor", "member"]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
    await ctx.route("https://images.unsplash.com/**", route => {
      const u = new URL(route.request().url()), W = Number(u.searchParams.get("w")) || 96, H = Number(u.searchParams.get("h")) || W;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#567"/></svg>` });
    });
    const page = await ctx.newPage();
    page.on("response", r => { if (r.request().resourceType() === "image" && r.status() >= 400) hits.add(`${who} ${w}: image ${r.status()} ${r.url().replace(BASE, "")}`); });
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
      // Lazy images off to the side (the Featured row scrolls sideways) load when they're needed; load them all now.
      await page.evaluate(() => Promise.all([...document.images].map(i => { i.loading = "eager"; return i.complete ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }); })));
      const r = await page.evaluate(() => {
        const shown = el => { const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return false; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden") return false; } return true; };
        // A picture is there when its photo or logo loaded.
        const drawn = el => [...el.querySelectorAll("img")].some(i => i.complete && i.naturalWidth > 0);
        const out = [];
        for (const i of document.images) if (shown(i) && !(i.complete && i.naturalWidth > 0)) out.push(`broken image ${i.currentSrc || i.src}`);
        for (const d of document.querySelectorAll("svg.art, .artpanel")) out.push(`drawn art ${d.tagName.toLowerCase()}.${d.getAttribute("class")}`);
        const covers = [...document.querySelectorAll(".tcover")].filter(shown);
        for (const c of covers) {
          const slug = (c.closest("a")?.getAttribute("href") ?? location.pathname).match(/\/trackers\/([^/?#]+)/)?.[1] ?? null;
          if (!drawn(c)) out.push(`blank tracker cover${slug ? ` (${slug})` : ""}`);
          else if (slug) out.push(`cover ${slug} ${c.querySelector("[data-photo]")?.dataset.photo ?? "none"}`);
        }
        const thumbs = [...document.querySelectorAll(".move__thumb, .art56")].filter(shown);
        for (const t of thumbs) { if (!drawn(t)) out.push(`blank thumbnail ${t.className}`); const img = t.querySelector(".logo img, .matchup img"); const card = t.closest("[data-move]"); if (img && card) out.push(`thumb ${card.querySelector(".move__head")?.textContent?.replace(/\s+/g, "_")} ${img.getAttribute("src")}`); }
        const slots = [...document.querySelectorAll("[data-photo]")].filter(shown);
        for (const s of slots) if (!drawn(s)) out.push(`blank photo ${s.dataset.photo}`);
        return { out, covers: covers.length, thumbs: thumbs.length, slots: slots.length };
      });
      covers += r.covers; thumbs += r.thumbs; slots += r.slots;
      for (const f of r.out) {
        const m = f.match(/^cover (\S+) (\S+)$/);
        if (m) { const want = expectedPhoto(m[1]); if (want && want !== m[2]) hits.add(`${who} ${w} ${path}: cover of ${m[1]} shows ${m[2]}, not ${want}`); logos.add(`${m[1]} → ${m[2]}`); continue; }
        const th = f.match(/^thumb (\S+) (\S+)$/);
        if (th) { thumbLogos.set(th[1].replace(/_/g, " "), th[2]); continue; }
        hits.add(`${who} ${w} ${path}: ${f}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
mkdirSync("qa/screenshots/copy", { recursive: true });
const list = [...hits];
const summary = `Checked ${covers} tracker covers, ${thumbs} row and card thumbnails and ${slots} photos.\nTracker photos: ${[...logos].sort().join(", ")}\nCard logos: ${[...thumbLogos].map(([h, src]) => `${h} → ${src}`).join("; ")}`;
writeFileSync("qa/screenshots/copy/image-audit.txt", `${summary}\n${list.length ? list.join("\n") : "No blank, broken, drawn or off-subject images found."}\n`);
console.log(summary);
console.log(list.length ? list.join("\n") : "No blank, broken, drawn or off-subject images found.");
process.exit(list.length ? 1 : 0);

// Image audit of the built site, as a visitor and as a member, at 1440 and 390. Fails on:
//  - a visible <img> that didn't load (broken or empty);
//  - a tracker cover, card thumbnail or picture slot with no drawing in it (a blank box);
//  - a tracker cover whose drawing isn't its tracker's subject (lib/photos.ts trackerPhoto);
//  - any request for an image that 404s.
// Writes qa/screenshots/copy/image-audit.txt. Run against a started build: node qa/image-audit.mjs http://localhost:3100
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const PAGES = ["/", "/trackers", "/trackers/biggest-bets", "/trackers/nfl-big-money", "/trackers/nba-big-money", "/trackers/ceo-buys", "/trackers/fed-and-rates",
  "/feed", "/feed?tab=markets", "/feed?tab=stocks", "/results", "/top", "/following", "/pricing", "/how-it-works", "/faq", "/sports", "/markets", "/stocks",
  "/market/0xe2emarket1", "/insider-trading/EXDV", "/data", "/alerts", "/settings", "/login", "/not-a-page"];
const subject = slug => slug.replace(/-big-money$/, "");

const browser = await chromium.launch(process.env.PW_CHROMIUM || existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" } : {});
const hits = new Set();
let covers = 0, thumbs = 0, slots = 0;
for (const who of ["visitor", "member"]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    page.on("response", r => { if (r.request().resourceType() === "image" && r.status() >= 400) hits.add(`${who} ${w}: image ${r.status()} ${r.url().replace(BASE, "")}`); });
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
      const r = await page.evaluate(() => {
        const shown = el => { const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return false; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden") return false; } return true; };
        const drawn = el => { const svg = el.querySelector("svg.art"); return !!svg && svg.querySelectorAll("path, line, rect, circle, ellipse, polygon").length > 0 && Number(getComputedStyle(svg).opacity) > 0.1; };
        const out = [];
        for (const i of document.images) if (shown(i) && !(i.complete && i.naturalWidth > 0)) out.push(`broken image ${i.currentSrc || i.src}`);
        const covers = [...document.querySelectorAll(".tcover")].filter(shown);
        for (const c of covers) {
          const svg = c.querySelector("svg.art");
          const slug = (c.closest("a")?.getAttribute("href") ?? location.pathname).match(/\/trackers\/([^/?#]+)/)?.[1] ?? null;
          if (!drawn(c)) out.push(`blank tracker cover${slug ? ` (${slug})` : ""}`);
          else if (slug) out.push(`cover ${slug} ${svg.dataset.subject}`);
        }
        const thumbs = [...document.querySelectorAll(".move__thumb")].filter(shown);
        for (const t of thumbs) if (!drawn(t)) out.push(`blank card thumbnail`);
        const slots = [...document.querySelectorAll(".artpanel")].filter(shown);
        for (const s of slots) if (!drawn(s)) out.push(`blank picture slot ${s.className}`);
        return { out, covers: covers.length, thumbs: thumbs.length, slots: slots.length };
      });
      covers += r.covers; thumbs += r.thumbs; slots += r.slots;
      for (const f of r.out) {
        const m = f.match(/^cover (\S+) (\S+)$/);
        if (m) { if (subject(m[1]) !== m[2]) hits.add(`${who} ${w} ${path}: cover of ${m[1]} draws ${m[2]}`); continue; }
        hits.add(`${who} ${w} ${path}: ${f}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
mkdirSync("qa/screenshots/copy", { recursive: true });
const list = [...hits];
const summary = `Checked ${covers} tracker covers, ${thumbs} card thumbnails and ${slots} picture slots.`;
writeFileSync("qa/screenshots/copy/image-audit.txt", `${summary}\n${list.length ? list.join("\n") : "No blank, broken or off-subject images found."}\n`);
console.log(summary);
console.log(list.length ? list.join("\n") : "No blank, broken or off-subject images found.");
process.exit(list.length ? 1 : 0);

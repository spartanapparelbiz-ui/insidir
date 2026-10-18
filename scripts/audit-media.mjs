/* Media audit: every stored company logo and person photo on one contact sheet, with the known kinds of
   mistake flagged automatically, so an operator can check the pictures by eye against the names.

   Flags (each found in a real audit, October 2026):
     - the same image on two different people (one of them is certainly wrong);
     - a photo whose recorded caption or card name is not the same person as the SEC filer (strict matcher);
     - a photo of an owner whose filed name is a company or fund (entity owners never get a face);
     - a photo from a source audited as not a photograph (src/photo-exclusions.mjs: illustrated proxies);
     - a Wikipedia/Wikidata logo file named for the company's former name (src/logo-resolver.mjs staleNameFile),
       checked against the SEC record when --sec is given.
   Anything not flagged still needs a look: no rule can tell a well-drawn illustration from a photo, or a
   stock-logo service's ticker-letter placeholder from a real wordmark (WGO).

   Usage: node scripts/audit-media.mjs [--out media-audit.html] [--base https://insidir.com] [--sec] [--limit 400]
   Needs DATABASE_URL (the engine's database). --base is where /v1/media/<sha> images are served from; open the
   page from that origin (the media route sends Cross-Origin-Resource-Policy: same-origin), for example by
   saving it under the site and visiting it signed in, or with a local engine (the default http://localhost:8090). */
import { writeFileSync } from "node:fs";
import { pool } from "../src/db.mjs";
import { samePerson, isEntityName } from "../src/person-match.mjs";
import { excludedPhoto } from "../src/photo-exclusions.mjs";
import { staleNameFile } from "../src/logo-resolver.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const out = opt("out", "media-audit.html"), base = String(opt("base", "http://localhost:8090")).replace(/\/$/, "");
const limit = Math.max(1, Math.min(5000, Number(opt("limit", 400)) || 400)), withSec = args.includes("--sec");
if (!pool) { console.error("DATABASE_URL is required"); process.exit(2); }
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const people = (await pool.query(`
  WITH o AS (SELECT DISTINCT ON (ltrim(owner_cik,'0')) ltrim(owner_cik,'0') AS cik, owner_name, ticker
             FROM sec_transactions WHERE owner_cik IS NOT NULL ORDER BY ltrim(owner_cik,'0'), transaction_date DESC NULLS LAST)
  SELECT ltrim(m.key,'0') AS cik, m.value AS photo, o.owner_name, o.ticker
  FROM media_records m LEFT JOIN o ON o.cik = ltrim(m.key,'0')
  WHERE m.kind = 'person-photo' AND m.value ? 'src' ORDER BY m.updated_at DESC LIMIT $1`, [limit])).rows;
const logos = (await pool.query(`SELECT m.key AS cik, m.value AS logo FROM media_records m
  WHERE m.kind = 'logo' AND m.value->>'status' = 'ok' ORDER BY m.updated_at DESC LIMIT $1`, [limit])).rows;

const bySrc = new Map();
for (const p of people) { const k = p.photo.src; bySrc.set(k, [...(bySrc.get(k) || []), p.cik]); }
const flagsFor = p => {
  const f = [], ph = p.photo, filed = p.owner_name || "";
  if ((bySrc.get(ph.src) || []).length > 1) f.push("same image as CIK " + bySrc.get(ph.src).filter(c => c !== p.cik).join(", "));
  if (filed && ph.personName && !samePerson(filed, ph.personName) && !samePerson(ph.personName, filed)) f.push("caption \"" + ph.personName + "\" is not the filer " + filed);
  if (filed && isEntityName(filed)) f.push("the filer is a company or fund");
  const excluded = excludedPhoto(ph);
  if (excluded) f.push("excluded source: " + excluded);
  return f;
};

let secOf = async () => null;
if (withSec) {
  const { secFetch } = await import("../src/sec.mjs");
  secOf = cik => secFetch("https://data.sec.gov/submissions/CIK" + String(cik).padStart(10, "0") + ".json", { json: true }).catch(() => null);
}
const logoCards = [];
for (const { cik, logo } of logos) {
  const flags = [];
  const subs = await secOf(cik);
  for (const v of Object.values(logo.variants || {})) {
    const file = /\/([^/?#]+)$/.exec(String(v.sourceUrl || ""))?.[1];
    const stale = subs && /wiki/.test(String(v.source)) && file ? staleNameFile(decodeURIComponent(file), subs) : null;
    if (stale) flags.push("file named for former name " + stale);
  }
  if (logo.review) flags.push("resolver queued it for review");
  logoCards.push({ cik, logo, flags, name: subs?.name || logo.ticker || "" });
}

const card = (imgs, title, sub, flags) => `<div class="c${flags.length ? " bad" : ""}"><div class="i">${imgs}</div><b>${esc(title)}</b><small>${esc(sub)}</small>${flags.map(f => `<em>${esc(f)}</em>`).join("")}</div>`;
const personCards = people.map(p => card(`<img src="${esc(base + p.photo.src)}" class="face" alt="">`, (p.photo.personName || "?") + " · CIK " + p.cik,
  (p.owner_name ? "filed as " + p.owner_name : "no imported filing") + (p.ticker ? " at " + p.ticker : "") + " · " + (p.photo.source || "") + " · " + (p.photo.sourceUrl || ""), flagsFor(p)));
const logoHtml = logoCards.map(l => card(Object.values(l.logo.variants || {}).map(v => `<img src="${esc(base + v.url)}" class="logo" alt="">`).join(""),
  (l.logo.ticker || "") + " · CIK " + l.cik, (l.name ? l.name + " · " : "") + Object.values(l.logo.variants || {}).map(v => v.source + " " + (v.sourceUrl || "")).join(" | "), l.flags));
const flagged = personCards.filter(c => c.includes('class="c bad"')).length + logoCards.filter(l => l.flags.length).length;

writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Insidir media audit</title>
<style>body{margin:0;padding:16px;background:#0c0c0b;color:#e9e4da;font:12px/1.4 ui-monospace,monospace}h2{margin:24px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.c{border:1px solid #2f2f2c;padding:10px;display:flex;flex-direction:column;gap:4px;word-break:break-word}
.c.bad{border-color:#f94144}.i{display:flex;gap:10px;align-items:center;min-height:90px}.face{width:84px;height:84px;object-fit:cover;border-radius:50%}.logo{max-height:56px;max-width:200px}
small{color:#9e9b94}em{color:#f94144;font-style:normal}</style>
<h1>Media audit</h1><p>${people.length} person photos, ${logoCards.length} logos, ${flagged} flagged (red). Check every card: a picture must be that person or that company.</p>
<h2>People</h2><div class="g">${personCards.join("")}</div><h2>Logos</h2><div class="g">${logoHtml.join("")}</div>`);
console.log(`wrote ${out}: ${people.length} photos, ${logoCards.length} logos, ${flagged} flagged`);
await pool.end();

#!/usr/bin/env node
/* Before/after screenshot comparison, to check that a visual change keeps Insidir's identity.
 *
 *   node scripts/compare-shots.mjs <beforeDir> <afterDir> <outDir> [--crop=2400]
 *
 * For every PNG present in both folders (e.g. the full-page shots v13-palette-audit.mjs --shots writes) it reports:
 *   - height before/after (a page that grew or shrank a lot changed its layout);
 *   - the share of pixels that differ by more than 24/255 on any channel, over the common top --crop pixels;
 *   - the mean colour of each shot (identity drift: the palette should not move);
 * and writes <outDir>/<name>.png with before | after side by side (top --crop pixels, half size). */
import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [before, after, out] = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!before || !after || !out) { console.error("usage: compare-shots.mjs <beforeDir> <afterDir> <outDir> [--crop=2400]"); process.exit(2); }
const crop = Number((process.argv.find(a => a.startsWith("--crop=")) || "--crop=2400").slice(7));
mkdirSync(out, { recursive: true });
const names = readdirSync(before).filter(f => f.endsWith(".png") && readdirSync(after).includes(f)).sort();
const rows = [];
for (const name of names) {
  const [a, b] = [join(before, name), join(after, name)];
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const w = Math.min(ma.width, mb.width), h = Math.min(crop, ma.height, mb.height);
  const raw = p => sharp(p).extract({ left: 0, top: 0, width: w, height: h }).removeAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  let diff = 0; const mean = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < ra.length; i += 3) {
    if (Math.abs(ra[i] - rb[i]) > 24 || Math.abs(ra[i + 1] - rb[i + 1]) > 24 || Math.abs(ra[i + 2] - rb[i + 2]) > 24) diff++;
    for (let c = 0; c < 3; c++) { mean[0][c] += ra[i + c]; mean[1][c] += rb[i + c]; }
  }
  const px = ra.length / 3, hex = m => "#" + m.map(v => Math.round(v / px).toString(16).padStart(2, "0")).join("");
  rows.push({ name, heightBefore: ma.height, heightAfter: mb.height, changedPct: +(100 * diff / px).toFixed(2), meanBefore: hex(mean[0]), meanAfter: hex(mean[1]) });
  const half = Math.round(w / 2), hh = Math.round(h / 2);
  const [ta, tb] = await Promise.all([a, b].map(p => sharp(p).extract({ left: 0, top: 0, width: w, height: h }).resize(half, hh).png().toBuffer()));
  await sharp({ create: { width: half * 2 + 12, height: hh, channels: 3, background: "#e9e4da" } })
    .composite([{ input: ta, left: 0, top: 0 }, { input: tb, left: half + 12, top: 0 }]).png().toFile(join(out, name));
}
for (const r of rows) console.log(`${r.name.padEnd(38)} changed ${String(r.changedPct).padStart(6)}%  height ${r.heightBefore} → ${r.heightAfter}  mean ${r.meanBefore} → ${r.meanAfter}`);

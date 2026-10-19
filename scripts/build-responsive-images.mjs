#!/usr/bin/env node
/* Responsive variants of the product screenshots (web/assets/img/product/*.webp): WebP and AVIF at 720, 1080, 1440
 * and 1920 px wide (never wider than the original, which stays as the largest WebP). The pages reference them with
 * srcset/sizes, so a phone downloads a 720 or 1080 px image (2x and 3x screens) and a 4K or Retina screen the full-size original.
 * Idempotent: a variant newer than its original is kept.
 *
 *   node scripts/build-responsive-images.mjs [--force] */
import sharp from "sharp";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("../web/assets/img/product/", import.meta.url).pathname;
const WIDTHS = [720, 1080, 1440, 1920];
const force = process.argv.includes("--force");
const originals = readdirSync(DIR).filter(f => /^[a-z-]+\.webp$/.test(f));
for (const file of originals) {
  const src = join(DIR, file), name = file.replace(/\.webp$/, "");
  const { width } = await sharp(src).metadata();
  const out = [];
  for (const w of [...WIDTHS.filter(w => w < width), width]) {
    for (const ext of ["webp", "avif"]) {
      if (w === width && ext === "webp") continue; // the original is the full-size WebP
      const dest = join(DIR, `${name}-${w}.${ext}`);
      if (!force && existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) { out.push(`${w}.${ext}=kept`); continue; }
      const img = sharp(src).resize({ width: w, withoutEnlargement: true });
      await (ext === "webp" ? img.webp({ quality: 82, effort: 6, smartSubsample: true }) : img.avif({ quality: 58, effort: 6 })).toFile(dest);
      out.push(`${w}.${ext}=${Math.round(statSync(dest).size / 1024)}KB`);
    }
  }
  console.log(`${file} (${width}px, ${Math.round(statSync(src).size / 1024)}KB): ${out.join(" ")}`);
}

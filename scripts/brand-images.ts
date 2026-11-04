/* Pre-generates every brand photo (public/brand/*.jpg, 6144px masters; lib/brand/images.ts) as AVIF and WebP at 1920,
 * 2880 and 3840 wide, so the full-bleed stages never wait on the image optimizer and nothing is ever built above 3840
 * (components/brand/BrandPicture.tsx serves them). Runs before `next build`; a file is only re-encoded when its master
 * is newer. Output: public/brand/gen/<photo>-<width>.<avif|webp> (not committed: built where the site is built).
 *   npx tsx scripts/brand-images.ts */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";
import sharp from "sharp";
import { BRAND_WIDTHS } from "../lib/brand/picture";

const SRC = "public/brand", OUT = join(SRC, "gen");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const masters = readdirSync(SRC).filter(f => f.endsWith(".jpg") && !f.startsWith("email-"));
  // Every file that is missing or older than its master, encoded a few at a time.
  const jobs: Array<() => Promise<void>> = [];
  for (const f of masters) {
    const name = f.replace(/\.jpg$/, ""), master = join(SRC, f), mtime = statSync(master).mtimeMs;
    for (const w of BRAND_WIDTHS) {
      for (const fmt of ["avif", "webp"] as const) {
        const out = join(OUT, `${name}-${w}.${fmt}`);
        if (existsSync(out) && statSync(out).mtimeMs >= mtime) continue;
        jobs.push(async () => {
          const img = sharp(master).resize({ width: w, withoutEnlargement: true });
          await (fmt === "avif" ? img.avif({ quality: 55, effort: 2 }) : img.webp({ quality: 78, effort: 4 })).toFile(out);
        });
      }
    }
  }
  const made = jobs.length;
  const run = async () => { for (let j = jobs.shift(); j; j = jobs.shift()) await j(); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, cpus().length)) }, run));
  console.log(`brand images: ${made} written, ${masters.length * BRAND_WIDTHS.length * 2 - made} up to date`);
}

main().catch(e => { console.error(e); process.exit(1); });

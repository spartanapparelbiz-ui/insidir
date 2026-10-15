// Prepares everything the compositions read from public/, from the repository's own brand files:
//   fonts   web/assets/fonts  -> public/fonts      (JetBrains Mono, Source Serif 4; SIL OFL)
//   mark    web/assets/icons/favicon.svg -> public/brand/mark.svg
//   grain   four tiles of print grain   -> public/brand/grain-N.png
//   photos  web/assets/img/*.jpg (or a 4x super-resolved copy from tools/upscale, if given)
//           -> public/photos, graded like the site: grayscale(1) sepia(.12) contrast(1.05)
// Usage: node tools/prepare-assets.mjs [--sr DIR]   (DIR holds upscale.py output PNGs by photo name)
import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = join(root, "../web/assets");
const pub = join(root, "public");

// The photographs the scripts use, and the long edge they are stored at (enough for a camera push).
export const PHOTOS = {
  "hero": 3200, "records-left": 3200, "records-right": 3000, "informed-left": 3000, "informed-right": 3000,
  "pricing-left": 3000, "pricing-right": 3000, "lens-sec": 2800, "lens-insider": 2800, "lens-company": 2800,
  "moves-wallst": 3000, "moves-people": 3000, "research-search": 2800, "research-discover": 2800, "research-alerts": 2800,
  "signin": 3000, "signup": 3000, "cta-bg": 3200
};

/** CSS filter `grayscale(1) sepia(.12) contrast(1.05)` as one colour matrix plus offset (sRGB, like the browser). */
function brandGrade() {
  const g = [0.2126, 0.7152, 0.0722];
  const a = 0.12, k = 1 - a;
  const sepia = [
    [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
    [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
    [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]
  ];
  const c = 1.05;
  // grayscale first (every row = g), then sepia, then contrast around mid-grey.
  const rows = sepia.map(row => { const s = row[0] + row[1] + row[2]; return g.map(w => w * s * c); });
  return { matrix: rows, offset: (0.5 - 0.5 * c) * 255 };
}

async function grainTile(path, seed) {
  // Fractal-ish noise: two octaves of white noise, the coarse one upsampled, mean grey.
  const w = 1080, h = 1920;
  let s = seed * 2654435761 >>> 0;
  const rnd = () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) / 4294967296);
  const coarse = Buffer.alloc((w / 2) * (h / 2));
  for (let i = 0; i < coarse.length; i++) coarse[i] = Math.round(rnd() * 255);
  const up = await sharp(coarse, { raw: { width: w / 2, height: h / 2, channels: 1 } }).resize(w, h, { kernel: "cubic" }).raw().toBuffer();
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(128 + (up[i] - 128) * 0.55 + (rnd() * 255 - 128) * 0.6)));
  await sharp(out, { raw: { width: w, height: h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path);
}

async function main() {
  const srIndex = process.argv.indexOf("--sr");
  const srDir = srIndex > 0 ? process.argv[srIndex + 1] : null;
  for (const dir of ["fonts", "brand", "photos", "screens", "audio"]) await mkdir(join(pub, dir), { recursive: true });

  for (const f of ["JetBrainsMono-normal-latin.woff2", "JetBrainsMono-normal-latin-ext.woff2", "JetBrainsMono-symbols.woff2", "SourceSerif4-normal-latin.woff2", "SourceSerif4-normal-latin-ext.woff2", "OFL.txt"]) {
    await copyFile(join(web, "fonts", f), join(pub, "fonts", f));
  }
  await copyFile(join(web, "icons/favicon.svg"), join(pub, "brand/mark.svg"));
  for (let i = 0; i < 4; i++) if (!existsSync(join(pub, `brand/grain-${i}.png`))) await grainTile(join(pub, `brand/grain-${i}.png`), i + 1);

  const { matrix, offset } = brandGrade();
  for (const [name, longEdge] of Object.entries(PHOTOS)) {
    const original = join(web, "img", `${name}.jpg`);
    const sr = srDir ? join(srDir, `${name}.png`) : null;
    const src = sr && existsSync(sr) ? sr : original;
    const out = join(pub, "photos", `${name}.jpg`);
    await sharp(src)
      .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .recomb(matrix)
      .linear(1, offset)
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toFile(out);
    const meta = await sharp(out).metadata();
    console.log(`${name.padEnd(18)} ${src === original ? "original" : "4x SR   "} -> ${meta.width}x${meta.height}  ${((await stat(out)).size / 1024).toFixed(0)} KB`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

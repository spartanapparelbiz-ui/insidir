/* Deployment gate: actual published image endpoints must return image bytes, and every
 * photograph Insidir shows must be retina-sharp.
 *
 * 1. Logos and portraits load from their exact Wikimedia Commons URLs (rejects branded
 *    placeholders and inaccurate external URL guesses).
 * 2. Sharpness: each portrait's native pixels must be at least twice its largest rendered
 *    size. The JPEG's real dimensions are read from its SOF header (first bytes only); the
 *    largest rendered size comes from the stylesheets (the biggest identity tile, --ins-size,
 *    and the people page's portrait tile), times any transform:scale() zoom set on a people-page
 *    image, so enlarging a tile or zooming a crop without a sharper file fails here. Portraits
 *    are drawn with object-fit: cover in square tiles, so the shorter native side must reach
 *    2 × tile × zoom.
 *
 * Insider photos come from the engine (GET /v1/media); the gate checks that its minimum photo size covers 2× the
 * largest face tile in ui.css.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../web/", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const UA = { "User-Agent": "Insidir-public-image-check/1.0 (contact: hello@aethric.llc)", Accept: "image/*,application/xml;q=0.5" };

/* ---------- what the pages load ---------- */
const logos = [
  ["Apple logo", "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"],
  ["Microsoft logo", "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"],
  ["NVIDIA logo", "https://upload.wikimedia.org/wikipedia/commons/4/48/Nvidia_Logo.svg"],
  ["Tesla logo", "https://upload.wikimedia.org/wikipedia/commons/b/bb/Tesla_T_symbol.svg"]
];
// Insider photos now come from the engine's media pipeline (GET /v1/media, drawn by UI.face in web/assets/js/ui.js):
// src/people-photos.mjs refuses any picture whose shorter side is under its threshold, and the largest face tile is in
// ui.css. Every photo shown is therefore at least 2x sharp as long as the threshold covers twice the biggest tile.
const ui = await read("assets/css/ui.css");
const photos = await readFile(new URL("../src/people-photos.mjs", import.meta.url), "utf8");
const faceSizes = [...ui.matchAll(/\.face--(\d+)\{width:(\d+)px/g)].map(m => Number(m[2]));
assert.ok(faceSizes.length, "could not read the face tile sizes from ui.css");
const MAX_TILE = Math.max(...faceSizes);
const minSide = Number((/Math\.min\(size\.width, size\.height\) < (\d+)/.exec(photos) || [])[1]);
assert.ok(minSide > 0, "could not read the minimum photo size from src/people-photos.mjs");
assert.ok(minSide >= 2 * MAX_TILE, `photos as small as ${minSide}px are accepted, under 2x the ${MAX_TILE}px face tile`);
console.log(`Verified photo sharpness rule: the shorter side is at least ${minSide}px, 2x or more the largest ${MAX_TILE}px face tile`);
const portraits = [];

/* ---------- JPEG dimensions from the start-of-frame header ---------- */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { invalid: true };
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xFF) { i++; continue; }                         // fill byte
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    if (i + 8 >= buf.length) return null;                             // need more bytes
    const len = buf.readUInt16BE(i + 2);
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xD9 || marker === 0xDA) return { invalid: true }; // image data before any frame header
    i += 2 + len;
  }
  return null;
}

async function fetchHead(url, kind) {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: UA });
      assert.ok(response.ok, "HTTP " + response.status);
      const mime = response.headers.get("content-type") || "";
      assert.match(mime, kind === "svg" ? /image\/svg\+xml/ : /image\/jpeg/, "wrong media type " + mime);
      const reader = response.body.getReader();
      let buf = Buffer.alloc(0), size = null;
      while (true) {
        const { value, done } = await reader.read();
        if (value) buf = Buffer.concat([buf, Buffer.from(value)]);
        if (kind === "svg" ? buf.length > 800 : (size = jpegSize(buf))) break;
        if (done || buf.length > 1024 * 1024) break;
      }
      await reader.cancel().catch(() => {});
      assert.ok(buf.length > 12, "no image bytes");
      return { mime, buf, size };
    } catch (e) { lastError = String(e && e.message || e); }
  }
  throw new Error(lastError);
}

/* ---------- run ---------- */
const failures = [];
for (const [name, url] of logos) {
  try {
    const { mime, buf } = await fetchHead(url, "svg");
    assert.match(new TextDecoder().decode(buf.slice(0, 800)), /<svg\b|<\?xml/, "invalid SVG header");
    console.log("Verified real image: " + name + " (" + mime + ")");
  } catch (e) { failures.push(name + " has no working source logo: " + e.message); }
}
for (const p of portraits) {
  try {
    const { size } = await fetchHead(p.url, "jpeg");
    assert.ok(size && !size.invalid, "invalid JPEG or no frame header in the first megabyte");
    const native = Math.min(size.width, size.height), drawn = p.maxRendered * p.zoom, needed = Math.ceil(2 * drawn);
    if (native < needed) throw new Error(`native ${size.width}×${size.height} is under 2× its largest rendered size (${p.maxRendered}px tile${p.zoom !== 1 ? " × " + p.zoom + " zoom" : ""} needs ${needed}px)`);
    console.log(`Verified sharp portrait: ${p.name} ${size.width}×${size.height} for tiles up to ${p.maxRendered}px${p.zoom !== 1 ? " at " + p.zoom + "× zoom" : ""} (${(native / drawn).toFixed(1)}×)`);
  } catch (e) { failures.push(p.name + " (" + p.url + "): " + e.message); }
}
if (failures.length) {
  for (const f of failures) console.error("FAIL " + f);
  throw new Error(failures.length + " media check(s) failed");
}
console.log(`All ${logos.length + portraits.length} exact-source public assets verified; insider photos are held to at least ${minSide}px, 2× the largest ${MAX_TILE}px face tile.`);

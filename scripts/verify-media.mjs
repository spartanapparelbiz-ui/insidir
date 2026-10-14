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
 * Portrait URLs are read from web/assets/js/entity-media.js and web/people.html, so this list
 * cannot drift from what the pages actually load.
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
const identity = await read("assets/js/entity-media.js");
const people = await read("people.html");
const app = await read("assets/css/v13-app.css");
const legacy = await read("assets/css/entity-media.css");

// Largest square identity tile on any page (portraits are drawn into these with object-fit: cover).
const tileSizes = [...(app + legacy).matchAll(/--ins-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
const knownTile = Number((/\.v10-known__photo\{[^}]*?width:(\d+)px/.exec(app) || [])[1]);
assert.ok(tileSizes.length && knownTile > 0, "could not read the rendered portrait sizes from the stylesheets");
const MAX_TILE = Math.max(...tileSizes, knownTile);

const portraits = [];
for (const m of identity.matchAll(/"([a-z-]+)":\{name:"([^"]+)",src:"([^"]+)",\s*thumb:"([^"]+)"/g)) {
  portraits.push({ name: m[2] + " (identity tile)", url: m[4], maxRendered: MAX_TILE, zoom: 1 });
}
// Familiar faces on people.html: <img data-real-image src="…" … style="…transform:scale(z)…"> … <strong>Name</strong>
for (const m of people.matchAll(/<img data-real-image src="(https:\/\/upload\.wikimedia\.org\/[^"]+\.jpe?g)"([^>]*)>[\s\S]*?<strong>([^<]+)<\/strong>/g)) {
  const zoom = Number((/transform:scale\(([\d.]+)\)/.exec(m[2]) || [])[1]) || 1;
  portraits.push({ name: m[3] + " (people page)", url: m[1], maxRendered: knownTile, zoom });
}
assert.ok(portraits.length >= 8, "expected the four curated portraits in entity-media.js and people.html, found " + portraits.length);
for (const p of portraits) assert.match(p.url, /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//, p.name + ": portraits must come from Wikimedia Commons");

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
console.log(`All ${logos.length + portraits.length} exact-source public assets verified; every portrait is at least 2× its largest rendered size (${MAX_TILE}px identity tile, ${knownTile}px people-page tile).`);

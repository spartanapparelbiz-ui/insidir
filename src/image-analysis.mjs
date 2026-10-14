/* Pixel-level checks and preparation for logos and portraits (sharp/libvips).
 * Logo metrics follow the measured rules from the source research:
 *  - boxed: the 1px border is mostly opaque and one flat colour (a tile baked into the file)
 *  - visible: share of ink pixels with WCAG contrast >= 2 against the page background
 *  - badge: light text inside the mark's own dark shape (counts as visible)
 *  - shape: 48x48 ink mask for cross-source agreement (IoU >= 0.5 confirms the same mark)
 * Preparation removes boxes, lifts dark ink that would vanish on the dark page and trims,
 * so no logo is ever shown inside a tile. */
import sharp from "sharp";

export const PAGE_BG = Object.freeze([10, 14, 19]);
const MAX_PIXELS = 4096 * 4096;
sharp.cache(false);

const channel = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export const luminance = (r, g, b) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
export const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
const BG_LUM = luminance(...PAGE_BG);

/* librsvg must never resolve external entities or fetch anything. */
export function sanitizeSvg(bytes) {
  // The text is re-encoded as UTF-8, so a declaration naming another encoding (utf-16) must go too.
  return Buffer.from(Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "").replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "").replace(/<!ENTITY[\s\S]*?>/gi, ""), "utf8");
}
function input(bytes, type) {
  if (type === "svg") return sharp(sanitizeSvg(bytes), { density: 300, limitInputPixels: MAX_PIXELS });
  return sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: false, failOn: "error" });
}

/* RGBA pixels fitted inside size x size (aspect kept). */
export async function rasterize(bytes, type, size = 256) {
  const { data, info } = await input(bytes, type).resize({ width: size, height: size, fit: "inside", withoutEnlargement: type !== "svg" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

function border(px, w, h) {
  const idx = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  return idx;
}
export function borderStats(px, w, h) {
  const ring = border(px, w, h), opaque = ring.filter(i => px[i * 4 + 3] > 128);
  if (!opaque.length) return { opaqueShare: 0, color: null, std: 0 };
  const mean = [0, 1, 2].map(c => opaque.reduce((s, i) => s + px[i * 4 + c], 0) / opaque.length);
  const std = [0, 1, 2].map(c => Math.sqrt(opaque.reduce((s, i) => s + (px[i * 4 + c] - mean[c]) ** 2, 0) / opaque.length));
  return { opaqueShare: opaque.length / ring.length, color: mean, std: (std[0] + std[1] + std[2]) / 3 };
}

/* Ink: opaque pixels, or for a boxed image the pixels that differ from the box colour. */
function inkMask(px, w, h, box) {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] <= 128) continue;
    if (box) {
      const d = Math.abs(px[i * 4] - box[0]) + Math.abs(px[i * 4 + 1] - box[1]) + Math.abs(px[i * 4 + 2] - box[2]);
      if (d <= 60) continue;
    }
    ink[i] = 1;
  }
  return ink;
}
function bounds(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/* Ink cropped to its box, centred on a square and sampled to 48x48. */
export function shapeOf(mask, w, h, box = bounds(mask, w, h), size = 48) {
  const out = new Uint8Array(size * size);
  if (!box) return out;
  const side = Math.max(box.w, box.h), ox = box.x - (side - box.w) / 2, oy = box.y - (side - box.h) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor(ox + (x + .5) * side / size), sy = Math.floor(oy + (y + .5) * side / size);
    if (sx >= 0 && sy >= 0 && sx < w && sy < h && mask[sy * w + sx]) out[y * size + x] = 1;
  }
  return out;
}
export function iou(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) both++; if (a[i] || b[i]) either++; }
  return either ? both / either : 0;
}

export function measureRaster({ data: px, width: w, height: h }) {
  const edge = borderStats(px, w, h);
  const boxed = edge.opaqueShare > .5 && edge.std < 25;
  const ink = inkMask(px, w, h, boxed ? edge.color : null);
  let inkCount = 0, visibleCount = 0, brightOnDark = 0;
  const colors = new Set();
  for (let i = 0; i < w * h; i++) {
    if (!ink[i]) continue;
    inkCount++;
    const L = luminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    const c = contrast(L, BG_LUM);
    if (c >= 2) visibleCount++;
    if (c >= 4.5) brightOnDark++;
    if (colors.size < 300) colors.add((px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | px[i * 4 + 2] >> 4);
  }
  const box = bounds(ink, w, h);
  // A badge: light text sitting inside the mark's own dark fill (e.g. white letters on navy).
  let badge = false;
  if (!boxed && inkCount && brightOnDark / inkCount >= .1 && visibleCount / inkCount < .5) {
    let enclosed = 0, light = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!ink[i] || contrast(luminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), BG_LUM) < 4.5) continue;
      light++;
      if (ink[i - 1] && ink[i + 1] && ink[i - w] && ink[i + w]) enclosed++;
    }
    badge = light > 0 && enclosed / light > .6;
  }
  const photoLike = (edge.opaqueShare > .5 && edge.std > 25 && colors.size > 64);
  return {
    width: w, height: h, boxed, boxColor: boxed ? edge.color.map(Math.round) : null,
    visible: inkCount ? visibleCount / inkCount : 0, badge, inkFrac: inkCount / (w * h), photoLike,
    aspect: box ? box.w / box.h : 1, shape: shapeOf(ink, w, h, box)
  };
}
export async function measure(bytes, type) {
  return measureRaster(await rasterize(bytes, type, 256));
}

/* ---------- logo preparation ---------- */
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l, l, l];
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/* Key out a baked-in tile: the border colour becomes transparent everywhere, with the
 * anti-aliased fringe unmixed so no light halo is left around the mark. */
export function debox(px, w, h, color) {
  let kept = 0;
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const d = Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]);
    if (d <= 40) { px[i * 4 + 3] = 0; continue; }
    if (d < 120) {
      const a = (d - 40) / 80; // fringe: estimate coverage and unmix the box colour
      for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, Math.round((px[i * 4 + c] - color[c] * (1 - a)) / a)));
      px[i * 4 + 3] = Math.round(px[i * 4 + 3] * a);
    }
    if (px[i * 4 + 3] > 128) kept++;
  }
  return kept / (w * h);
}
/* Ink that would vanish on the page: near-neutral becomes off-white, coloured keeps its hue at
 * a readable lightness. Only ink reachable from transparency is changed, so dark details inside
 * a light part of the mark stay as drawn. Returns the share of ink changed. */
export function liftDark(px, w, h) {
  const n = w * h, dark = new Uint8Array(n), exposed = new Uint8Array(n), stack = [];
  let ink = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] <= 24) { exposed[i] = 1; stack.push(i); continue; }
    ink++;
    if (contrast(luminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), BG_LUM) < 3) dark[i] = 1;
  }
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i - x) / w;
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && dark[i] && !exposed[i]) { exposed[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !exposed[j] && dark[j]) { exposed[j] = 1; stack.push(j); }
    }
  }
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (!dark[i] || !exposed[i]) continue;
    const [hh, ss, ll] = rgbToHsl(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255);
    let rgb;
    if (ss < .22) rgb = [242 / 255, 244 / 255, 247 / 255];
    else {
      let L = Math.max(ll, .5);
      for (; L < .92; L += .02) { rgb = hslToRgb(hh, ss, L); if (contrast(luminance(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255), BG_LUM) >= 4.5) break; }
      rgb = hslToRgb(hh, ss, L);
    }
    px[i * 4] = Math.round(rgb[0] * 255); px[i * 4 + 1] = Math.round(rgb[1] * 255); px[i * 4 + 2] = Math.round(rgb[2] * 255);
    changed++;
  }
  return ink ? changed / ink : 0;
}

/* Returns a transparent PNG ready to place directly on the dark page, or null if the image
 * holds no usable mark (empty, photographic, or nothing left after removing a box). */
export async function prepareLogo(bytes, type) {
  const r = await rasterize(bytes, type, 512);
  const m = measureRaster(r);
  if (m.photoLike) return null;
  const px = new Uint8ClampedArray(r.data); // own copy
  let method = "asis";
  if (m.boxed) {
    if (debox(px, r.width, r.height, m.boxColor) < .02) return null;
    method = "debox";
  }
  if (!m.badge) {
    const lifted = liftDark(px, r.width, r.height);
    if (lifted > 0) method = method === "debox" ? "debox+lift" : lifted > .9 ? "recolor" : "lift";
  }
  const alpha = new Uint8Array(r.width * r.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3] > 16 ? 1 : 0;
  const box = bounds(alpha, r.width, r.height);
  if (!box || box.w * box.h < 64) return null;
  const pad = Math.round(Math.max(box.w, box.h) * .04);
  const png = await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: r.width, height: r.height, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false }).toBuffer();
  return { bytes: png, type: "png", width: box.w + pad * 2, height: box.h + pad * 2, aspect: box.w / box.h, method, measured: { ...m, shape: undefined } };
}

/* ---------- portraits ---------- */
/* A square, face-weighted crop. A small inset removes rings or discs baked into proxy headshots. */
/* Square avatar crop. A thin margin is dropped on the sides and bottom (frames and borders in
 * proxy headshots) but never at the top, where the head is. Portrait pictures are cut to a square
 * from near the top, so the forehead and hair stay in; landscape pictures keep their full height
 * and slide sideways to the most salient part. */
export async function preparePhoto(bytes, type, size = 256) {
  const { data, info } = await input(bytes, type).rotate().png().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) throw new Error("Unreadable image");
  const side = .03;
  const left = Math.round(info.width * side), width = Math.max(1, info.width - left * 2);
  let top = 0, height = Math.max(1, info.height - Math.round(info.height * side));
  let image = sharp(data);
  if (height > width) {
    top = Math.min(height - width, Math.round(height * .03));
    height = width;
    image = image.extract({ left, top, width, height }).resize({ width: size, height: size });
  } else {
    image = image.extract({ left, top, width, height }).resize({ width: size, height: size, fit: "cover", position: sharp.strategy.attention });
  }
  const out = await image.flatten({ background: { r: 24, g: 30, b: 38 } }).webp({ quality: 82 }).toBuffer();
  return { bytes: out, type: "webp", width: size, height: size };
}

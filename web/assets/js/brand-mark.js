/* Prepares company logos for display directly on a page background, with no tile or box.
 * Logos arrive in many shapes: transparent marks, marks baked onto a white or colored square,
 * and dark marks drawn for light pages. In the browser, from same-origin bytes, this:
 *  1. removes a uniform background that touches the image border (flood fill from the edges),
 *  2. trims empty margins so every mark sits on the same baseline,
 *  3. lifts colors that would vanish on the page background: near-black/gray turns white,
 *     dark brand colors keep their hue at a readable lightness.
 * The mark itself is never redrawn or substituted. */
(() => {
"use strict";
const cache = new Map();
const MAX = 320;

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
const lum = (r, g, b) => {
  const c = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  return .2126 * c(r) + .7152 * c(g) + .0722 * c(b);
};
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

/* A logo baked onto a solid square (white, black or brand color) is two-tone: the box color
 * and the mark. When the whole border is one opaque color, that color is keyed out everywhere,
 * so letter counters and holes inside the mark open up too. Full-bleed pictures are left alone. */
function removeBackground(px, w, h) {
  const ring = [];
  for (let x = 0; x < w; x++) ring.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) ring.push(y * w, y * w + w - 1);
  let opaque = 0, r = 0, g = 0, b = 0;
  for (const i of ring) if (px[i * 4 + 3] > 200) { opaque++; r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; }
  if (opaque < ring.length * .8) return false; // already transparent around the mark
  r /= opaque; g /= opaque; b /= opaque;
  const dist = i => Math.hypot(px[i * 4] - r, px[i * 4 + 1] - g, px[i * 4 + 2] - b);
  if (ring.filter(i => px[i * 4 + 3] > 200 && dist(i) < 40).length < ring.length * .75) return false;
  let kept = 0;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = dist(i);
    alpha[i] = d < 30 ? 0 : Math.round(px[i * 4 + 3] * Math.min(1, (d - 30) / 50));
    if (alpha[i] > 24) kept++;
  }
  if (kept < w * h * .01) return false; // nothing but box: not a logo on a background
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = alpha[i];
  return true;
}

/* Recolor only dark pixels that touch the page background (reachable from transparency).
 * Dark details enclosed by a light part of the mark (a black plus inside a white badge)
 * already contrast with their surroundings and stay as drawn. */
function liftDarkPixels(px, w, h, bgLum) {
  const n = w * h, dark = new Uint8Array(n), exposed = new Uint8Array(n), stack = [];
  let visible = 0;
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    if (a <= 24) { exposed[i] = 1; stack.push(i); continue; }
    visible++;
    if (contrast(lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), bgLum) < 2.6) dark[i] = 1;
  }
  // The canvas edge counts as page background too.
  for (let x = 0; x < w; x++) for (const i of [x, (h - 1) * w + x]) if (dark[i] && !exposed[i]) { exposed[i] = 1; stack.push(i); }
  for (let y = 0; y < h; y++) for (const i of [y * w, y * w + w - 1]) if (dark[i] && !exposed[i]) { exposed[i] = 1; stack.push(i); }
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
    const [nr, ng, nb] = ss < .22 ? [.95, .955, .965] : hslToRgb(hh, Math.min(1, ss), Math.max(ll, .64));
    px[i * 4] = Math.round(nr * 255); px[i * 4 + 1] = Math.round(ng * 255); px[i * 4 + 2] = Math.round(nb * 255);
    changed++;
  }
  return visible ? changed / visible : 0;
}

function trim(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    if (!/^(data:|\/|assets\/)/.test(src) && new URL(src, location.href).origin !== location.origin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo image failed to load"));
    img.src = src;
  });
}

async function process(src, background) {
  const img = await load(src);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { w = 256; h = 256; } // SVG without intrinsic size
  const scale = Math.min(1, MAX / Math.max(w, h)) || 1;
  const cw = Math.max(1, Math.round(w * scale * (w < 96 ? 2 : 1))), ch = Math.max(1, Math.round(h * scale * (w < 96 ? 2 : 1)));
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch), px = data.data;
  const boxed = removeBackground(px, cw, ch);
  const bg = background.match(/\d+/g).map(Number);
  const lifted = liftDarkPixels(px, cw, ch, lum(bg[0], bg[1], bg[2]));
  const box = trim(px, cw, ch);
  if (!box || box.w < 4 || box.h < 4) throw new Error("Logo has no visible mark");
  ctx.putImageData(data, 0, 0);
  const out = document.createElement("canvas");
  out.width = box.w; out.height = box.h;
  out.getContext("2d").drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { url: out.toDataURL("image/png"), ratio: box.w / box.h, boxed, lifted };
}

/* A logo the server already prepared (/v1/company/logo: tile removed, dark ink lifted, trimmed)
 * is shown exactly as delivered; recoloring it again could erase a detail the server chose to
 * keep, such as a white plus inside a dark badge. Only its shape is measured. */
async function measure(src) {
  const img = await load(src);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error("Logo has no size");
  return { url: img.currentSrc || img.src, ratio: w / h, boxed: false, lifted: 0 };
}

/* Resolves to {url, ratio} for display, or null when no usable logo exists. */
function prepare(src, { background = "rgb(10,14,19)", prepared = false } = {}) {
  const key = src + "|" + background + "|" + prepared;
  if (!cache.has(key)) cache.set(key, (prepared ? measure(src) : process(src, background)).catch(() => null));
  return cache.get(key);
}
window.InsidirBrand = Object.freeze({ prepare });
})();

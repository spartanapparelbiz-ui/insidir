/* The four treatments, drawn with sharp (server only; the art job runs them on Railway):
 *   photoSquare  a tracker's photo, square, natural colour
 *   duotone      a person's photo, square on the face: greyscale, autocontrast, black → their colour, white → a pale tint
 *   markArt      a logo in white, centred at 60%, on its brand colour; full colour on white when white would lose it
 *   teamArt      a team's logo, centred at 64%, on its colour; on white when it vanishes into that colour
 *   flagArt      a country's flag, centred on white
 * Squares are 2048px when the source allows (vector logos always), else the source's own size: never upscaled.
 * encodeLadder writes AVIF and WebP at 2048/1024/512/256/128, as far down from the square's size as there are. */
import sharp, { type Sharp, type OverlayOptions } from "sharp";

export const LADDER = [2048, 1024, 512, 256, 128] as const;
export const MAX = 2048;
const WHITE = "#FFFFFF";

/* ---------- colour ---------- */
export const hexToRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace("#", "").slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
/** a mixed toward b by t (0–1). */
export const mix = (a: string, b: string, t: number) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

/** The most common colour of an image (sharp's histogram), for the placeholder and the field around a logo. */
export async function dominant(buf: Buffer): Promise<string> {
  const { dominant: d } = await sharp(buf).stats();
  return rgbToHex(d.r, d.g, d.b);
}

/* ---------- photos ---------- */
/** The largest square around a focal point (0–1 of width and height), at most MAX, never bigger than the source. */
async function squareAround(buf: Buffer, fx: number, fy: number): Promise<{ img: Sharp; n: number }> {
  const img = sharp(buf).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  const s = Math.min(width, height);
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.round(v)));
  const left = clamp(fx * width - s / 2, width - s), top = clamp(fy * height - s / 2, height - s);
  const n = Math.min(MAX, s);
  return { img: sharp(buf).rotate().extract({ left, top, width: s, height: s }).resize(n, n), n };
}

export async function photoSquare(buf: Buffer, fx = 0.5, fy = 0.5): Promise<{ png: Buffer; n: number; colour: string }> {
  const { img, n } = await squareAround(buf, fx, fy);
  const png = await img.png().toBuffer();
  return { png, n, colour: await dominant(png) };
}

/** Black → colour, white → a pale tint of it, through the photo's greys (stretched to full range first). */
export async function duotone(buf: Buffer, colour: string, fx = 0.5, fy = 1 / 3): Promise<{ png: Buffer; n: number; colour: string; tint: string }> {
  const { img, n } = await squareAround(buf, fx, fy);
  const { data, info } = await img.greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const tint = mix(colour, WHITE, 0.86);
  const [d0, d1, d2] = hexToRgb(colour), [l0, l1, l2] = hexToRgb(tint);
  const ch = info.channels, px = info.width * info.height, out = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const g = data[i * ch]! / 255;
    out[i * 3] = d0 + (l0 - d0) * g; out[i * 3 + 1] = d1 + (l1 - d1) * g; out[i * 3 + 2] = d2 + (l2 - d2) * g;
  }
  const png = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  return { png, n, colour, tint };
}

/* ---------- logos ---------- */
export interface Raster { data: Buffer; w: number; h: number }
const isSvg = (buf: Buffer) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg/i.test(buf.subarray(0, 2048).toString("utf8"));

/** A logo as RGBA pixels, transparent margins trimmed, fitted inside box × box. A vector is drawn at that size; a
 *  bitmap is only ever made smaller. `vector` says which it was. */
export async function rasterLogo(buf: Buffer, box: number, trim = true): Promise<Raster & { vector: boolean }> {
  const vector = isSvg(buf);
  let img: Sharp;
  if (vector) {
    const { width = 100, height = 100 } = await sharp(buf, { density: 72 }).metadata();
    const density = Math.min(20000, Math.max(1, (72 * box * 1.25) / Math.max(width, height)));
    img = sharp(await sharp(buf, { density }).ensureAlpha().png().toBuffer());
  } else img = sharp(await sharp(buf).ensureAlpha().png().toBuffer());
  // Only transparent margins go: trimming by the corner's colour would cut a flag's or a boxed logo's own stripe.
  const trimmed = trim ? await img.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer().catch(() => img.png().toBuffer()) : await img.png().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().resize(box, box, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, vector };
}

/** How a logo reads: one colour or many, how much of it is near white, how solid its outline is. */
export function logoStats(r: Raster) {
  let opaque = 0, nearWhite = 0, minX = r.w, minY = r.h, maxX = 0, maxY = 0;
  let sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = (y * r.w + x) * 4;
    if (r.data[i + 3]! < 128) continue;
    opaque++;
    const R = r.data[i]!, G = r.data[i + 1]!, B = r.data[i + 2]!;
    if (Math.min(R, G, B) > 215) nearWhite++;
    sr += R; sg += G; sb += B; sr2 += R * R; sg2 += G * G; sb2 += B * B;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const o = Math.max(1, opaque), sd = Math.sqrt(Math.max(0, (sr2 / o - (sr / o) ** 2) + (sg2 / o - (sg / o) ** 2) + (sb2 / o - (sb / o) ** 2)));
  const bbox = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  return { opaque, mono: sd < 24, nearWhite: nearWhite / o, solidity: opaque / bbox, mean: rgbToHex(sr / o, sg / o, sb / o) };
}

/** The share of a logo's visible pixels that are close to a background colour: how much of it would vanish. */
export function vanishes(r: Raster, bg: string): number {
  const [b0, b1, b2] = hexToRgb(bg);
  let opaque = 0, close = 0, edge = 0, edgeClose = 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : r.data[(y * r.w + x) * 4 + 3]!);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = (y * r.w + x) * 4;
    if (r.data[i + 3]! < 128) continue;
    opaque++;
    const d = Math.hypot(r.data[i]! - b0, r.data[i + 1]! - b1, r.data[i + 2]! - b2);
    const near = d < 64;
    if (near) close++;
    // The outline: what draws the logo's shape against the field.
    if (at(x - 1, y) < 128 || at(x + 1, y) < 128 || at(x, y - 1) < 128 || at(x, y + 1) < 128) { edge++; if (near) edgeClose++; }
  }
  return Math.max(close / Math.max(1, opaque), edgeClose / Math.max(1, edge));
}

/** The logo's pixels as a white silhouette (its alpha kept). */
function whiteOf(r: Raster): Buffer {
  const out = Buffer.from(r.data);
  for (let i = 0; i < out.length; i += 4) { out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; }
  return out;
}

async function compose(n: number, bg: string, logo: Raster, pixels: Buffer): Promise<Buffer> {
  const layer = await sharp(pixels, { raw: { width: logo.w, height: logo.h, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: n, height: n, channels: 3, background: bg } })
    .composite([{ input: layer, left: Math.round((n - logo.w) / 2), top: Math.round((n - logo.h) / 2) }]).png().toBuffer();
}

/** The square's size for a logo at a scale: 2048 for a vector, a bitmap's own size over the scale, never more. */
async function fit(buf: Buffer, scale: number, trim = true): Promise<{ n: number; logo: Raster & { vector: boolean } }> {
  const logo = await rasterLogo(buf, Math.round(MAX * scale), trim);
  return { n: logo.vector ? MAX : Math.min(MAX, Math.floor(Math.max(logo.w, logo.h) / scale)), logo };
}

export type MarkTreatment = "mark" | "mark-white";
/** A company's, fund's or league's mark: white at 60% on its brand colour. A many-coloured logo whose shape would
 *  be lost as a white silhouette, or a brand colour too pale for white, goes full colour on white instead. */
export async function markArt(buf: Buffer, colour: string, scale = 0.6): Promise<{ png: Buffer; n: number; t: MarkTreatment; colour: string; why?: string }> {
  const { n, logo } = await fit(buf, scale);
  const st = logoStats(logo);
  let why: string | undefined;
  if (contrast(WHITE, colour) < 1.7) why = "brand colour too pale for a white mark";
  else if (!st.mono && (st.nearWhite > 0.08 || st.solidity > 0.8)) why = "many-coloured logo would lose its shape in white";
  if (why) return { png: await compose(n, WHITE, logo, logo.data), n, t: "mark-white", colour: WHITE, why };
  return { png: await compose(n, colour, logo, whiteOf(logo)), n, t: "mark", colour };
}

/** A team's logo at 64% on its colour; on white when a third or more of it (or of its outline) matches that colour. */
export async function teamArt(buf: Buffer, colour: string, scale = 0.64): Promise<{ png: Buffer; n: number; t: "team" | "team-white"; colour: string; vanish: number }> {
  const { n, logo } = await fit(buf, scale);
  const v = vanishes(logo, colour);
  if (v > 0.3) return { png: await compose(n, WHITE, logo, logo.data), n, t: "team-white", colour: WHITE, vanish: v };
  return { png: await compose(n, colour, logo, logo.data), n, t: "team", colour, vanish: v };
}

/** A flag (4:3), centred on white at 72% of the width. */
export async function flagArt(svg: Buffer): Promise<{ png: Buffer; n: number; colour: string }> {
  const { n, logo } = await fit(svg, 0.72, false);
  return { png: await compose(n, WHITE, logo, logo.data), n, colour: WHITE };
}

/* ---------- files ---------- */
/** The widths a square of side n is stored at: the ladder from n down (n itself when it's under 128). */
export const widthsFor = (n: number): number[] => { const w = LADDER.filter(s => s <= n); return w.length ? [...w] : [n]; };

export async function encodeLadder(png: Buffer, n: number): Promise<Array<{ w: number; fmt: "avif" | "webp"; buf: Buffer }>> {
  const out: Array<{ w: number; fmt: "avif" | "webp"; buf: Buffer }> = [];
  for (const w of widthsFor(n)) {
    const img = sharp(png).resize(w, w);
    out.push({ w, fmt: "avif", buf: await img.clone().avif({ quality: 60, effort: 4 }).toBuffer() });
    out.push({ w, fmt: "webp", buf: await img.clone().webp({ quality: 84 }).toBuffer() });
  }
  return out;
}

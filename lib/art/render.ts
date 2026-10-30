/* The treatments, drawn with sharp (server only; the art job runs them on Railway). No colour is added anywhere:
 * every artwork is the real picture.
 *   photoSquare  a tracker's photo, or a person's portrait, square (on the face for people), natural colour
 *   logoArt      a logo in its own colours, whole, centred at 64% on white
 *   flagArt      a country's flag, centred at 72% on white
 * Squares are 2048px when the source allows (vector logos always), else the source's own size: never upscaled.
 * encodeLadder writes AVIF and WebP at 2048/1024/512/256/128, as far down from the square's size as there are. */
import sharp, { type Sharp } from "sharp";

export const LADDER = [2048, 1024, 512, 256, 128] as const;
export const MAX = 2048;
const WHITE = "#FFFFFF";

/* ---------- colour ---------- */
export const hexToRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace("#", "").slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

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

async function compose(n: number, bg: string, logo: Raster): Promise<Buffer> {
  const layer = await sharp(logo.data, { raw: { width: logo.w, height: logo.h, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: n, height: n, channels: 3, background: bg } })
    .composite([{ input: layer, left: Math.round((n - logo.w) / 2), top: Math.round((n - logo.h) / 2) }]).png().toBuffer();
}

/** The square's size for a logo at a scale: 2048 for a vector, a bitmap's own size over the scale, never more. */
async function fit(buf: Buffer, scale: number, trim = true): Promise<{ n: number; logo: Raster & { vector: boolean } }> {
  const logo = await rasterLogo(buf, Math.round(MAX * scale), trim);
  return { n: logo.vector ? MAX : Math.min(MAX, Math.floor(Math.max(logo.w, logo.h) / scale)), logo };
}

/** A logo whole, in its own colours, centred at 64% on white. */
export async function logoArt(buf: Buffer, scale = 0.64): Promise<{ png: Buffer; n: number; colour: string }> {
  const { n, logo } = await fit(buf, scale);
  return { png: await compose(n, WHITE, logo), n, colour: WHITE };
}

/** A flag (4:3), centred on white at 72% of the width. */
export async function flagArt(svg: Buffer): Promise<{ png: Buffer; n: number; colour: string }> {
  const { n, logo } = await fit(svg, 0.72, false);
  return { png: await compose(n, WHITE, logo), n, colour: WHITE };
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

/* Each brand photo's ambient colour: sharp's dominant colour of public/brand/*.jpg → lib/brand/palette.json
 * ({ "basketball": "#3c4a5e", … }). Cards tint their background with it (components/brand/CategoryArt.tsx, app/brand.css),
 * so each row picks up its own colour from its photo. When the dominant colour is near-black or grey (most of these
 * are dusk photos), the photo's saturation-weighted colour is used instead, lifted to a usable brightness. Run again
 * whenever a photo changes:
 *   npx tsx scripts/brand-palette.ts */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = join(process.cwd(), "public/brand");
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

type RGB = { r: number; g: number; b: number };
const sat = ({ r, g, b }: RGB) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const toHex = (c: RGB) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;

/** sharp's dominant colour when it has colour to give; null when it's near-black or grey (a dusk photo's sky). */
function ambient(d: RGB): string | null {
  return Math.max(d.r, d.g, d.b) >= 96 && sat(d) >= 0.25 ? toHex(d) : null;
}

/** Otherwise the photo's colour: the mean of a small copy's pixels weighted by saturation, lifted to a usable
 *  brightness (its hue and saturation kept). */
async function vivid(file: string): Promise<string> {
  const { data, info } = await sharp(file).resize(48, 27, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const px = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }, k = sat(px) ** 2 * (Math.max(px.r, px.g, px.b) / 255);
    r += px.r * k; g += px.g * k; b += px.b * k; w += k;
  }
  if (!w) return "#3a3f4a";
  const c = { r: r / w, g: g / w, b: b / w }, mx = Math.max(c.r, c.g, c.b), lift = mx < 150 ? 150 / mx : 1;
  return toHex({ r: c.r * lift, g: c.g * lift, b: c.b * lift });
}

async function main() {
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).filter(x => /\.(jpe?g|png|webp|avif)$/i.test(x)).sort()) {
    if (/^email-|logo/i.test(f)) continue;
    const { dominant } = await sharp(join(dir, f)).stats();
    out[f.replace(/\.[a-z]+$/i, "")] = ambient(dominant) ?? await vivid(join(dir, f));
  }
  writeFileSync(join(process.cwd(), "lib/brand/palette.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(out);
}
main().catch(e => { console.error(e); process.exit(1); });

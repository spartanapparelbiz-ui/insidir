/* Every icon from the brand mark (components/brand/Bits.tsx Mark: the brackets), one source:
 *   public/favicon.ico            16, 32 and 48 px (browsers ask for /favicon.ico by default)
 *   public/apple-touch-icon.png   180 px (iOS asks for it at the root)
 *   public/icons/favicon.svg      the mark on black, rounded
 *   public/icons/icon-192.png, icon-512.png, maskable-512.png (the mark in the 80% safe zone), apple-touch-icon.png,
 *   badge-96.png (white on transparent, for notifications)
 *   npx tsx scripts/brand-icons.ts */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const MARK = '<rect x="0" y="0" width="40" height="18"/><rect x="0" y="0" width="18" height="46"/><rect x="46" y="18" width="18" height="46"/><rect x="24" y="46" width="40" height="18"/>';

/** The mark at `scale` of the tile, centred, white on black (or on nothing), with corner radius `r` (0..0.5). */
function svg(scale: number, opts: { bg?: boolean; r?: number } = {}): string {
  const s = 64 * scale, off = (64 - s) / 2, k = s / 64, r = (opts.r ?? 0.22) * 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${opts.bg === false ? "" : `<rect width="64" height="64" rx="${r}" fill="#000000"/>`}<g fill="#ffffff" transform="translate(${off.toFixed(2)} ${off.toFixed(2)}) scale(${k.toFixed(4)})">${MARK}</g></svg>`;
}

const png = (s: string, size: number) => sharp(Buffer.from(s), { density: Math.ceil((size / 64) * 72 * 2) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** An ICO holding PNG images (allowed since Vista; every current browser reads it). */
function ico(images: Array<{ size: number; data: Buffer }>): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(im.size >= 256 ? 0 : im.size, e); head.writeUInt8(im.size >= 256 ? 0 : im.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

async function main() {
  const tile = svg(0.62);
  writeFileSync("public/icons/favicon.svg", tile);
  // Small sizes: the mark a little larger, so it reads at 16 px.
  const small = svg(0.7, { r: 0.18 });
  writeFileSync("public/favicon.ico", ico(await Promise.all([16, 32, 48].map(async size => ({ size, data: await png(small, size) })))));
  // iOS draws its own rounded corners: a square tile.
  const square = svg(0.6, { r: 0 });
  const apple = await png(square, 180);
  writeFileSync("public/apple-touch-icon.png", apple);
  writeFileSync("public/icons/apple-touch-icon.png", apple);
  writeFileSync("public/icons/icon-192.png", await png(square, 192));
  writeFileSync("public/icons/icon-512.png", await png(square, 512));
  writeFileSync("public/icons/maskable-512.png", await png(svg(0.5, { r: 0 }), 512));
  writeFileSync("public/icons/badge-96.png", await png(svg(0.8, { bg: false }), 96));
  console.log("icons written");
}

void main();

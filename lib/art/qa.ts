/* QA for the art job, on Railway (ART_QA=1 npm run art): a contact sheet of 48 artworks at 2x (12 trackers, 8
 * people, 10 companies, 12 teams, 6 leagues and countries) as rounded squares of 88px, and the list of every entity
 * still on a monogram or a fallback, with why. Both go to the bucket (art/qa/) and, so they can be read without
 * bucket access, to the log as base64 lines "QA-FILE <name> <part>/<parts> <data>". Server only. */
import sharp, { type Sharp, type OverlayOptions } from "sharp";
import type { Db } from "@/lib/db";
import { entityArt } from "@/lib/db/schema";
import { getObject, bucket, putObject } from "./s3";

const TILE = 176, GAP = 32, COLS = 8;

export function dumpToLog(name: string, buf: Buffer): void {
  const b64 = buf.toString("base64"), size = 3000, parts = Math.ceil(b64.length / size);
  for (let i = 0; i < parts; i++) console.log(`QA-FILE ${name} ${i + 1}/${parts} ${b64.slice(i * size, (i + 1) * size)}`);
}

export async function artQa(db: Db): Promise<void> {
  const b = bucket()!;
  const all = await db.select().from(entityArt);
  const pick = (kind: string, n: number, prefer: (r: typeof all[number]) => number) =>
    all.filter(r => r.kind === kind).sort((x, y) => prefer(y) - prefer(x) || x.entityId.localeCompare(y.entityId)).slice(0, n);
  const hasFile = (r: typeof all[number]) => (r.key ? 1 : 0);
  const sheet = [
    ...pick("tracker", 12, hasFile),
    ...pick("person", 8, r => (r.treatment === "duotone" ? 2 : 0) + (r.entityId.includes("fig-") ? 0 : 1)),
    ...pick("company", 10, r => (r.treatment === "mark" ? 3 : r.treatment === "mark-white" ? 2 : r.key ? 1 : 0)),
    ...["team:nba:LAL", "team:nba:BOS", "team:nba:GSW", "team:nfl:KC", "team:nfl:DAL", "team:nfl:GB", "team:mlb:NYY", "team:mlb:LAD", "team:nhl:BOS", "team:nhl:NYR", "team:soccer:arsenal", "team:soccer:real-madrid"]
      .map(id => all.find(r => r.entityId === id)).filter((r): r is typeof all[number] => !!r),
    ...pick("league", 3, hasFile), ...["country:us", "country:ua", "country:gb"].map(id => all.find(r => r.entityId === id)).filter((r): r is typeof all[number] => !!r),
  ];
  const rows = Math.ceil(sheet.length / COLS);
  const W = GAP + COLS * (TILE + GAP), H = GAP + rows * (TILE + GAP);
  const mask = Buffer.from(`<svg width="${TILE}" height="${TILE}"><rect width="${TILE}" height="${TILE}" rx="${TILE * 0.22}" fill="#fff"/></svg>`);
  const ring = Buffer.from(`<svg width="${TILE}" height="${TILE}"><rect x=".5" y=".5" width="${TILE - 1}" height="${TILE - 1}" rx="${TILE * 0.22}" fill="none" stroke="rgba(0,0,0,.08)"/></svg>`);
  const layers: OverlayOptions[] = [];
  for (const [i, r] of sheet.entries()) {
    let tile: Buffer;
    if (r.key && r.sizes?.length) {
      const w = r.sizes.find(s => s >= TILE) ?? r.sizes[0]!;
      const res = await getObject(b, `${r.key}/${w}.webp`);
      tile = await sharp(Buffer.from(await res.arrayBuffer())).resize(TILE, TILE).png().toBuffer();
    } else {
      // A monogram, as the site draws it: initials on the colour.
      tile = await sharp(Buffer.from(`<svg width="${TILE}" height="${TILE}"><rect width="100%" height="100%" fill="${r.colour}"/><text x="50%" y="54%" font-family="sans-serif" font-weight="700" font-size="${TILE * 0.34}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${r.mono}</text></svg>`)).png().toBuffer();
    }
    const rounded = await sharp(tile).composite([{ input: mask, blend: "dest-in" }, { input: ring }]).png().toBuffer();
    layers.push({ input: rounded, left: GAP + (i % COLS) * (TILE + GAP), top: GAP + Math.floor(i / COLS) * (TILE + GAP) });
  }
  const png = await sharp({ create: { width: W, height: H, channels: 3, background: "#FFFFFF" } }).composite(layers).png().toBuffer();
  await putObject(b, "art/qa/contact-sheet.png", png, "image/png");
  dumpToLog("contact-sheet.webp", await sharp(png).webp({ quality: 92 }).toBuffer());

  const legend = sheet.map((r, i) => `${String(i + 1).padStart(2)} ${r.entityId} · ${r.label} · ${r.treatment}${r.w ? ` ${r.w}px` : ""} · ${r.colour}`).join("\n");
  const fallbacks = all.filter(r => r.treatment === "monogram" || r.why).sort((x, y) => x.kind.localeCompare(y.kind) || x.entityId.localeCompare(y.entityId))
    .map(r => `${r.entityId} · ${r.label} · ${r.treatment} · ${r.why ?? ""}`).join("\n");
  const counts = Object.entries(all.reduce<Record<string, number>>((a, r) => { const k = `${r.kind} ${r.treatment}`; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort().map(([k, v]) => `${k}: ${v}`).join("\n");
  const report = `ART QA\n\n${all.length} entities\n${counts}\n\nCONTACT SHEET (left to right, top to bottom)\n${legend}\n\nMONOGRAMS AND FALLBACKS\n${fallbacks}\n`;
  await putObject(b, "art/qa/report.txt", Buffer.from(report), "text/plain; charset=utf-8");
  dumpToLog("report.txt", Buffer.from(report));
}

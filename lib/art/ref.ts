/* One artwork per entity (a tracker, person, company, fund, team, league or country), as the page needs it: which
 * treatment, its colour (the placeholder while it loads and the field behind it), and where its files are. Made once by
 * the art job (lib/art/job.ts) on Railway, stored in the bucket, recorded in terminal.entity_art, and served at
 * /art/<key>/<size>.<avif|webp>. Client safe: no database or Node here. */

export type ArtKind = "tracker" | "person" | "company" | "fund" | "team" | "league" | "country";

/** photo: a tracker's Unsplash photo. duotone: a person's licensed photo, in their colour. mark: a logo in white on
 *  its brand colour. mark-white: a logo in full colour on white (it would vanish on its own colour). team / team-white:
 *  a team's logo on its colour, or on white. flag: a country's flag on white. monogram: initials on the entity's colour,
 *  when there's no licensed picture (no file). */
export type Treatment = "photo" | "duotone" | "mark" | "mark-white" | "team" | "team-white" | "flag" | "monogram";

export interface ArtRef {
  /** Entity id, "company:NVDA" (lib/art/ids.ts). */
  id: string;
  t: Treatment;
  /** The placeholder and background colour, "#RRGGBB". */
  c: string;
  /** Bucket key prefix of the files ("art/company/nvda/3f9a1c2e"); none for a monogram. */
  k?: string;
  /** Widths stored, largest first (2048, 1024, 512, 256, 128; never more than the source allows). */
  s?: number[];
  /** Focal point, 0–1, for crops that aren't square (21:9 headers). */
  fx?: number; fy?: number;
  /** Initials, for a monogram (and for a picture too small to show at the size asked). */
  m: string;
  /** What it is, in words ("NVIDIA"). */
  l: string;
  /** A tracker with no stored square yet: its photo straight from Unsplash's CDN. */
  u?: string;
}

/** The art's full-size width: what it may be shown at without being stretched. */
export const artWidth = (a: ArtRef): number => a.s?.[0] ?? 0;

/** The file URL for one width and format. */
export const artUrl = (a: ArtRef, w: number, fmt: "avif" | "webp"): string => `/${a.k}/${w}.${fmt}`;

/** Treatments that put a logo or flag in the middle of the square: a wide crop shows the colour around it whole,
 *  never cuts the logo. */
export const isCentred = (t: Treatment): boolean => t !== "photo" && t !== "duotone";

/** Treatments on white (they carry a hairline ring so the square still reads on a white page). */
export const onWhite = (t: Treatment): boolean => t === "mark-white" || t === "team-white" || t === "flag";

/** Ink or white initials, whichever reads on the colour. */
export function monogramInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return L > 0.42 ? "#0B0B12" : "#FFFFFF";
}

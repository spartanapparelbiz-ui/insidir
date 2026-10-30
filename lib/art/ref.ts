/* One artwork per entity (a tracker, person, company, fund, team, league or country), as the page needs it: which
 * treatment, its placeholder colour while it loads, and where its files are. Made once by
 * the art job (lib/art/job.ts) on Railway, stored in the bucket, recorded in terminal.entity_art, and served at
 * /art/<key>/<size>.<avif|webp>. Client safe: no database or Node here. */

export type ArtKind = "tracker" | "person" | "company" | "fund" | "team" | "league" | "country";

/** No colour is ever added: every artwork is the real picture. photo: a tracker's Unsplash photo, or a person's freely
 *  licensed portrait (Wikimedia Commons), natural colour. logo: a logo whole, in its own colours, on white. flag: a
 *  country's flag on white. initials: the last resort when there's no picture at all (no file), ink on light grey. */
export type Treatment = "photo" | "logo" | "flag" | "initials";

export interface ArtRef {
  /** Entity id, "company:NVDA" (lib/art/ids.ts). */
  id: string;
  t: Treatment;
  /** The placeholder while it loads: the photo's own dominant colour, or white behind a logo or flag. */
  c: string;
  /** Bucket key prefix of the files ("art/company/nvda/3f9a1c2e"); none for initials. */
  k?: string;
  /** Widths stored, largest first (2048, 1024, 512, 256, 128; never more than the source allows). */
  s?: number[];
  /** Focal point, 0–1, for crops that aren't square (21:9 headers). */
  fx?: number; fy?: number;
  /** Initials, the last resort (and for a picture too small to show at the size asked). */
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

/** A logo or flag sits in the middle of white: a wide crop shows the white around it, never cuts the logo. */
export const isCentred = (t: Treatment): boolean => t === "logo" || t === "flag";
